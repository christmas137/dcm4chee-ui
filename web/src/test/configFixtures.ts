/**
 * Фейковая конфигурация dcm4chee: устройства в памяти. Запись (POST/PUT/DELETE) меняет
 * хранилище, и следующее чтение видит изменения — как на настоящем сервере.
 */
import type { Device } from '../api/devices'
import { FakeArchive } from './fakeArchive'
import { AETS } from './fixtures'

export function archiveDevice(): Device {
  return {
    dicomDeviceName: 'dcm4chee-arc',
    dicomInstalled: true,
    dicomNetworkConnection: [
      { cn: 'dicom', dicomHostname: 'arc', dicomPort: 11112, dcmNetworkConnection: {} },
      { cn: 'dicom-tls', dicomHostname: 'arc', dicomPort: 2762, dicomTLSCipherSuite: ['TLS_RSA_WITH_AES_128_CBC_SHA'] },
    ],
    dicomNetworkAE: [
      {
        dicomAETitle: 'DCM4CHEE',
        dicomDescription: 'Hide instances rejected for Quality Reasons',
        dicomAssociationInitiator: true,
        dicomAssociationAcceptor: true,
        dicomNetworkConnectionReference: ['/dicomNetworkConnection/0', '/dicomNetworkConnection/1'],
        dicomTransferCapability: [
          { cn: 'CT Image Storage SCP', dicomSOPClass: '1.2.840.10008.5.1.4.1.1.2', dicomTransferRole: 'SCP',
            dicomTransferSyntax: ['1.2.840.10008.1.2', '1.2.840.10008.1.2.1'] },
        ],
        dcmNetworkAE: { dcmQueryRetrieveViewID: 'hideRejected' },
      },
      {
        dicomAETitle: 'WORKLIST',
        dicomDescription: 'Modality and Unified Worklist',
        dicomAssociationInitiator: true,
        dicomAssociationAcceptor: true,
        dicomNetworkConnectionReference: ['/dicomNetworkConnection/0'],
      },
    ],
    dcmDevice: {
      dcmWebApp: [{ dcmWebAppName: 'DCM4CHEE', dcmWebServicePath: '/dcm4chee-arc/aets/DCM4CHEE/rs', dicomAETitle: 'DCM4CHEE' }],
      dcmArchiveDevice: {
        dcmFuzzyAlgorithmClass: 'org.dcm4che3.soundex.ESoundex',
        dcmPurgeQueueMessagePollingInterval: 'PT1H',
        dcmValidateCallingAEHostname: false,
        dcmQueryMaxNumberOfResults: 1000,
        dcmHideSPSWithStatusFromMWL: ['COMPLETED'],
        dcmStorage: [{ dcmStorageID: 'fs1', dcmURI: 'file:///storage/fs1/', dcmDigestAlgorithm: 'MD5' }],
        dcmQueue: [
          { dcmQueueName: 'Export1', dicomDescription: 'Export Tasks 1', dcmMaxRetries: 10 },
          { dcmQueueName: 'StgCmtSCU', dicomDescription: 'Storage Commitment', dcmMaxRetries: 10 },
        ],
        dcmExporter: [],
      },
    },
  }
}

export function storescpDevice(): Device {
  return {
    dicomDeviceName: 'storescp',
    dicomInstalled: true,
    dicomNetworkConnection: [{ cn: 'dicom', dicomHostname: 'storescp', dicomPort: 11117 }],
    dicomNetworkAE: [{
      dicomAETitle: 'STORESCP',
      dicomAssociationInitiator: true,
      dicomAssociationAcceptor: true,
      dicomNetworkConnectionReference: ['/dicomNetworkConnection/0'],
    }],
  }
}

/** Глубокая копия — чтобы тест мог сравнивать «до» и «после» записи. */
export const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export function configArchive(devices: Device[] = [archiveDevice(), storescpDevice()]) {
  const store = new Map(devices.map((device) => [device.dicomDeviceName, clone(device)]))
  const archive = new FakeArchive()
  const name = (path: string) => decodeURIComponent(path.split('/')[2])

  archive.on('GET', '/aets', AETS)
  archive.on('GET', /^\/aets\/[^/]+\/rs\/studies(\/count|\/size)?$/, undefined)
  archive.on('GET', '/devices', () => [...store.values()].map((device) => ({
    dicomDeviceName: device.dicomDeviceName,
    dicomDescription: device.dicomDescription,
    dicomInstalled: device.dicomInstalled,
    ...(device.dcmDevice && (device.dcmDevice as Record<string, unknown>).dcmArchiveDevice ? { hasArcDevExt: true } : {}),
  })))
  archive.on('GET', '/aes', () => [...store.values()].flatMap((device) => (device.dicomNetworkAE ?? []).map((ae) => ({
    dicomDeviceName: device.dicomDeviceName,
    dicomAETitle: ae.dicomAETitle,
    dicomDescription: ae.dicomDescription,
    dicomAssociationInitiator: ae.dicomAssociationInitiator,
    dicomAssociationAcceptor: ae.dicomAssociationAcceptor,
    dicomNetworkConnection: (ae.dicomNetworkConnectionReference ?? []).map((ref) => {
      const connection = device.dicomNetworkConnection?.[Number(ref.split('/').pop())]
      return { dicomHostname: connection?.dicomHostname, dicomPort: connection?.dicomPort,
        ...(connection?.dicomTLSCipherSuite ? { dicomTLSCipherSuite: connection.dicomTLSCipherSuite } : {}) }
    }),
  }))))
  archive.on('GET', '/unique/aets', () => [...store.values()].flatMap((d) => (d.dicomNetworkAE ?? []).map((ae) => ae.dicomAETitle)))
  archive.on('GET', /^\/devices\/[^/]+$/, ({ path }) => clone(store.get(name(path))))
  archive.on('PUT', /^\/devices\/[^/]+$/, ({ path, body }) => {
    store.set(name(path), body as Device)
    return undefined
  })
  archive.on('POST', /^\/devices\/[^/]+$/, ({ path, body }) => {
    store.set(name(path), body as Device)
    return undefined
  })
  archive.on('DELETE', /^\/devices\/[^/]+$/, ({ path }) => {
    store.delete(name(path))
    return undefined
  })
  archive.on('POST', '/ctrl/reload', undefined)

  return Object.assign(archive, { store })
}
