/** Работа с DICOM JSON (PS3.18 F.2): доступ к тегам, разбор дат, человекочитаемые имена. */

export interface DicomElement {
  vr: string
  Value?: unknown[]
  BulkDataURI?: string
  InlineBinary?: string
}

export type DicomJson = Record<string, DicomElement>

/** Теги, которые используются в коде. Ключ — имя, значение — тег без разделителей. */
export const Tag = {
  SpecificCharacterSet: '00080005',
  SOPClassUID: '00080016',
  SOPInstanceUID: '00080018',
  StudyDate: '00080020',
  SeriesDate: '00080021',
  StudyTime: '00080030',
  SeriesTime: '00080031',
  AccessionNumber: '00080050',
  ModalitiesInStudy: '00080061',
  Modality: '00080060',
  InstitutionName: '00080080',
  ReferringPhysicianName: '00080090',
  StudyDescription: '00081030',
  SeriesDescription: '0008103E',
  PatientName: '00100010',
  PatientID: '00100020',
  PatientBirthDate: '00100030',
  PatientSex: '00100040',
  BodyPartExamined: '00180015',
  StudyInstanceUID: '0020000D',
  SeriesInstanceUID: '0020000E',
  StudyID: '00200010',
  SeriesNumber: '00200011',
  InstanceNumber: '00200013',
  NumberOfStudyRelatedSeries: '00201206',
  NumberOfStudyRelatedInstances: '00201208',
  NumberOfSeriesRelatedInstances: '00201209',
  Rows: '00280010',
  Columns: '00280011',
  StudySize: '00201200', // не стандарт: архив отдаёт размер отдельным запросом
} as const

interface PersonName {
  Alphabetic?: string
  Ideographic?: string
  Phonetic?: string
}

function firstValue(ds: DicomJson | undefined, tag: string): unknown {
  return ds?.[tag]?.Value?.[0]
}

/** Строковое значение тега. Понимает PN (`{Alphabetic: "Ivanov^Ivan"}`). */
export function str(ds: DicomJson | undefined, tag: string): string | undefined {
  const value = firstValue(ds, tag)
  if (value === undefined || value === null) return undefined
  if (typeof value === 'object') {
    const pn = value as PersonName
    return pn.Alphabetic ?? pn.Ideographic ?? pn.Phonetic ?? undefined
  }
  return String(value)
}

export function strings(ds: DicomJson | undefined, tag: string): string[] {
  const values = ds?.[tag]?.Value ?? []
  return values.map((v) => (typeof v === 'object' ? ((v as PersonName).Alphabetic ?? '') : String(v)))
}

export function num(ds: DicomJson | undefined, tag: string): number | undefined {
  const value = firstValue(ds, tag)
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** `Ivanov^Ivan^Ivanovich` → `Ivanov Ivan Ivanovich`. */
export function personName(raw: string | undefined): string {
  if (!raw) return ''
  return raw.split('^').filter(Boolean).join(' ').trim()
}

/** DICOM DA (`YYYYMMDD`) → `Date` в локальном времени. */
export function parseDA(da: string | undefined): Date | undefined {
  if (!da || da.length < 8) return undefined
  const year = Number(da.slice(0, 4))
  const month = Number(da.slice(4, 6))
  const day = Number(da.slice(6, 8))
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day)
}

/** DICOM TM (`HHMMSS.FFFFFF`) → `{h, m, s}`. */
export function parseTM(tm: string | undefined): { h: number; m: number; s: number } | undefined {
  if (!tm || tm.length < 2) return undefined
  return {
    h: Number(tm.slice(0, 2)) || 0,
    m: Number(tm.slice(2, 4)) || 0,
    s: Number(tm.slice(4, 6)) || 0,
  }
}

export function toDate(): string {
  return formatDA(new Date())
}

export function formatDA(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

/** `20240513` → `13.05.2024`; время добавляется, если передано. */
export function formatDateTime(da: string | undefined, tm?: string): string {
  const date = parseDA(da)
  if (!date) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  const head = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
  const time = parseTM(tm)
  return time ? `${head} ${pad(time.h)}:${pad(time.m)}` : head
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return ''
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/** `00100010` → `(0010,0010)` — в таком виде тег ищется в словаре dcmjs. */
export function tagToGroupElement(tag: string): string {
  return `(${tag.slice(0, 4)},${tag.slice(4, 8)})`
}
