/**
 * Загрузка в архив по STOW-RS: `POST /aets/{aet}/rs/studies`, тело — `multipart/related`
 * с частями `application/dicom`, по файлу на часть.
 *
 * Ответ — DICOM JSON: принятые объекты в Referenced SOP Sequence (0008,1199), отказы —
 * в Failed SOP Sequence (0008,1198) с кодом причины. Статус 200 — всё принято, 202 — частично,
 * 409 — ничего. Повторная загрузка уже лежащего в архиве снимка — это успех, не ошибка.
 */
import { ApiError, apiFetch } from './client'
import type { DicomJson } from './dicom'

const REFERENCED_SOP_SEQUENCE = '00081199'
const FAILED_SOP_SEQUENCE = '00081198'
const REFERENCED_SOP_INSTANCE_UID = '00081155'
const FAILURE_REASON = '00081197'
const WARNING_REASON = '00081196'

export interface StowResult {
  stored: { sopUID: string; warning?: number }[]
  failed: { sopUID: string; reason?: number }[]
}

function newBoundary(): string {
  return `dcm4chee-ui-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

/** Тело `multipart/related`: файлы не читаются в память целиком — Blob склеивает их по ссылке. */
export function buildMultipart(files: Blob[], boundary: string): Blob {
  const parts: BlobPart[] = []
  for (const file of files) {
    parts.push(`--${boundary}\r\nContent-Type: application/dicom\r\n\r\n`, file, '\r\n')
  }
  parts.push(`--${boundary}--\r\n`)
  return new Blob(parts)
}

function sequence(ds: DicomJson, tag: string): DicomJson[] {
  const value = ds[tag]?.Value
  return Array.isArray(value) ? (value as DicomJson[]) : []
}

function firstString(ds: DicomJson, tag: string): string {
  const value = ds[tag]?.Value?.[0]
  return typeof value === 'string' ? value : ''
}

function firstNumber(ds: DicomJson, tag: string): number | undefined {
  const value = ds[tag]?.Value?.[0]
  return typeof value === 'number' ? value : undefined
}

export function parseStowResponse(ds: DicomJson): StowResult {
  return {
    stored: sequence(ds, REFERENCED_SOP_SEQUENCE).map((item) => ({
      sopUID: firstString(item, REFERENCED_SOP_INSTANCE_UID),
      warning: firstNumber(item, WARNING_REASON),
    })),
    failed: sequence(ds, FAILED_SOP_SEQUENCE).map((item) => ({
      sopUID: firstString(item, REFERENCED_SOP_INSTANCE_UID),
      reason: firstNumber(item, FAILURE_REASON),
    })),
  }
}

export async function stow(aet: string, files: Blob[], signal?: AbortSignal): Promise<StowResult> {
  const boundary = newBoundary()
  try {
    const response = await apiFetch(`/aets/${encodeURIComponent(aet)}/rs/studies`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': `multipart/related; type="application/dicom"; boundary=${boundary}`,
        Accept: 'application/dicom+json',
      },
      body: buildMultipart(files, boundary),
    })
    const text = await response.text()
    return text ? parseStowResponse(JSON.parse(text) as DicomJson) : { stored: [], failed: [] }
  } catch (error) {
    // 409: архив не принял ни одного объекта, но причины — в теле, как и при частичном успехе.
    if (error instanceof ApiError && error.status === 409 && error.body.trim().startsWith('{')) {
      return parseStowResponse(JSON.parse(error.body) as DicomJson)
    }
    throw error
  }
}

/** Причины отказа и предупреждения STOW (PS3.4 B.2.3, PS3.18 таблица I.4-1) — по-человечески. */
export function stowReasonText(code: number | undefined): string {
  if (code === undefined) return 'причина не указана'
  const hex = code.toString(16).toUpperCase().padStart(4, '0')
  const known: Record<string, string> = {
    '0110': 'ошибка обработки на стороне архива',
    '0122': 'архив не принимает такой SOP-класс',
    '0124': 'нет прав на сохранение',
    'A700': 'у архива закончилось место',
    'A900': 'данные не соответствуют SOP-классу',
    'B000': 'атрибуты были исправлены архивом',
    'B006': 'часть элементов отброшена',
    'B007': 'данные не соответствуют SOP-классу, но сохранены',
    'C000': 'архив не смог разобрать файл',
  }
  if (known[hex]) return `${known[hex]} (${hex}H)`
  if (hex.startsWith('A7')) return `у архива не хватает ресурсов (${hex}H)`
  if (hex.startsWith('A9')) return `данные не соответствуют SOP-классу (${hex}H)`
  if (hex.startsWith('C')) return `архив не смог обработать файл (${hex}H)`
  return `код ${hex}H`
}
