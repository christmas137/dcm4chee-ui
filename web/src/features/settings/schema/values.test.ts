import { describe, expect, it } from 'vitest'
import { getIn, isEmptyValue, sameValue, setIn } from './values'

const device = {
  dicomDeviceName: 'dcm4chee-arc',
  dicomNetworkAE: [{ dicomAETitle: 'DCM4CHEE', dcmNetworkAE: { dcmArchiveNetworkAE: { dcmQueryRetrieveViewID: 'hideRejected' } } }],
  dcmDevice: { dcmWebApp: [{ dcmWebAppName: 'DCM4CHEE' }], dcmArchiveDevice: { dcmFuzzyAlgorithmClass: 'org.dcm4che3.soundex.ESoundex' } },
}

describe('путь в конфигурации', () => {
  it('читает значение через объекты и списки', () => {
    expect(getIn(device, ['dcmDevice', 'dcmArchiveDevice', 'dcmFuzzyAlgorithmClass'])).toBe('org.dcm4che3.soundex.ESoundex')
    expect(getIn(device, ['dicomNetworkAE', 0, 'dcmNetworkAE', 'dcmArchiveNetworkAE', 'dcmQueryRetrieveViewID'])).toBe('hideRejected')
    expect(getIn(device, ['нет', 'такого'])).toBeUndefined()
  })

  it('пишет значение, не меняя исходный объект и соседние ветки', () => {
    const next = setIn(device, ['dcmDevice', 'dcmArchiveDevice', 'dcmFuzzyAlgorithmClass'], 'x')
    expect(getIn(next, ['dcmDevice', 'dcmArchiveDevice', 'dcmFuzzyAlgorithmClass'])).toBe('x')
    expect(device.dcmDevice.dcmArchiveDevice.dcmFuzzyAlgorithmClass).toBe('org.dcm4che3.soundex.ESoundex')
    expect(next.dcmDevice.dcmWebApp).toBe(device.dcmDevice.dcmWebApp)
  })

  it('пишет внутрь элемента списка, список остаётся списком', () => {
    const next = setIn(device, ['dicomNetworkAE', 0, 'dicomDescription'], 'архив')
    expect(Array.isArray(next.dicomNetworkAE)).toBe(true)
    expect(next.dicomNetworkAE[0]).toMatchObject({ dicomAETitle: 'DCM4CHEE', dicomDescription: 'архив' })
    expect(device.dicomNetworkAE[0]).not.toHaveProperty('dicomDescription')
  })

  it('создаёт недостающие узлы', () => {
    expect(setIn({}, ['a', 'b', 'c'], 1)).toEqual({ a: { b: { c: 1 } } })
  })

  it('пустое значение удаляет ключ — у архива это «вернуть умолчание»', () => {
    for (const empty of [undefined, '', []]) {
      const next = setIn(device, ['dcmDevice', 'dcmArchiveDevice', 'dcmFuzzyAlgorithmClass'], empty)
      expect(next.dcmDevice.dcmArchiveDevice).not.toHaveProperty('dcmFuzzyAlgorithmClass')
    }
    // false и 0 — это значения, а не пустота.
    expect(setIn({}, ['flag'], false)).toEqual({ flag: false })
    expect(setIn({}, ['count'], 0)).toEqual({ count: 0 })
  })
})

describe('сравнение значений', () => {
  it('пустые значения равны между собой, остальное — по содержимому', () => {
    expect(isEmptyValue([])).toBe(true)
    expect(isEmptyValue(0)).toBe(false)
    expect(sameValue(undefined, [])).toBe(true)
    expect(sameValue(['a'], ['a'])).toBe(true)
    expect(sameValue(['a'], ['b'])).toBe(false)
    expect(sameValue(false, undefined)).toBe(false)
  })
})
