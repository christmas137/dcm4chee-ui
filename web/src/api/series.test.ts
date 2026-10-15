import { describe, expect, it } from 'vitest'
import { instancePath, sortSeries, thumbnailUrl, toInstanceRow, toSeriesRow } from './series'

describe('строки серий и снимков из QIDO', () => {
  it('серия: номер и число снимков приходят строками (IS) — превращаем в числа', () => {
    expect(toSeriesRow({
      '0020000E': { vr: 'UI', Value: ['1.2.3'] },
      '00200011': { vr: 'IS', Value: ['2'] },
      '0008103E': { vr: 'LO', Value: ['Chest 1.0mm'] },
      '00080060': { vr: 'CS', Value: ['CT'] },
      '00201209': { vr: 'IS', Value: ['24'] },
    })).toEqual({
      seriesUID: '1.2.3', number: 2, description: 'Chest 1.0mm', modality: 'CT', instances: 24, bodyPart: undefined,
    })
  })

  it('снимок: номер, кадры, размер', () => {
    expect(toInstanceRow({
      '00080018': { vr: 'UI', Value: ['1.2.3.4'] },
      '00200013': { vr: 'IS', Value: ['5'] },
      '00280008': { vr: 'IS', Value: ['30'] },
      '00280010': { vr: 'US', Value: [512] },
      '00280011': { vr: 'US', Value: [512] },
    })).toMatchObject({ sopUID: '1.2.3.4', number: 5, frames: 30, rows: 512, columns: 512 })
  })

  it('серии сортируются по номеру, без номера — в конце', () => {
    const sorted = sortSeries([
      { seriesUID: 'c', number: 3 },
      { seriesUID: 'x' },
      { seriesUID: 'a', number: 1 },
      { seriesUID: 'b', number: 2 },
    ])
    expect(sorted.map((s) => s.seriesUID)).toEqual(['a', 'b', 'c', 'x'])
  })
})

describe('адреса', () => {
  it('путь до снимка', () => {
    expect(instancePath('DCM4CHEE', '1.1', '1.2', '1.3')).toBe('/aets/DCM4CHEE/rs/studies/1.1/series/1.2/instances/1.3')
  })

  it('превью серии и снимка', () => {
    expect(thumbnailUrl('DCM4CHEE', '1.1', '1.2')).toBe('/dcm4chee-arc/aets/DCM4CHEE/rs/studies/1.1/series/1.2/thumbnail')
    expect(thumbnailUrl('DCM4CHEE', '1.1', '1.2', '1.3'))
      .toBe('/dcm4chee-arc/aets/DCM4CHEE/rs/studies/1.1/series/1.2/instances/1.3/thumbnail')
  })
})
