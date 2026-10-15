import { describe, expect, it } from 'vitest'
import { fetchStudiesPage, PAGE_SIZE, toStudyRow } from './studies'
import { parseQuery } from './omnibox'
import { IVANOV_CHEST, PETROVA_MR, standardArchive, studyJson } from '../test/fixtures'

describe('строка списка из QIDO', () => {
  it('собирает все колонки, включая размер из приватного тега', () => {
    expect(toStudyRow(studyJson(IVANOV_CHEST))).toMatchObject({
      studyUID: '1.2.3.100',
      patientName: 'Иванов Иван Иванович',
      patientID: 'P-1001',
      birthDate: '19640312',
      sex: 'M',
      studyDate: '20260912',
      studyTime: '084717',
      accession: 'ACC20000',
      description: 'КТ органов грудной клетки',
      modalities: ['CT'],
      series: 3,
      instances: 49,
      sizeKB: 1669,
    })
  })
})

describe('страница поиска', () => {
  it('просит у QIDO описание и размер, страницу и сортировку', async () => {
    const archive = standardArchive().install()
    await fetchStudiesPage('DCM4CHEE', parseQuery('').variants, '-StudyDate,-StudyTime', { offset: 0, variantIndex: 0 })
    const [request] = archive.calls('GET', '/aets/DCM4CHEE/rs/studies')
    expect(request.params.getAll('includefield')).toEqual(['StudyDescription', '77771029'])
    expect(request.params.get('limit')).toBe(String(PAGE_SIZE))
    expect(request.params.get('offset')).toBe('0')
    expect(request.params.get('orderby')).toBe('-StudyDate,-StudyTime')
  })

  it('неоднозначный номер: пробует варианты по очереди, пока не найдёт', async () => {
    const archive = standardArchive().install()
    const page = await fetchStudiesPage('DCM4CHEE', parseQuery('P-1002').variants, '-StudyDate', { offset: 0, variantIndex: 0 })

    const tried = archive.calls('GET', '/aets/DCM4CHEE/rs/studies').map((r) => [...r.params.keys()].find((k) =>
      ['AccessionNumber', 'PatientID', 'PatientName'].includes(k)))
    expect(tried).toEqual(['AccessionNumber', 'PatientID'])
    expect(page.rows.map((row) => row.patientName)).toEqual(['Петрова Мария Сергеевна'])
    expect(page).toMatchObject({ variantIndex: 1, hint: 'по ID пациента', params: { PatientID: 'P-1002' } })
  })

  it('следующие страницы идут сразу по сработавшему варианту', async () => {
    const archive = standardArchive().install()
    await fetchStudiesPage('DCM4CHEE', parseQuery('P-1002').variants, '-StudyDate', { offset: 100, variantIndex: 1 })
    const calls = archive.calls('GET', '/aets/DCM4CHEE/rs/studies')
    expect(calls).toHaveLength(1)
    expect(calls[0].params.get('PatientID')).toBe('P-1002')
    expect(calls[0].params.get('offset')).toBe('100')
  })

  it('если не нашлось ни по одному варианту — пустая страница без подсказки', async () => {
    standardArchive().install()
    const page = await fetchStudiesPage('DCM4CHEE', parseQuery('ZZZ999').variants, '-StudyDate', { offset: 0, variantIndex: 0 })
    expect(page.rows).toEqual([])
    expect(page.hint).toBeUndefined()
  })

  it('однозначный запрос — ровно один запрос в архив', async () => {
    const archive = standardArchive().install()
    const page = await fetchStudiesPage('DCM4CHEE', parseQuery('Петрова').variants, '-StudyDate', { offset: 0, variantIndex: 0 })
    expect(archive.calls('GET', '/aets/DCM4CHEE/rs/studies')).toHaveLength(1)
    expect(page.rows[0].studyUID).toBe(PETROVA_MR.uid)
  })
})
