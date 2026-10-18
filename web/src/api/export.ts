/**
 * Отправка исследований и серий на другие узлы.
 *
 * Два пути, проверены на стенде 5.35.1:
 * - `export/dicom:{AE}` — архив сам открывает ассоциацию и шлёт C-STORE, ответ приходит после
 *   отправки: `{"completed":N,"failed":M}`. Если что-то не ушло — 502 с теми же счётчиками;
 *   если узел недоступен — 502 с `errorMessage`; неизвестный AE — 404.
 *   Причину отказа по снимкам архив пишет только в журнал сервера.
 * - `export/{exporterID}` — настроенный экспортёр: архив ставит задачу в очередь и сразу
 *   отвечает 202 с её описанием; итог — в мониторинге задач.
 */
import { useMutation } from '@tanstack/react-query'
import { ApiError, apiFetch } from './client'

export interface ExportTarget {
  study: string
  series?: string
}

export type ExportResult =
  | { kind: 'sent'; completed: number; failed: number }
  | { kind: 'queued'; taskID?: string; queue?: string }

function targetPath(aet: string, { study, series }: ExportTarget): string {
  const base = `/aets/${encodeURIComponent(aet)}/rs/studies/${encodeURIComponent(study)}`
  return series ? `${base}/series/${encodeURIComponent(series)}` : base
}

function parseBody(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Ошибка отправки, которую стоит показать человеку как есть: «узел недоступен», «нет такого AE». */
export class SendError extends Error {}

/** Текст ошибки архива — по-человечески. Java-исключения пересказываем, остальное — как есть. */
export function humanizeSendError(message: string): string {
  if (/UnknownHostException/.test(message)) {
    return `Архив не нашёл адрес узла: ${message.replace(/^.*UnknownHostException:\s*/, '').replace(/: System error$/, '')}`
  }
  if (/Connection refused|ConnectException/i.test(message)) return 'Узел не принимает подключение: порт закрыт или служба не запущена'
  if (/timed out|Timeout/i.test(message)) return 'Узел не ответил вовремя'
  if (/Unknown AE/.test(message)) return `Архив не знает такого AE: ${message.replace(/^.*Unknown AE:\s*/, '')}`
  return message
}

function explain(error: ApiError): never {
  const body = parseBody(error.body)
  const message = typeof body.errorMessage === 'string' ? body.errorMessage : error.message
  // На неизвестный AE эхо отвечает 404 с одним только именем AE.
  if (error.status === 404 && !/\s/.test(message)) throw new SendError(`Архив не знает такого AE: ${message}`)
  throw new SendError(humanizeSendError(message))
}

export async function exportTo(aet: string, target: ExportTarget, exporterID: string): Promise<ExportResult> {
  try {
    // Двоеточие в `dicom:AE` оставляем как есть — так путь читается в журналах архива.
    const response = await apiFetch(`${targetPath(aet, target)}/export/${encodeURIComponent(exporterID).replace('%3A', ':')}`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    })
    const body = parseBody(await response.text())
    if (response.status === 202 || 'taskID' in body) {
      return { kind: 'queued', taskID: body.taskID as string | undefined, queue: body.queue as string | undefined }
    }
    return { kind: 'sent', completed: Number(body.completed ?? 0), failed: Number(body.failed ?? 0) }
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    // Часть снимков не ушла — это результат, а не сбой запроса.
    const body = parseBody(error.body)
    if ('completed' in body || 'failed' in body) {
      return { kind: 'sent', completed: Number(body.completed ?? 0), failed: Number(body.failed ?? 0) }
    }
    explain(error)
  }
}

export interface EchoResult {
  ok: boolean
  /** Время до ответа, мс: подключение + эхо. */
  ms?: number
  message?: string
}

/** Проверка связи: C-ECHO от имени AE архива. */
export async function echo(aet: string, remote: string): Promise<EchoResult> {
  try {
    const response = await apiFetch(`/aets/${encodeURIComponent(aet)}/dimse/${encodeURIComponent(remote)}`, { method: 'POST' })
    const body = parseBody(await response.text())
    const ms = Number(body.connectionTime ?? 0) + Number(body.echoTime ?? 0)
    // Неудачное эхо — это 200 с ненулевым result и причиной в errorMessage.
    return body.result === '0' || body.result === 0
      ? { ok: true, ms }
      : { ok: false, message: typeof body.errorMessage === 'string' ? humanizeSendError(body.errorMessage) : `статус ${String(body.result)}` }
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    try {
      explain(error)
    } catch (explained) {
      return { ok: false, message: (explained as Error).message }
    }
  }
}

export function useExport() {
  return useMutation({
    mutationFn: ({ aet, target, exporterID }: { aet: string; target: ExportTarget; exporterID: string }) =>
      exportTo(aet, target, exporterID),
  })
}

export function useEcho() {
  return useMutation({ mutationFn: ({ aet, remote }: { aet: string; remote: string }) => echo(aet, remote) })
}
