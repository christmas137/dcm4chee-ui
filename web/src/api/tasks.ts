/**
 * Задачи архива: экспорт, выдача, проверка хранения, сравнение, HL7, IAN… — каждая лежит
 * в своей очереди. Общего списка у архива нет, поэтому «все задачи» — это параллельные
 * запросы к `/queue/{очередь}` и слияние по времени изменения. Через `/queue` работают
 * и фильтры (status, batchID, StudyInstanceUID, createdTime), и действия: отмена, повтор,
 * удаление — по одной задаче и массово по фильтру. Проверено на стенде 5.35.1.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, getJson } from './client'
import type { Params } from './client'
import { humanizeSendError } from './export'

export interface Queue {
  name: string
  description?: string
}

export interface Task {
  taskID: string
  queue: string
  type: string
  status: TaskStatus
  createdTime?: string
  updatedTime?: string
  scheduledTime?: string
  processingStartTime?: string
  processingEndTime?: string
  batchID?: string
  outcomeMessage?: string
  errorMessage?: string
  failures?: string
  StudyInstanceUID?: string
  NumberOfInstances?: string
  Modality?: string[]
  ExporterID?: string
  LocalAET?: string
  RemoteAET?: string
  DestinationAET?: string
  completed?: string
  failed?: string
  warning?: string
  [key: string]: unknown
}

export const STATUSES = [
  'SCHEDULED', 'IN PROCESS', 'SCHEDULED FOR RETRY', 'FAILED', 'WARNING', 'COMPLETED', 'CANCELED',
] as const
export type TaskStatus = (typeof STATUSES)[number]

export const STATUS_LABELS: Record<TaskStatus, string> = {
  SCHEDULED: 'в очереди',
  'IN PROCESS': 'выполняется',
  'SCHEDULED FOR RETRY': 'ждёт повтора',
  FAILED: 'ошибка',
  WARNING: 'с предупреждением',
  COMPLETED: 'готово',
  CANCELED: 'отменено',
}

/** Задача ещё может измениться сама — пока такие есть, список обновляется часто. */
export const ACTIVE: TaskStatus[] = ['SCHEDULED', 'IN PROCESS', 'SCHEDULED FOR RETRY']

const QUEUE_LABELS: Record<string, string> = {
  Export: 'Экспорт',
  Retrieve: 'Выдача (C-MOVE)',
  StgVerTasks: 'Проверка хранения',
  DiffTasks: 'Сравнение архивов',
  Rejection: 'Отклонение',
  IANSCU: 'Уведомления IAN',
  MPPSSCU: 'Проброс MPPS',
  HL7Send: 'Отправка HL7',
  RSClient: 'Проброс REST',
  StgCmtSCU: 'Запросы подтверждения хранения',
  StgCmtSCP: 'Ответы на подтверждение хранения',
}

export function queueLabel(queue: Queue | string): string {
  const name = typeof queue === 'string' ? queue : queue.name
  return QUEUE_LABELS[name] ?? (typeof queue === 'string' ? name : queue.description ?? name)
}

export interface TaskFilter {
  status?: TaskStatus
  /** Начало периода по времени создания, ГГГГММДД. */
  since?: string
  batchID?: string
  study?: string
}

export function filterParams(filter: TaskFilter): Params {
  return {
    status: filter.status,
    createdTime: filter.since ? `${filter.since}-` : undefined,
    batchID: filter.batchID,
    StudyInstanceUID: filter.study,
  }
}

const queuePath = (queue: string) => `/queue/${encodeURIComponent(queue)}`

export function useQueues() {
  return useQuery({
    queryKey: ['queues'],
    queryFn: () => getJson<Queue[]>('/queue'),
    staleTime: 10 * 60 * 1000,
  })
}

/** Сколько задач в каждой очереди по фильтру — для навигатора и чтобы не опрашивать пустые. */
export async function fetchQueueCounts(queues: string[], filter: TaskFilter): Promise<Record<string, number>> {
  const counts = await Promise.all(queues.map((queue) =>
    getJson<{ count: number }>(`${queuePath(queue)}/count`, filterParams(filter)).then((result) => result.count)))
  return Object.fromEntries(queues.map((queue, index) => [queue, counts[index]]))
}

function time(task: Task): number {
  return Date.parse(task.updatedTime ?? task.createdTime ?? '') || 0
}

