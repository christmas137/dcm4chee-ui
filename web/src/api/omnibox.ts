/**
 * Разбор строки поиска в параметры QIDO-RS.
 *
 * Смысл всей затеи: вместо формы на два десятка полей пользователь пишет то, что помнит —
 * «Иванов», «20240513», «CT», «ACC20000», «1.2.840…» — и получает результат.
 *
 * Что нельзя понять однозначно (число может быть и номером карты, и номером назначения),
 * превращается в несколько вариантов запроса: пробуем по очереди, пока не найдётся.
 */
import { formatDA } from './dicom'

export type QidoParams = Record<string, string>

export interface QueryVariant {
  params: QidoParams
  /** Чем объяснить результат, если сработал не первый вариант. */
  hint?: string
}

export interface ParsedQuery {
  /** Фильтры, понятые однозначно. Входят в каждый вариант. */
  base: QidoParams
  /** Трактовки неоднозначного ввода по убыванию вероятности. Минимум один элемент. */
  variants: QueryVariant[]
  /** «Как поняли запрос» — для подсказки под строкой поиска. */
  explain: string[]
}

/** Модальности DICOM, которые реально встречаются в списке исследований. */
const MODALITIES = new Set([
  'CR', 'CT', 'DX', 'ECG', 'ES', 'IO', 'MG', 'MR', 'NM', 'OCT', 'OP', 'OT', 'PT', 'PX',
  'RF', 'RG', 'SC', 'SM', 'SR', 'US', 'XA', 'XC', 'KO', 'PR', 'SEG', 'DOC',
])

const PREFIXES: Record<string, string> = {
  pid: 'PatientID',
  id: 'PatientID',
  acc: 'AccessionNumber',
  name: 'PatientName',
  fio: 'PatientName',
  mod: 'ModalitiesInStudy',
  desc: 'StudyDescription',
  uid: 'StudyInstanceUID',
  date: 'StudyDate',
  ref: 'ReferringPhysicianName',
  inst: 'InstitutionName',
}

const RELATIVE_DATES: Record<string, number> = {
  today: 0, сегодня: 0,
  yesterday: 1, вчера: 1,
  week: 7, неделя: 7, '7d': 7, '7д': 7,
  month: 30, месяц: 30, '30d': 30, '30д': 30,
  quarter: 90, квартал: 90, '90d': 90, '90д': 90,
  year: 365, год: 365,
}

function daysAgo(days: number): Date {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}

/** Одна дата в любом из привычных форматов → `YYYYMMDD`. */
function parseSingleDate(token: string): string | undefined {
  const digits = /^(\d{4})(\d{2})(\d{2})$/.exec(token)
  if (digits) return validDate(digits[1], digits[2], digits[3])

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token)
  if (iso) return validDate(iso[1], iso[2], iso[3])

  const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(token)
  if (ru) return validDate(ru[3], ru[2].padStart(2, '0'), ru[1].padStart(2, '0'))

  return undefined
}

function validDate(y: string, m: string, d: string): string | undefined {
  const year = Number(y)
  const month = Number(m)
  const day = Number(d)
  if (year < 1900 || year > 2999 || month < 1 || month > 12 || day < 1 || day > 31) return undefined
  return `${y}${m}${d}`
}

/** Месяц (`2024-05`, `202405`) или год (`2024`) → диапазон `YYYYMMDD-YYYYMMDD`. */
function parsePeriod(token: string): string | undefined {
  const year = /^(\d{4})$/.exec(token)
  if (year && Number(year[1]) >= 1900 && Number(year[1]) <= 2999) {
    return `${year[1]}0101-${year[1]}1231`
  }
  const month = /^(\d{4})-?(\d{2})$/.exec(token)
  if (month) {
    const y = Number(month[1])
    const m = Number(month[2])
    if (y < 1900 || y > 2999 || m < 1 || m > 12) return undefined
    const last = new Date(y, m, 0).getDate()
    return `${month[1]}${month[2]}01-${month[1]}${month[2]}${last}`
  }
  return undefined
}

/**
 * Токен → значение `StudyDate` для QIDO (одна дата или диапазон `A-B`).
 * Понимает относительные периоды, обычные даты, месяцы, годы и явные диапазоны `A..B`.
 */
export function parseDateToken(token: string): string | undefined {
  const lower = token.toLowerCase()

  const relative = RELATIVE_DATES[lower]
  if (relative !== undefined) {
    if (relative === 0) return formatDA(new Date())
    if (lower === 'yesterday' || lower === 'вчера') return formatDA(daysAgo(1))
    return `${formatDA(daysAgo(relative))}-${formatDA(new Date())}`
  }

  const explicitRange = token.split('..')
  if (explicitRange.length === 2) {
    const from = parseSingleDate(explicitRange[0])
    const to = parseSingleDate(explicitRange[1])
    if (from && to) return `${from}-${to}`
  }

  // Синтаксис самого QIDO — `20240101-20240131`.
  const qidoRange = /^(\d{8})-(\d{8})$/.exec(token)
  if (qidoRange) {
    const from = parseSingleDate(qidoRange[1])
    const to = parseSingleDate(qidoRange[2])
    if (from && to) return `${from}-${to}`
  }

  return parseSingleDate(token) ?? parsePeriod(token)
}

