import { describe, expect, it } from 'vitest'
import { filterRows, flattenDataset, formatValue, tagQuery } from './metadata'
import type { DicomJson } from './dicom'

const names: Record<string, string> = {
  '00080100': 'CodeValue',
  '00080104': 'CodeMeaning',
  '00081032': 'ProcedureCodeSequence',
  '00100010': 'PatientName',
  '00280030': 'PixelSpacing',
  '7FE00010': 'PixelData',
}
const nameOf = (tag: string) => names[tag] ?? tag

const ds: DicomJson = {
  '00280030': { vr: 'DS', Value: [0.6, 0.6] },
  '00100010': { vr: 'PN', Value: [{ Alphabetic: 'Иванов^Иван' }] },
  '00081032': {
    vr: 'SQ',
    Value: [
      { '00080100': { vr: 'SH', Value: ['CTCHEST'] }, '00080104': { vr: 'LO', Value: ['КТ грудной клетки'] } },
      { '00080100': { vr: 'SH', Value: ['CTABD'] } },
    ],
  },
  '7FE00010': { vr: 'OW', BulkDataURI: 'http://arc/bulk' },
}

describe('форматирование значения по VR', () => {
  it('PN — как в DICOM, с ^ и компонентами через =', () => {
    expect(formatValue({ vr: 'PN', Value: [{ Alphabetic: 'Иванов^Иван' }] })).toBe('Иванов^Иван')
    expect(formatValue({ vr: 'PN', Value: [{ Alphabetic: 'Yamada^Tarou', Ideographic: '山田^太郎' }] }))
      .toBe('Yamada^Tarou=山田^太郎')
  })

  it('мультизначения через обратный слэш', () => {
    expect(formatValue({ vr: 'DS', Value: [0.6, 0.6] })).toBe('0.6 \\ 0.6')
    expect(formatValue({ vr: 'CS', Value: ['ORIGINAL', 'PRIMARY', 'AXIAL'] })).toBe('ORIGINAL \\ PRIMARY \\ AXIAL')
  })

  it('бинарные данные не тащит в интерфейс', () => {
    expect(formatValue({ vr: 'OW', BulkDataURI: 'http://arc/bulk' })).toBe('бинарные данные')
    // 8 символов base64 = 6 байт, «==» в хвосте — минус два.
    expect(formatValue({ vr: 'OB', InlineBinary: 'AAECAw==' })).toBe('бинарные данные, 4 Б')
  })

  it('последовательность — количеством элементов', () => {
    expect(formatValue({ vr: 'SQ', Value: [{}, {}] })).toBe('2 элемента')
    expect(formatValue({ vr: 'SQ', Value: [{}] })).toBe('1 элемент')
  })

  it('пустое значение — пустая строка', () => {
    expect(formatValue({ vr: 'LO' })).toBe('')
    expect(formatValue({ vr: 'LO', Value: [] })).toBe('')
  })
})

describe('раскладка датасета', () => {
  const rows = flattenDataset(ds)

  it('идёт по тегам по возрастанию, как в файле', () => {
    const topLevel = rows.filter((row) => row.depth === 0).map((row) => row.tag)
    expect(topLevel).toEqual(['00081032', '00100010', '00280030', '7FE00010'])
  })

  it('разворачивает последовательность: строка SQ, элементы, их содержимое с отступом', () => {
    const inside = rows.filter((row) => row.key.startsWith('00081032'))
    expect(inside.map((row) => [row.kind, row.depth, row.key])).toEqual([
      ['sequence', 0, '00081032'],
      ['item', 1, '00081032[0]'],
      ['element', 2, '00081032[0].00080100'],
      ['element', 2, '00081032[0].00080104'],
      ['item', 1, '00081032[1]'],
      ['element', 2, '00081032[1].00080100'],
    ])
    expect(inside[0].value).toBe('2 элемента')
  })

  it('помнит предков у вложенных строк', () => {
    const code = rows.find((row) => row.key === '00081032[0].00080100')!
    expect(code.ancestors).toEqual(['00081032', '00081032[0]'])
  })

  it('ключи строк уникальны', () => {
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
  })
})

describe('поиск по метаданным', () => {
  const rows = flattenDataset(ds)
  const keys = (query: string) => filterRows(rows, query, nameOf).map((row) => row.key)

  it('пустой запрос — всё', () => {
    expect(keys('  ')).toHaveLength(rows.length)
  })

  it.each(['(0010,0010)', '0010,0010', '00100010', '0010 0010'])('по тегу в форме %s', (query) => {
    expect(keys(query)).toEqual(['00100010'])
  })

  it('по префиксу группы', () => {
    expect(keys('0028')).toEqual(['00280030'])
  })

  it('по имени тега без учёта регистра', () => {
    expect(keys('patientname')).toEqual(['00100010'])
  })

  it('по значению', () => {
    expect(keys('иванов')).toEqual(['00100010'])
  })

  it('найденное внутри последовательности показывает вместе с предками', () => {
    expect(keys('CTCHEST')).toEqual(['00081032', '00081032[0]', '00081032[0].00080100'])
  })

  it('найденная последовательность раскрывается целиком', () => {
    expect(keys('ProcedureCodeSequence')).toEqual([
      '00081032', '00081032[0]', '00081032[0].00080100', '00081032[0].00080104',
      '00081032[1]', '00081032[1].00080100',
    ])
  })

  it('распознаёт запрос-тег только из hex-цифр', () => {
    expect(tagQuery('(0010,0010)')).toBe('00100010')
    expect(tagQuery('7fe0')).toBe('7FE0')
    expect(tagQuery('Иванов')).toBeUndefined()
    expect(tagQuery('001')).toBeUndefined()
  })
})
