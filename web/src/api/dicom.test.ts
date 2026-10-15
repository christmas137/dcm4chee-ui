import { describe, expect, it } from 'vitest'
import { formatBytes, formatDateTime, parseDA, personName, str, num, strings } from './dicom'
import type { DicomJson } from './dicom'
import { fallbackDictionary, loadTagDictionary } from './tagNames'

const study: DicomJson = {
  '00100010': { vr: 'PN', Value: [{ Alphabetic: 'Иванов^Иван^Иванович' }] },
  '00080020': { vr: 'DA', Value: ['20240513'] },
  '00080030': { vr: 'TM', Value: ['142530.000'] },
  '00080061': { vr: 'CS', Value: ['CT', 'SR'] },
  '00201208': { vr: 'IS', Value: [49] },
  '00081030': { vr: 'LO' },
}

describe('DICOM JSON helpers', () => {
  it('читает PN как строку', () => {
    expect(str(study, '00100010')).toBe('Иванов^Иван^Иванович')
    expect(personName(str(study, '00100010'))).toBe('Иванов Иван Иванович')
  })

  it('возвращает undefined для отсутствующего и пустого тега', () => {
    expect(str(study, '00081030')).toBeUndefined()
    expect(str(study, '99999999')).toBeUndefined()
    expect(num(undefined, '00201208')).toBeUndefined()
  })

  it('читает мультизначные и числовые теги', () => {
    expect(strings(study, '00080061')).toEqual(['CT', 'SR'])
    expect(num(study, '00201208')).toBe(49)
  })

  it('разбирает и форматирует дату/время', () => {
    expect(parseDA('20240513')?.getMonth()).toBe(4)
    expect(parseDA('')).toBeUndefined()
    expect(formatDateTime('20240513', '142530.000')).toBe('13.05.2024 14:25')
    expect(formatDateTime('20240513')).toBe('13.05.2024')
  })

  it('форматирует размер', () => {
    expect(formatBytes(0)).toBe('0 Б')
    expect(formatBytes(1536)).toBe('1,5 КБ') // десятичная запятая
    expect(formatBytes(21250688)).toBe('20 МБ')
    expect(formatBytes(undefined)).toBe('')
  })
})

describe('словарь тегов', () => {
  it('отдаёт имена известных тегов', async () => {
    const dict = await loadTagDictionary()
    expect(dict.name('00100010')).toBe('PatientName')
    expect(dict.name('0020000D')).toBe('StudyInstanceUID')
    expect(dict.vr('00100010')).toBe('PN')
  })

  it('неизвестный тег отдаёт как (gggg,eeee)', async () => {
    const dict = await loadTagDictionary()
    expect(dict.name('00111001')).toBe('(0011,1001)')
  })

  it('до загрузки словаря показывает тег в скобках', () => {
    expect(fallbackDictionary.name('00100010')).toBe('(0010,0010)')
  })
})
