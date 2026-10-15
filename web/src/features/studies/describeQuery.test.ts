import { describe, expect, it } from 'vitest'
import { describeParams, formatDateRange } from './describeQuery'

describe('диапазон дат словами', () => {
  it('один день, диапазон, открытые границы', () => {
    expect(formatDateRange('20260912')).toBe('12.09.2026')
    expect(formatDateRange('20260905-20260912')).toBe('05.09.2026 – 12.09.2026')
    expect(formatDateRange('20260101-')).toBe('с 01.01.2026')
    expect(formatDateRange('-20260131')).toBe('по 31.01.2026')
  })
})

describe('параметры QIDO словами', () => {
  it('в устойчивом порядке, модальности — списком', () => {
    expect(describeParams({
      ModalitiesInStudy: 'CT\\MR',
      StudyDate: '20260912',
      PatientName: '*Иванов*',
      limit: '100',
    })).toEqual([
      { key: 'PatientName', label: 'пациент', value: '*Иванов*' },
      { key: 'StudyDate', label: 'дата', value: '12.09.2026' },
      { key: 'ModalitiesInStudy', label: 'модальность', value: 'CT\\MR', modalities: ['CT', 'MR'] },
    ])
  })

  it('служебные параметры не показываются', () => {
    expect(describeParams({ includefield: 'StudyDescription', orderby: '-StudyDate' })).toEqual([])
  })
})
