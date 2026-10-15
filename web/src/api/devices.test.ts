import { describe, expect, it } from 'vitest'
import { aeConnections, connectionIndex, connectionRef, describeConnection } from './devices'
import { archiveDevice } from '../test/configFixtures'

describe('ссылки AE на соединения', () => {
  it('индекс ↔ ссылка', () => {
    expect(connectionRef(1)).toBe('/dicomNetworkConnection/1')
    expect(connectionIndex('/dicomNetworkConnection/1')).toBe(1)
  })

  it('чужие и битые ссылки не принимаются', () => {
    expect(connectionIndex('/dicomNetworkAE/0')).toBeUndefined()
    expect(connectionIndex('/dicomNetworkConnection/x')).toBeUndefined()
    expect(connectionIndex('/dicomNetworkConnection/-1')).toBeUndefined()
  })

  it('соединения AE резолвятся по ссылкам, висячие ссылки пропускаются', () => {
    const device = archiveDevice()
    const ae = { ...device.dicomNetworkAE![0], dicomNetworkConnectionReference: ['/dicomNetworkConnection/1', '/dicomNetworkConnection/7'] }
    expect(aeConnections(device, ae).map((c) => c.cn)).toEqual(['dicom-tls'])
  })
})

describe('подпись соединения', () => {
  it('хост:порт и пометка TLS', () => {
    expect(describeConnection({ dicomHostname: 'arc', dicomPort: 11112 })).toBe('arc:11112')
    expect(describeConnection({ dicomHostname: 'arc', dicomPort: 2762, dicomTLSCipherSuite: ['X'] })).toBe('arc:2762 TLS')
    expect(describeConnection({ dicomHostname: 'arc' })).toBe('arc')
    expect(describeConnection({})).toBe('—')
  })
})
