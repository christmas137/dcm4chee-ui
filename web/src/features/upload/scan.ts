/**
 * Разбор выбранных файлов перед загрузкой: что из этого DICOM, к каким исследованиям относится,
 * что придётся пропустить и почему. Человек видит это до отправки, а не узнаёт из отказов архива.
 *
 * Читается только заголовок файла (до Pixel Data): метаданные нужны для группировки,
 * а гигабайты пикселей в браузере читать незачем.
 */
import dicomParser from 'dicom-parser'
import type { DataSet } from 'dicom-parser'
import { unzip } from 'fflate'
import { personName } from '../../api/dicom'

/** Сколько байт читать для заголовка: у обычных снимков метаданные заметно меньше. */
const HEADER_BYTES = 1024 * 1024

export interface DicomInfo {
  sopUID: string
  studyUID: string
  seriesUID: string
  patientName: string
  patientID: string
  studyDate?: string
  studyDescription?: string
  modality?: string
}

export type Scanned =
  | { kind: 'dicom'; file: File; path: string; info: DicomInfo }
  | { kind: 'skipped'; file: File; path: string; reason: string }

/** Файл и путь внутри папки или архива, как его увидит человек. */
export interface Picked {
  file: File
  path: string
}

const CHARSETS: [RegExp, string][] = [
  [/ISO_IR 192/, 'utf-8'],
  [/IR 144/, 'iso-8859-5'],
  [/IR 100/, 'windows-1252'],
  [/IR 101/, 'iso-8859-2'],
  [/IR 126/, 'iso-8859-7'],
  [/IR 127/, 'iso-8859-6'],
  [/IR 138/, 'iso-8859-8'],
  [/IR 148/, 'iso-8859-9'],
  [/GB18030/, 'gb18030'],
  [/GBK/, 'gbk'],
]

function decoderFor(charset: string | undefined): (bytes: Uint8Array) => string {
  const label = charset ? CHARSETS.find(([pattern]) => pattern.test(charset))?.[1] : undefined
  if (label) {
    const decoder = new TextDecoder(label)
    return (bytes) => decoder.decode(bytes)
  }
  // Кодировка не указана: по стандарту это ASCII, на деле часто UTF-8. Невалидный UTF-8 — латиница.
  const utf8 = new TextDecoder('utf-8', { fatal: true })
  const latin = new TextDecoder('windows-1252')
  return (bytes) => {
    try {
      return utf8.decode(bytes)
    } catch {
      return latin.decode(bytes)
    }
  }
}

function text(dataSet: DataSet, tag: string, decode: (bytes: Uint8Array) => string): string | undefined {
  const element = dataSet.elements[tag]
  if (!element || !element.length) return undefined
  const bytes = dataSet.byteArray.subarray(element.dataOffset, element.dataOffset + element.length)
  const value = decode(bytes).replace(/[\0\s]+$/, '').trim()
  return value || undefined
}

function ascii(dataSet: DataSet, tag: string): string | undefined {
  return dataSet.string(tag)?.replace(/\0+$/, '').trim() || undefined
}

function isZip(head: Uint8Array): boolean {
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
}

function isPart10(head: Uint8Array): boolean {
  return head.length >= 132 && head[128] === 0x44 && head[129] === 0x49 && head[130] === 0x43 && head[131] === 0x4d
}

/** Разбор заголовка. Обрезанный на HEADER_BYTES файл парсер не дочитает — берём то, что успел. */
export function parseHeader(bytes: Uint8Array): DicomInfo | string {
  let dataSet: DataSet
  try {
    dataSet = dicomParser.parseDicom(bytes, { untilTag: 'x7fe00010' })
  } catch (error) {
    const partial = (error as { dataSet?: DataSet }).dataSet
    if (!partial) return 'файл повреждён: не удалось прочитать заголовок DICOM'
    dataSet = partial
  }
  const decode = decoderFor(ascii(dataSet, 'x00080005'))
  const sopUID = ascii(dataSet, 'x00080018') ?? ascii(dataSet, 'x00020003')
  const studyUID = ascii(dataSet, 'x0020000d')
  const seriesUID = ascii(dataSet, 'x0020000e')
  if (!sopUID) return 'нет SOP Instance UID — это не снимок'
  if (!studyUID || !seriesUID) return 'нет UID исследования или серии — архив такой файл не примет'
  return {
    sopUID,
    studyUID,
    seriesUID,
    patientName: personName(text(dataSet, 'x00100010', decode)),
    patientID: text(dataSet, 'x00100020', decode) ?? '',
    studyDate: ascii(dataSet, 'x00080020'),
    studyDescription: text(dataSet, 'x00081030', decode),
    modality: ascii(dataSet, 'x00080060'),
  }
}

async function readHead(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, Math.min(file.size, HEADER_BYTES)).arrayBuffer())
}

