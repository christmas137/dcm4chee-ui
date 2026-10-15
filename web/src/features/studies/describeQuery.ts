/** Что реально ушло в архив — словами: строка интерпретации под поиском. */
import { parseDA } from '../../api/dicom'
import type { QidoParams } from '../../api/omnibox'

export interface QueryToken {
  key: string
  label: string
  value: string
  /** Модальности рисуются цветными метками, а не текстом. */
  modalities?: string[]
}

const ORDER: Array<[string, string]> = [
  ['PatientName', 'пациент'],
  ['PatientID', 'ID пациента'],
  ['AccessionNumber', '№ назначения'],
  ['StudyDescription', 'описание'],
  ['StudyDate', 'дата'],
  ['ModalitiesInStudy', 'модальность'],
  ['ReferringPhysicianName', 'направил'],
  ['InstitutionName', 'учреждение'],
  ['StudyInstanceUID', 'UID исследования'],
]

function day(da: string): string {
  const date = parseDA(da)
  if (!date) return da
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

/** `20260905-20260912` → `05.09.2026 – 12.09.2026`; открытые границы — «с …» / «по …». */
export function formatDateRange(value: string): string {
  if (!value.includes('-')) return day(value)
  const [from, to] = value.split('-')
  if (from && to) return `${day(from)} – ${day(to)}`
  return from ? `с ${day(from)}` : `по ${day(to)}`
}

export function describeParams(params: QidoParams): QueryToken[] {
  return ORDER.flatMap(([key, label]) => {
    const value = params[key]
    if (!value) return []
    if (key === 'StudyDate') return [{ key, label, value: formatDateRange(value) }]
    if (key === 'ModalitiesInStudy') return [{ key, label, value, modalities: value.split('\\').filter(Boolean) }]
    return [{ key, label, value }]
  })
}
