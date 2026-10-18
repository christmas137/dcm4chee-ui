import { describe, expect, it } from 'vitest'
import { zipSync } from 'fflate'
import { dicomBytes, dicomFile, studyFiles } from '../../test/dicomFiles'
import { batches, groupByStudy, parseHeader, scanAll, scanOne } from './scan'

const picked = (file: File, path = file.name) => ({ file, path })

describe('разбор заголовка', () => {
  it('UID, пациент по-русски, дата, описание, модальность', () => {
    const info = parseHeader(dicomBytes({
      sopUID: '1.2.3.1', studyUID: '1.2.3', seriesUID: '1.2.3.9',
      patientName: 'Иванов^Иван', patientID: 'П-1', studyDate: '20261018', description: 'КТ', modality: 'CT',
    }))
    expect(info).toEqual({
      sopUID: '1.2.3.1', studyUID: '1.2.3', seriesUID: '1.2.3.9', patientName: 'Иванов Иван',
      patientID: 'П-1', studyDate: '20261018', studyDescription: 'КТ', modality: 'CT',
    })
  })

  it('однобайтовая кодировка читается по Specific Character Set: кириллица ISO_IR 144, латиница ISO_IR 100', () => {
    const cyrillic = dicomBytes({ sopUID: '1', studyUID: '2', seriesUID: '3', patientName: 'Сидоров^Сидор', charset: 'ISO_IR 144' })
    expect(parseHeader(cyrillic)).toMatchObject({ patientName: 'Сидоров Сидор' })
    const latin = dicomBytes({ sopUID: '1', studyUID: '2', seriesUID: '3', patientName: 'Müller^Jörg', charset: 'ISO_IR 100' })
    expect(parseHeader(latin)).toMatchObject({ patientName: 'Müller Jörg' })
  })
})

describe('разбор выбранных файлов', () => {
  it('DICOM распознаётся по метке DICM', async () => {
    const [result] = await scanOne(picked(dicomFile('a.dcm', { sopUID: '1', studyUID: '2', seriesUID: '3' })))
    expect(result.kind).toBe('dicom')
  })

  it('картинки и прочие файлы пропускаются с понятной причиной', async () => {
    const [jpeg] = await scanOne(picked(new File(['jpeg'], 'photo.jpg')))
    const [other] = await scanOne(picked(new File(['hello'], 'readme')))
    expect(jpeg).toMatchObject({ kind: 'skipped', reason: expect.stringMatching(/не DICOM — такие файлы/) })
    expect(other).toMatchObject({ kind: 'skipped', reason: 'не DICOM: нет метки DICM в заголовке' })
  })

  it('DICOM без UID исследования пропускается: архив его не примет', async () => {
    const bytes = dicomBytes({ sopUID: '1', studyUID: '', seriesUID: '' })
    const [result] = await scanOne(picked(new File([bytes as Uint8Array<ArrayBuffer>], 'x.dcm')))
    expect(result).toMatchObject({ kind: 'skipped', reason: expect.stringMatching(/нет UID исследования/) })
  })

  it('ZIP раскрывается, включая вложенный; пути видны с именем архива', async () => {
    const [a, b] = studyFiles('Z', 2)
    const inner = zipSync({ 'b.dcm': new Uint8Array(await b.arrayBuffer()) })
    const outer = zipSync({
      'study/a.dcm': new Uint8Array(await a.arrayBuffer()),
      'inner.zip': inner,
      'notes.txt': new TextEncoder().encode('заметки'),
      '__MACOSX/._a.dcm': new Uint8Array([1, 2, 3]),
    })
    const results = await scanOne(picked(new File([outer as Uint8Array<ArrayBuffer>], 'export.zip')))
    expect(results.map((item) => [item.kind, item.path])).toEqual([
      ['dicom', 'export.zip/study/a.dcm'],
      ['dicom', 'export.zip/inner.zip/b.dcm'],
      ['skipped', 'export.zip/notes.txt'],
    ])
  })

  it('битый ZIP — пропуск с причиной, а не падение', async () => {
    const broken = new File([Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])], 'broken.zip')
    expect(await scanOne(picked(broken))).toEqual([
      { kind: 'skipped', file: broken, path: 'broken.zip', reason: 'ZIP-архив повреждён или зашифрован' },
    ])
  })

  it('пачка разбирается целиком, порядок сохраняется, прогресс сообщается', async () => {
    const files = studyFiles('P', 5)
    const progress: number[] = []
    const results = await scanAll(files.map((file) => picked(file)), (done) => progress.push(done), 2)
    expect(results.map((item) => item.path)).toEqual(files.map((file) => file.name))
    expect(progress).toEqual([1, 2, 3, 4, 5])
  })
})

describe('группировка и пачки', () => {
  it('снимки собираются по исследованиям, повторы одного снимка отбрасываются', async () => {
    const ct = studyFiles('C', 3)
    const mr = studyFiles('M', 2, { modality: 'MR', patientName: 'Петров^Пётр' })
    const scanned = await scanAll([...ct, ...mr, ct[0]].map((file) => picked(file)))
    const { groups, duplicates } = groupByStudy(scanned)
    expect(duplicates).toBe(1)
    expect(groups.map((group) => [group.patientName, group.files.length, group.modalities, group.series]))
      .toEqual([['Иванов Иван', 3, ['CT'], 1], ['Петров Пётр', 2, ['MR'], 1]])
  })

  it('пачки ограничены по объёму и числу файлов; крупный файл идёт один', () => {
    const item = (size: number) => ({ file: new File([new Uint8Array(size)], 'f') })
    expect(batches([item(6), item(6), item(6), item(20), item(1)], 12, 10).map((batch) => batch.length))
      .toEqual([2, 1, 1, 1])
    expect(batches(Array.from({ length: 7 }, () => item(1)), 100, 3).map((batch) => batch.length)).toEqual([3, 3, 1])
    expect(batches([], 10, 10)).toEqual([])
  })
})
