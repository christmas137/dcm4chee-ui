import { describe, expect, it } from 'vitest'
import {
  asString, asStringList, parseValue, stringifyValue, validateSettingsSearch, validateStudiesSearch,
} from './searchParams'

describe('значения в адресной строке', () => {
  it('строки пишутся без JSON-кавычек, списки — через запятую', () => {
    expect(stringifyValue('20260912')).toBe('20260912')
    expect(stringifyValue('Иванов')).toBe('Иванов')
    expect(stringifyValue(['CT', 'MR'])).toBe('CT,MR')
    expect(stringifyValue({ a: 1 })).toBe('{"a":1}')
  })

  it('читаются обратно', () => {
    expect(parseValue('Иванов')).toBe('Иванов')
    expect(parseValue('20260912')).toBe(20260912)
    expect(parseValue('CT,MR')).toBe('CT,MR')
    // ID пациента с ведущим нулём — не число (невалидный JSON), остаётся строкой.
    expect(parseValue('0012')).toBe('0012')
  })

  it('число из URL — тоже строка-фильтр', () => {
    expect(asString(20260912)).toBe('20260912')
    expect(asString('')).toBeUndefined()
    expect(asString({})).toBeUndefined()
  })

  it('список модальностей понимает и строку, и массив', () => {
    expect(asStringList('CT,MR')).toEqual(['CT', 'MR'])
    expect(asStringList(['CT', ' MR '])).toEqual(['CT', 'MR'])
    expect(asStringList('')).toBeUndefined()
    expect(asStringList(undefined)).toBeUndefined()
  })
})

describe('параметры экранов', () => {
  it('исследования: полный набор переживает разбор', () => {
    expect(validateStudiesSearch({
      q: 30001, from: 20260901, to: '20260912', mod: 'CT,MR', sort: '-PatientName',
      study: '1.2.3', series: '1.2.3.1', sop: '1.2.3.1.5', pane: 'meta',
    })).toEqual({
      q: '30001', from: '20260901', to: '20260912', mod: ['CT', 'MR'], sort: '-PatientName',
      study: '1.2.3', series: '1.2.3.1', sop: '1.2.3.1.5', pane: 'meta',
    })
  })

  it('исследования: мусор отбрасывается', () => {
    expect(validateStudiesSearch({ pane: 'hack', mod: 5, junk: 'x' })).toEqual({
      q: undefined, from: undefined, to: undefined, mod: ['5'], sort: undefined,
      study: undefined, series: undefined, sop: undefined, pane: undefined,
    })
  })

  it('конфигурация: только известные вкладки', () => {
    expect(validateSettingsSearch({ tab: 'archive', section: 'dcmDevice/dcmArchiveDevice/dcmStorage' }))
      .toMatchObject({ tab: 'archive', section: 'dcmDevice/dcmArchiveDevice/dcmStorage' })
    expect(validateSettingsSearch({ tab: 'root' }).tab).toBeUndefined()
  })
})