/** Разбивает строку на токены, не ломая `"фразы в кавычках"`. */
export function tokenize(text: string): string[] {
  return Array.from(text.matchAll(/"([^"]*)"|(\S+)/g))
    .map((m) => m[1] ?? m[2])
    .filter(Boolean)
}

/** Оборачивает значение в `*`, если пользователь не задал маску сам. */
function wildcard(value: string): string {
  return value.includes('*') || value.includes('?') ? value : `*${value}*`
}

const UID_RE = /^\d+(\.\d+)+$/
const ID_RE = /^[\p{L}\d][\p{L}\d._/-]*$/u

function looksLikeId(token: string): boolean {
  return ID_RE.test(token) && /\d/.test(token) && !UID_RE.test(token)
}

export function parseQuery(text: string): ParsedQuery {
  const base: QidoParams = {}
  const explain: string[] = []
  const nameParts: string[] = []
  const modalities: string[] = []
  const ids: string[] = []

  for (const token of tokenize(text)) {
    const prefixMatch = /^(\w+):(.*)$/u.exec(token)
    const prefixKey = prefixMatch?.[1].toLowerCase()
    if (prefixMatch && prefixKey && prefixKey in PREFIXES && prefixMatch[2]) {
      const field = PREFIXES[prefixKey]
      const value = prefixMatch[2]
      if (field === 'PatientName' || field === 'StudyDescription' || field === 'ReferringPhysicianName' || field === 'InstitutionName') {
        base[field] = wildcard(value)
      } else if (field === 'ModalitiesInStudy') {
        modalities.push(...value.toUpperCase().split(/[,\\]/).filter(Boolean))
      } else if (field === 'StudyDate') {
        const date = parseDateToken(value)
        if (date) base.StudyDate = date
      } else {
        base[field] = value
      }
      continue
    }

    const date = parseDateToken(token)
    if (date) {
      base.StudyDate ??= date // две даты в запросе — побеждает первая, диапазон задаётся через `..`
      continue
    }

    const upper = token.toUpperCase()
    if (MODALITIES.has(upper)) {
      modalities.push(upper)
      continue
    }

    if (UID_RE.test(token)) {
      base.StudyInstanceUID = token
      continue
    }

    if (looksLikeId(token)) {
      ids.push(token)
      continue
    }

    nameParts.push(token)
  }

  if (nameParts.length) {
    // Склеиваем слова через `*`, но если маску задали руками — ничего не добавляем.
    const joined = nameParts.join('*')
    base.PatientName = nameParts.some((part) => /[*?]/.test(part)) ? joined : `*${joined}*`
  }
  // Мультизначное сопоставление в DICOM — через обратный слэш.
  if (modalities.length) base.ModalitiesInStudy = [...new Set(modalities)].join('\\')

  if (base.PatientName) explain.push(`пациент ${base.PatientName}`)
  if (base.StudyDate) explain.push(`дата ${base.StudyDate}`)
  if (base.ModalitiesInStudy) explain.push(`модальность ${base.ModalitiesInStudy.replace(/\\/g, ', ')}`)
  if (base.StudyDescription) explain.push(`описание ${base.StudyDescription}`)
  if (base.StudyInstanceUID) explain.push('StudyInstanceUID')
  if (base.PatientID) explain.push(`ID пациента ${base.PatientID}`)
  if (base.AccessionNumber) explain.push(`№ назначения ${base.AccessionNumber}`)

  const variants = buildVariants(base, ids, explain)
  return { base, variants, explain }
}

/**
 * Для «айдишных» токенов заранее неизвестно, номер это карты или назначения.
 * Отдаём оба варианта по убыванию вероятности: чисто цифровой токен чаще PatientID,
 * буквенно-цифровой — чаще AccessionNumber.
 */
function buildVariants(base: QidoParams, ids: string[], explain: string[]): QueryVariant[] {
  if (!ids.length) return [{ params: base }]

  const value = ids.join(' ')
  const numeric = /^\d+$/.test(value)
  const order: Array<[string, string]> = numeric
    ? [['PatientID', 'по ID пациента'], ['AccessionNumber', 'по номеру назначения']]
    : [['AccessionNumber', 'по номеру назначения'], ['PatientID', 'по ID пациента']]

  explain.push(`${order[0][0] === 'PatientID' ? 'ID пациента' : '№ назначения'} ${value}`)

  const variants = order.map(([field, hint], index) => ({
    params: { ...base, [field]: value },
    hint: index === 0 ? undefined : hint,
  }))

  // Последняя попытка — вдруг это всё-таки часть имени (латиница с цифрами).
  if (!base.PatientName) {
    variants.push({ params: { ...base, PatientName: wildcard(value) }, hint: 'по имени пациента' })
  }
  return variants
}
