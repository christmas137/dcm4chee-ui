import { describe, expect, it } from 'vitest'
import { archiveDevice } from '../../../test/configFixtures'
import { buildInherited, buildSuggestions } from './refs'

describe('подсказки для полей-ссылок', () => {
  const suggestions = buildSuggestions({
    archive: archiveDevice(),
    aes: [
      { dicomAETitle: 'DCM4CHEE', dicomDescription: 'архив', dicomDeviceName: 'dcm4chee-arc' },
      { dicomAETitle: 'STORESCP', dicomDeviceName: 'storescp' },
    ],
    archiveAets: [{ dicomAETitle: 'DCM4CHEE' }],
    devices: [{ dicomDeviceName: 'dcm4chee-arc' }, { dicomDeviceName: 'storescp' }],
  })

  it('идентификаторы берутся из конфигурации архива, с пояснением', () => {
    expect(suggestions.dcmStorageID).toEqual([{ value: 'fs1', label: 'file:///storage/fs1/' }])
    expect(suggestions.dcmQueueName.map((item) => item.value)).toEqual(['Export1', 'StgCmtSCU'])
    expect(suggestions.dcmQueueName[0].label).toBe('Export Tasks 1')
    expect(suggestions.webApp).toEqual([{ value: 'DCM4CHEE', label: '/dcm4chee-arc/aets/DCM4CHEE/rs' }])
    expect(suggestions.dcmExporterID).toEqual([])
  })

  it('AE-титлы — со всех устройств, AE архива — отдельно', () => {
    expect(suggestions.dcmAETitle).toEqual([
      { value: 'DCM4CHEE', label: 'архив' },
      { value: 'STORESCP', label: 'storescp' },
    ])
    expect(suggestions.dcmArchiveAETitle.map((item) => item.value)).toEqual(['DCM4CHEE'])
    expect(suggestions.dicomDeviceName.map((item) => item.value)).toEqual(['dcm4chee-arc', 'storescp'])
  })

  it('без архива — пустые списки, а не падение', () => {
    const empty = buildSuggestions({})
    expect(empty.dcmStorageID).toEqual([])
    expect(empty.dcmAETitle).toEqual([])
  })
})

describe('наследование от устройства', () => {
  it('берёт одиночные значения dcmDevice и dcmArchiveDevice, списки записей — нет', () => {
    const inherited = buildInherited(archiveDevice())
    expect(inherited).toMatchObject({
      dcmQueryMaxNumberOfResults: 1000,
      dcmValidateCallingAEHostname: false,
      dcmHideSPSWithStatusFromMWL: ['COMPLETED'],
    })
    expect(inherited).not.toHaveProperty('dcmStorage')
    expect(inherited).not.toHaveProperty('dcmWebApp')
    expect(buildInherited(undefined)).toEqual({})
  })
})
