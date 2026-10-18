/**
 * Правка атрибутов исследования и пациента: что показать в форме и что отправить в архив.
 * Отправляется только изменённое — и раздельно: правка пациента затрагивает все его
 * исследования, правка исследования — только это, срок хранения — отдельный вызов.
 */
import type { DicomElement, DicomJson } from '../../api/dicom'
import { STUDY_EXPIRATION_DATE, STUDY_EXPIRATION_STATE } from '../../api/iocm'

export interface EditForm {
  family: string
  given: string
  middle: string
  birthDate: string // YYYY-MM-DD для <input type=date>
  sex: string
  description: string
  accession: string
  studyDate: string
  studyTime: string // HH:MM
  referrer: string // «Фамилия Имя Отчество»
  studyID: string
  /** Срок хранения: '' — по правилам архива, 'never' — бессрочно, иначе дата YYYY-MM-DD. */
  expiration: string
}

function first(ds: DicomJson, tag: string): unknown {
  return ds[tag]?.Value?.[0]
}

function text(ds: DicomJson, tag: string): string {
  const value = first(ds, tag)
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function pnComponents(ds: DicomJson, tag: string): string[] {
  const value = first(ds, tag) as { Alphabetic?: string } | string | undefined
  const raw = typeof value === 'string' ? value : value?.Alphabetic ?? ''
  return raw.split('^')
}

export const daToInput = (da: string) => (/^\d{8}$/.test(da) ? `${da.slice(0, 4)}-${da.slice(4, 6)}-${da.slice(6, 8)}` : '')
export const inputToDa = (value: string) => value.replace(/-/g, '')
const tmToInput = (tm: string) => (/^\d{4}/.test(tm) ? `${tm.slice(0, 2)}:${tm.slice(2, 4)}` : '')

export function readForm(ds: DicomJson): EditForm {
  const [family = '', given = '', middle = ''] = pnComponents(ds, '00100010')
  return {
    family,
    given,
    middle,
    birthDate: daToInput(text(ds, '00100030')),
    sex: text(ds, '00100040'),
    description: text(ds, '00081030'),
    accession: text(ds, '00080050'),
    studyDate: daToInput(text(ds, '00080020')),
    studyTime: tmToInput(text(ds, '00080030')),
    referrer: pnComponents(ds, '00080090').filter(Boolean).join(' '),
    studyID: text(ds, '00200010'),
    expiration: daToInput(text(ds, STUDY_EXPIRATION_DATE)) || (text(ds, STUDY_EXPIRATION_STATE) === 'FROZEN' ? 'never' : ''),
  }
}

function element(vr: string, value: string): DicomElement {
  return value ? { vr, Value: [value] } : { vr }
}

function pn(components: string[]): DicomElement {
  const trimmed = [...components]
  while (trimmed.length && !trimmed[trimmed.length - 1]) trimmed.pop()
  return trimmed.length ? { vr: 'PN', Value: [{ Alphabetic: trimmed.join('^') }] } : { vr: 'PN' }
}

export interface EditPlan {
  patient: DicomJson | null
  study: DicomJson | null
  /** undefined — не трогать; null — бессрочно; строка — новая дата ГГГГММДД. */
  expiration: string | null | undefined
}

export function planChanges(ds: DicomJson, form: EditForm): EditPlan {
  const before = readForm(ds)
  const patient: DicomJson = {}
  const study: DicomJson = {}

  if (form.family !== before.family || form.given !== before.given || form.middle !== before.middle) {
    // Префикс и суффикс имени (4-й и 5-й компоненты) формой не правятся — сохраняем как были.
    const rest = pnComponents(ds, '00100010').slice(3)
    patient['00100010'] = pn([form.family.trim(), form.given.trim(), form.middle.trim(), ...rest])
  }
  if (form.birthDate !== before.birthDate) patient['00100030'] = element('DA', inputToDa(form.birthDate))
  if (form.sex !== before.sex) patient['00100040'] = element('CS', form.sex)

  if (form.description !== before.description) study['00081030'] = element('LO', form.description.trim())
  if (form.accession !== before.accession) study['00080050'] = element('SH', form.accession.trim())
  if (form.studyDate !== before.studyDate) study['00080020'] = element('DA', inputToDa(form.studyDate))
  if (form.studyTime !== before.studyTime) study['00080030'] = element('TM', form.studyTime.replace(':', ''))
  if (form.referrer !== before.referrer) study['00080090'] = pn(form.referrer.trim().split(/\s+/))
  if (form.studyID !== before.studyID) study['00200010'] = element('SH', form.studyID.trim())

  return {
    patient: Object.keys(patient).length ? patient : null,
    study: Object.keys(study).length ? study : null,
    // Вернуть «по правилам архива» API не умеет — форма такого выбора и не предлагает.
    expiration: form.expiration === before.expiration || !form.expiration
      ? undefined
      : form.expiration === 'never' ? null : inputToDa(form.expiration),
  }
}