function unzipFile(file: File): Promise<Picked[]> {
  return file.arrayBuffer().then((buffer) => new Promise((resolve, reject) => {
    unzip(new Uint8Array(buffer), (error, entries) => {
      if (error) return reject(error)
      resolve(
        Object.entries(entries)
          .filter(([name, data]) => !name.endsWith('/') && data.length > 0 && !/(^|\/)(__MACOSX|\.DS_Store)/.test(name))
          .map(([name, data]) => ({
            file: new File([data as Uint8Array<ArrayBuffer>], name.slice(name.lastIndexOf('/') + 1)),
            path: `${file.name}/${name}`,
          })),
      )
    })
  }))
}

/**
 * Разбор одного выбранного файла. ZIP раскрывается и разбирается целиком — внутри могут быть
 * и DICOM, и что угодно ещё; вложенные архивы тоже раскрываются.
 */
export async function scanOne(picked: Picked): Promise<Scanned[]> {
  const head = await readHead(picked.file)
  if (isZip(head)) {
    let entries: Picked[]
    try {
      entries = await unzipFile(picked.file)
    } catch {
      return [{ kind: 'skipped', ...picked, reason: 'ZIP-архив повреждён или зашифрован' }]
    }
    const nested = await Promise.all(entries.map((entry) => scanOne({ ...entry, path: `${picked.path.replace(/[^/]*$/, '')}${entry.path}` })))
    return nested.flat()
  }
  if (!isPart10(head)) {
    const reason = /\.(jpe?g|png|pdf|mp4|txt|xml|html?)$/i.test(picked.file.name)
      ? 'не DICOM — такие файлы загружаются в исследование отдельно'
      : 'не DICOM: нет метки DICM в заголовке'
    return [{ kind: 'skipped', ...picked, reason }]
  }
  const info = parseHeader(head)
  return typeof info === 'string'
    ? [{ kind: 'skipped', ...picked, reason: info }]
    : [{ kind: 'dicom', ...picked, info }]
}

/** Разбор пачки файлов с ограниченной параллельностью — тысячи файлов разом браузер не любит. */
export async function scanAll(
  picked: Picked[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 8,
): Promise<Scanned[]> {
  const results: Scanned[][] = new Array(picked.length)
  let next = 0
  let done = 0
  async function worker() {
    while (next < picked.length) {
      const index = next++
      results[index] = await scanOne(picked[index])
      onProgress?.(++done, picked.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, picked.length) }, worker))
  return results.flat()
}

export interface StudyGroup {
  studyUID: string
  patientName: string
  patientID: string
  studyDate?: string
  description?: string
  modalities: string[]
  series: number
  files: Extract<Scanned, { kind: 'dicom' }>[]
  bytes: number
}

/**
 * Снимки по исследованиям — так, как их потом увидят в списке. Повторы одного и того же снимка
 * (тот же SOP Instance UID) отправлять дважды незачем: оставляем первый.
 */
export function groupByStudy(scanned: Scanned[]): { groups: StudyGroup[]; duplicates: number } {
  const groups = new Map<string, StudyGroup>()
  const seen = new Set<string>()
  const seriesByStudy = new Map<string, Set<string>>()
  let duplicates = 0
  for (const item of scanned) {
    if (item.kind !== 'dicom') continue
    if (seen.has(item.info.sopUID)) {
      duplicates++
      continue
    }
    seen.add(item.info.sopUID)
    const { info } = item
    const group = groups.get(info.studyUID) ?? {
      studyUID: info.studyUID,
      patientName: info.patientName,
      patientID: info.patientID,
      studyDate: info.studyDate,
      description: info.studyDescription,
      modalities: [],
      series: 0,
      files: [],
      bytes: 0,
    }
    if (info.modality && !group.modalities.includes(info.modality)) group.modalities.push(info.modality)
    const series = seriesByStudy.get(info.studyUID) ?? new Set()
    series.add(info.seriesUID)
    seriesByStudy.set(info.studyUID, series)
    group.series = series.size
    group.files.push(item)
    group.bytes += item.file.size
    groups.set(info.studyUID, group)
  }
  return { groups: [...groups.values()], duplicates }
}

/**
 * Пачки для отправки: не больше `maxBytes` и `maxFiles` в одном запросе. Крупный файл
 * уходит один. Пачками — чтобы показывать прогресс и не упираться в лимиты прокси.
 */
export function batches<T extends { file: File }>(items: T[], maxBytes = 16 * 1024 * 1024, maxFiles = 50): T[][] {
  const result: T[][] = []
  let current: T[] = []
  let size = 0
  for (const item of items) {
    if (current.length && (size + item.file.size > maxBytes || current.length >= maxFiles)) {
      result.push(current)
      current = []
      size = 0
    }
    current.push(item)
    size += item.file.size
  }
  if (current.length) result.push(current)
  return result
}