/** Задачи из нескольких очередей одним списком: свежие сверху. */
export async function fetchTasks(queues: string[], filter: TaskFilter, limit: number): Promise<Task[]> {
  const lists = await Promise.all(queues.map((queue) =>
    getJson<Task[]>(queuePath(queue), { ...filterParams(filter), orderby: '-updatedTime', limit })))
  return lists.flat().sort((a, b) => time(b) - time(a)).slice(0, limit)
}

export type TaskAction = 'cancel' | 'reschedule' | 'delete'

export async function taskAction(task: Pick<Task, 'queue' | 'taskID'>, action: TaskAction): Promise<void> {
  const path = `${queuePath(task.queue)}/${encodeURIComponent(task.taskID)}`
  if (action === 'delete') await apiFetch(path, { method: 'DELETE' })
  else await apiFetch(`${path}/${action}`, { method: 'POST' })
}

/** Массовое действие по фильтру во всех указанных очередях; возвращает, сколько задач затронуто. */
export async function bulkAction(queues: string[], filter: TaskFilter, action: TaskAction): Promise<number> {
  const counts = await Promise.all(queues.map(async (queue) => {
    const response = action === 'delete'
      ? await apiFetch(queuePath(queue), { method: 'DELETE', params: filterParams(filter) })
      : await apiFetch(`${queuePath(queue)}/${action}`, { method: 'POST', params: filterParams(filter) })
    const body = (await response.json().catch(() => ({}))) as { count?: number; deleted?: number }
    return body.count ?? body.deleted ?? 0
  }))
  return counts.reduce((sum, count) => sum + count, 0)
}

/** Что можно сделать с задачей в этом статусе. */
export function allowedActions(status: TaskStatus): TaskAction[] {
  switch (status) {
    case 'SCHEDULED':
    case 'IN PROCESS':
      return ['cancel']
    case 'SCHEDULED FOR RETRY':
      return ['reschedule', 'cancel', 'delete']
    default:
      return ['reschedule', 'delete']
  }
}

/** Глаголы итога по типу задачи: экспорт и выдача отправляют, проверка — проверяет. */
const OUTCOME_WORDS: Record<string, [string, string]> = {
  STGVER: ['проверено', 'не прошло проверку'],
}

/** Итог задачи человеческими словами: сколько сделано и что пошло не так. */
export function describeOutcome(task: Task): string {
  if (task.errorMessage) {
    const tries = Number(task.failures ?? 0)
    const exporter = /No Exporter configured with ID:\s*(\S+)/.exec(task.errorMessage)?.[1]
    const text = exporter
      ? `Экспортёра ${exporter} нет в конфигурации — удалён или переименован`
      : humanizeSendError(task.errorMessage)
    return `${text}${tries > 1 ? ` (попыток: ${tries})` : ''}`
  }
  const message = task.outcomeMessage ?? ''
  const completed = /completed:\s*(\d+)/.exec(message)?.[1] ?? task.completed
  const failed = /failed:\s*(\d+)/.exec(message)?.[1] ?? task.failed
  const warning = /warning:\s*(\d+)/.exec(message)?.[1] ?? task.warning
  const [done, notDone] = OUTCOME_WORDS[task.type] ?? ['отправлено', 'не удалось']
  if (completed !== undefined || failed !== undefined) {
    return [
      completed !== undefined && `${done} ${completed}`,
      failed && Number(failed) > 0 && `${notDone} ${failed}`,
      warning && Number(warning) > 0 && `с предупреждением ${warning}`,
    ].filter(Boolean).join(', ')
  }
  return message
}

/** Куда или откуда: экспортёр, пара AE для выдачи, AE архива для остального. */
export function describeTarget(task: Task): string {
  if (task.ExporterID) return task.ExporterID
  if (task.RemoteAET && task.DestinationAET) return `${task.RemoteAET} → ${task.DestinationAET}`
  return task.DestinationAET ?? task.RemoteAET ?? task.LocalAET ?? ''
}

export function useTaskAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ task, action }: { task: Task; action: TaskAction }) => taskAction(task, action),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useBulkAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ queues, filter, action }: { queues: string[]; filter: TaskFilter; action: TaskAction }) =>
      bulkAction(queues, filter, action),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })
}
