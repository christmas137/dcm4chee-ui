/**
 * Изменение архива: отклонение, удаление, правка атрибутов, срок хранения.
 * Поведение проверено на стенде 5.35.1 — грабли записаны рядом с кодом.
 *
 * - Отклонение (`POST …/reject/{code}^{scheme}`) не удаляет снимки: создаётся отметка об
 *   отклонении (KO), сами снимки пропадают из поиска в обычных AE и видны в IOCM_* AE.
 * - Удалить можно только отклонённое (`DELETE /studies/{uid}`), иначе 403
 *   «Deletion of Study with Rejection State: NONE not permitted».
 * - Правка исследования (`PUT /studies/{uid}`) заменяет атрибуты исследования целиком —
 *   отправляем всё, что было, с изменениями; без ID пациента в теле архив отвечает 400.
 * - Правка пациента (`PUT /patients/{ID^^^издатель}`): без издателя в пути архив считает это
 *   сменой ID и отказывает (403). Без Specific Character Set в теле кириллица сохраняется «????».
 * - Срок хранения: `PUT …/expire/ГГГГММДД?FreezeExpirationDate=false`. `expire/never` — «бессрочно»:
 *   срок снимается и замораживается (7777,102B = FROZEN), правила сроков больше не действуют.
 *   Без `FreezeExpirationDate=false` дата для замороженного исследования молча игнорируется (204!).
 */
import { useQuery } from '@tanstack/react-query'
import { apiFetch, getJson } from './client'
import type { DicomJson } from './dicom'

export interface RejectionNote {
  label: string
  type?: string
  codeValue: string
  codingSchemeDesignator: string
  codeMeaning?: string
}

const NOTE_NAMES: Record<string, string> = {
  REJECTED_FOR_QUALITY_REASONS: 'Брак: плохое качество снимков',
  REJECTED_FOR_PATIENT_SAFETY_REASONS: 'Угроза безопасности пациента: снимки не того пациента',
  INCORRECT_MODALITY_WORKLIST_ENTRY: 'Ошибочный элемент рабочего списка',
  DATA_RETENTION_POLICY_EXPIRED: 'Истёк срок хранения',
}

export function rejectionNoteName(note: RejectionNote): string {
  return (note.type && NOTE_NAMES[note.type]) || note.label
}

export function useRejectionNotes(enabled = true) {
  return useQuery({
    queryKey: ['rejection-notes'],
    enabled,
    queryFn: () => getJson<RejectionNote[]>('/reject'),
    staleTime: 10 * 60 * 1000,
  })
}

const studyPath = (aet: string, study: string) =>
  `/aets/${encodeURIComponent(aet)}/rs/studies/${encodeURIComponent(study)}`

export async function reject(
  aet: string,
  target: { study: string; series?: string },
  note: RejectionNote,
): Promise<number> {
  const base = studyPath(aet, target.study) + (target.series ? `/series/${encodeURIComponent(target.series)}` : '')
  const code = encodeURIComponent(`${note.codeValue}^${note.codingSchemeDesignator}`)
  const response = await apiFetch(`${base}/reject/${code}`, { method: 'POST' })
  const body = (await response.json().catch(() => ({}))) as { count?: number }
  return body.count ?? 0
}

export async function deleteStudy(aet: string, study: string): Promise<void> {
  await apiFetch(studyPath(aet, study), { method: 'DELETE' })
}

/** Все атрибуты исследования и пациента — основа для правки, чтобы ничего не потерять. */
export async function fetchStudyAttributes(aet: string, study: string): Promise<DicomJson> {
  const found = await getJson<DicomJson[]>(`/aets/${encodeURIComponent(aet)}/rs/studies`, {
    StudyInstanceUID: study,
    includefield: 'all',
  })
  if (!found.length) throw new Error('исследование не найдено')
  return found[0]
}

/** Вычисляемые архивом атрибуты: в правку их не отправляем. */
const DERIVED = new Set([
  '00080054', // Retrieve AE Title
  '00080056', // Instance Availability
  '00080061', // Modalities in Study
  '00080062', // SOP Classes in Study
  '00081190', // Retrieve URL
  '00201200', // Number of Patient Related Studies
  '00201206', // Number of Study Related Series
  '00201208', // Number of Study Related Instances
])

const UTF8: DicomJson = { '00080005': { vr: 'CS', Value: ['ISO_IR 192'] } }

function withChanges(base: DicomJson, changes: DicomJson): DicomJson {
  const result: DicomJson = { ...base }
  for (const [tag, element] of Object.entries(changes)) result[tag] = element
  return { ...result, ...UTF8 }
}

/** Тело правки исследования: все атрибуты исследования и пациента, кроме вычисляемых и приватных. */
export function studyUpdateBody(original: DicomJson, changes: DicomJson): DicomJson {
  const base = Object.fromEntries(Object.entries(original)
    .filter(([tag]) => !DERIVED.has(tag) && !tag.startsWith('7777')))
  return withChanges(base, changes)
}

/** Тело правки пациента: только атрибуты пациента (группа 0010) и кодировка. */
export function patientUpdateBody(original: DicomJson, changes: DicomJson): DicomJson {
  const base = Object.fromEntries(Object.entries(original).filter(([tag]) => tag.startsWith('0010')))
  return withChanges(base, changes)
}

/** ID пациента для пути: `ID^^^издатель`, как его ждёт архив; без издателя — просто ID. */
export function patientPathId(ds: DicomJson): string {
  const id = String(ds['00100020']?.Value?.[0] ?? '')
  const issuer = ds['00100021']?.Value?.[0]
  return issuer ? `${id}^^^${String(issuer)}` : id
}

export async function updateStudy(aet: string, study: string, body: DicomJson): Promise<void> {
  await apiFetch(studyPath(aet, study), {
    method: 'PUT',
    // Только `application/dicom+json` в Accept архив отвергает с 406 — ответ у него в application/json.
    headers: { 'Content-Type': 'application/dicom+json', Accept: 'application/dicom+json, application/json' },
    body: JSON.stringify(body),
  })
}

export async function updatePatient(aet: string, pathId: string, body: DicomJson): Promise<void> {
  await apiFetch(`/aets/${encodeURIComponent(aet)}/rs/patients/${encodeURIComponent(pathId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/dicom+json' },
    body: JSON.stringify(body),
  })
}

/** Срок хранения: дата `ГГГГММДД` или `null` — бессрочно (с заморозкой: правила не действуют). */
export async function setExpiration(aet: string, study: string, date: string | null): Promise<void> {
  await apiFetch(`${studyPath(aet, study)}/expire/${date ?? 'never'}`, {
    method: 'PUT',
    params: date ? { FreezeExpirationDate: false } : undefined,
  })
}

/** Приватные теги dcm4chee: дата истечения срока хранения и его состояние (UPDATEABLE/FROZEN/…). */
export const STUDY_EXPIRATION_DATE = '77771023'
export const STUDY_EXPIRATION_STATE = '7777102B'
