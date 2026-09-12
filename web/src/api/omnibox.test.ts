import { describe, expect, it } from 'vitest'
import { parseDateToken, parseQuery, tokenize } from './omnibox'
import { formatDA } from './dicom'

const today = formatDA(new Date())

describe('токенизация', () => {
  it('режет по пробелам и сохраняет кавычки', () => {
    expect(tokenize('Иванов CT  "КТ грудной клетки"')).toEqual(['Иванов', 'CT', 'КТ грудной клетки'])
  })
})

describe('даты', () => {
  it('понимает абсолютные форматы', () => {
    expect(parseDateToken('20240513')).toBe('20240513')
    expect(parseDateToken('2024-05-13')).toBe('20240513')
    expect(parseDateToken('13.05.2024')).toBe('20240513')
    expect(parseDateToken('3.5.2024')).toBe('20240503')
  })

  it('понимает периоды', () => {
    expect(parseDateToken('2024')).toBe('20240101-20241231')
    expect(parseDateToken('2024-02')).toBe('20240201-20240229') // високосный
    expect(parseDateToken('202405')).toBe('20240501-20240531')
  })

  it('понимает диапазоны', () => {
    expect(parseDateToken('20240101-20240131')).toBe('20240101-20240131')
    expect(parseDateToken('13.05.2024..20.05.2024')).toBe('20240513-20240520')
  })

  it('понимает относительные периоды', () => {
    expect(parseDateToken('сегодня')).toBe(today)
    expect(parseDateToken('today')).toBe(today)
    expect(parseDateToken('7д')).toMatch(/^\d{8}-\d{8}$/)
    expect(parseDateToken('месяц')).toMatch(/^\d{8}-\d{8}$/)
  })

  it('не считает датой что попало', () => {
    expect(parseDateToken('99999999')).toBeUndefined()
    expect(parseDateToken('20241332')).toBeUndefined()
    expect(parseDateToken('Иванов')).toBeUndefined()
  })
})

describe('разбор запроса', () => {
  it('фамилия превращается в маску по PatientName', () => {
    expect(parseQuery('Иванов').base).toEqual({ PatientName: '*Иванов*' })
  })

  it('несколько слов имени склеиваются в одну маску', () => {
    expect(parseQuery('Иванов Иван').base.PatientName).toBe('*Иванов*Иван*')
  })

  it('не трогает маску, заданную руками', () => {
    expect(parseQuery('Иван*').base.PatientName).toBe('Иван*')
  })

  it('узнаёт модальности и складывает их через backslash', () => {
    expect(parseQuery('ct mr').base.ModalitiesInStudy).toBe('CT\\MR')
  })

  it('собирает разнородный запрос', () => {
    const { base } = parseQuery('Петрова CT 20240513')
    expect(base).toEqual({
      PatientName: '*Петрова*',
      ModalitiesInStudy: 'CT',
      StudyDate: '20240513',
    })
  })

  it('узнаёт StudyInstanceUID', () => {
    const uid = '1.2.826.0.1.3680043.8.498.12345'
    expect(parseQuery(uid).base.StudyInstanceUID).toBe(uid)
  })

  it('поддерживает явные префиксы', () => {
    const { base } = parseQuery('acc:ACC20000 pid:P-1001 desc:грудной date:сегодня mod:ct,mr')
    expect(base).toEqual({
      AccessionNumber: 'ACC20000',
      PatientID: 'P-1001',
      StudyDescription: '*грудной*',
      StudyDate: today,
      ModalitiesInStudy: 'CT\\MR',
    })
  })

  it('двоеточие с неизвестным префиксом не ломает разбор', () => {
    expect(parseQuery('xyz:значение').base.PatientName).toBe('*xyz:значение*')
  })
})

describe('неоднозначные идентификаторы', () => {
  it('цифровой токен пробуется сначала как ID пациента', () => {
    const { variants } = parseQuery('1001')
    expect(variants.map((v) => Object.keys(v.params)[0])).toEqual([
      'PatientID', 'AccessionNumber', 'PatientName',
    ])
    expect(variants[0].hint).toBeUndefined()
    expect(variants[1].hint).toBe('по номеру назначения')
  })

  it('буквенно-цифровой — сначала как номер назначения', () => {
    const { variants } = parseQuery('ACC20000')
    expect(variants[0].params.AccessionNumber).toBe('ACC20000')
    expect(variants[1].params.PatientID).toBe('ACC20000')
  })

  it('однозначный запрос даёт ровно один вариант', () => {
    expect(parseQuery('Иванов').variants).toHaveLength(1)
    expect(parseQuery('').variants).toEqual([{ params: {} }])
  })

  it('фильтры из остальных токенов попадают в каждый вариант', () => {
    const { variants } = parseQuery('P-1001 CT')
    for (const variant of variants) {
      expect(variant.params.ModalitiesInStudy).toBe('CT')
    }
  })
})
