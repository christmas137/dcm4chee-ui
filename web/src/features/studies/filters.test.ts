import { describe, expect, it } from 'vitest'
import { DATE_PRESETS, dateRangeParam, withUiFilters } from './filters'

describe('пресеты дат', () => {
  it('«Все даты» явно затирают границы, а не отдают пустой объект', () => {
    const range = DATE_PRESETS[0].range()
    // Пустой объект в патче навигации ничего бы не сбросил — фильтр залипал бы в URL.
    expect(Object.keys(range).sort()).toEqual(['from', 'to'])
    expect(range.from).toBeUndefined()
    expect(range.to).toBeUndefined()
  })

  it('каждый пресет отдаёт обе границы', () => {
    for (const preset of DATE_PRESETS) {
      const range = preset.range()
      expect(Object.keys(range).sort(), preset.label).toEqual(['from', 'to'])
    }
  })

  it('«Сегодня» — один день', () => {
    const { from, to } = DATE_PRESETS[1].range()
    expect(from).toBe(to)
    expect(from).toMatch(/^\d{8}$/)
  })
})

describe('диапазон в параметр QIDO', () => {
  it('складывает границы', () => {
    expect(dateRangeParam('20240101', '20240131')).toBe('20240101-20240131')
    expect(dateRangeParam('20240101', '20240101')).toBe('20240101')
    expect(dateRangeParam('20240101', undefined)).toBe('20240101-')
    expect(dateRangeParam(undefined, '20240131')).toBe('-20240131')
    expect(dateRangeParam(undefined, undefined)).toBeUndefined()
  })
})

describe('чипы поверх текста запроса', () => {
  const variants = [{ params: { PatientName: '*Иванов*', StudyDate: '20200101' } }]

  it('перекрывают дату из текста', () => {
    const [variant] = withUiFilters(variants, { from: '20240101', to: '20240131' })
    expect(variant.params.StudyDate).toBe('20240101-20240131')
    expect(variant.params.PatientName).toBe('*Иванов*')
  })

  it('без чипов оставляют варианты как есть', () => {
    expect(withUiFilters(variants, {})).toBe(variants)
  })

  it('модальности склеиваются через backslash', () => {
    const [variant] = withUiFilters(variants, { mod: ['CT', 'MR'] })
    expect(variant.params.ModalitiesInStudy).toBe('CT\\MR')
  })
})
