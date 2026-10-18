import { Fragment, useMemo, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ACTIVE, allowedActions, describeOutcome, describeTarget, fetchQueueCounts, fetchTasks, queueLabel, STATUS_LABELS,
  STATUSES, useBulkAction, useQueues, useTaskAction,
} from '../../api/tasks'
import type { Task, TaskAction, TaskFilter, TaskStatus } from '../../api/tasks'
import type { TasksSearch } from '../../app/searchParams'
import { Dialog } from '../../components/Dialog'
import { Button, TextInput } from '../../components/form'
import { Segmented } from '../../components/Segmented'
import { EmptyState, ErrorBox, Spinner } from '../../components/ui'
import { countLabel } from '../../lib/plural'
import { daysAgoDA, formatFull, formatMoment } from '../../lib/time'

const PAGE = 100

const STATUS_TONE: Record<TaskStatus, string> = {
  SCHEDULED: 'text-muted',
  'IN PROCESS': 'text-fg',
  'SCHEDULED FOR RETRY': 'text-warn',
  FAILED: 'text-danger',
  WARNING: 'text-warn',
  COMPLETED: 'text-ok',
  CANCELED: 'text-muted',
}

const ACTION_LABELS: Record<TaskAction, string> = { reschedule: 'Повторить', cancel: 'Отменить', delete: 'Удалить' }

const SINCE: Record<NonNullable<TasksSearch['since']>, number> = { today: 0, '7d': 6, '30d': 29 }

function isStatus(value: string | undefined): value is TaskStatus {
  return (STATUSES as readonly string[]).includes(value ?? '')
}

const tasks = (n: number) => countLabel(n, 'задача', 'задачи', 'задач')

/**
 * Все задачи архива одним списком: экспорт, выдача, проверка хранения и прочие очереди.
 * Фильтры — в адресе; пока есть незавершённые задачи, список обновляется сам.
 */
export function TasksPage() {
  const search = useSearch({ from: '/tasks' })
  const navigate = useNavigate()
  const update = (patch: Partial<TasksSearch>) =>
    void navigate({ to: '/tasks', search: (prev) => ({ ...prev, ...patch }) })

  const status = isStatus(search.status) ? search.status : undefined
  const scope: TaskFilter = {
    since: search.since ? daysAgoDA(SINCE[search.since]) : undefined,
    batchID: search.batch,
    study: search.study,
  }
  const filter: TaskFilter = { ...scope, status }
  const [limit, setLimit] = useState(PAGE)
  const [bulk, setBulk] = useState<TaskAction | null>(null)

  const queues = useQueues()
  const allQueues = useMemo(() => (queues.data ?? []).map((queue) => queue.name), [queues.data])

  // Сколько задач в каждой очереди (без фильтра статуса) — для навигатора и чтобы не опрашивать пустые.
  const queueCounts = useQuery({
    queryKey: ['tasks', 'queue-counts', allQueues, scope],
    enabled: allQueues.length > 0,
    queryFn: () => fetchQueueCounts(allQueues, scope),
    refetchInterval: 15_000,
  })
  const busyQueues = allQueues.filter((queue) => (queueCounts.data?.[queue] ?? 0) > 0)
  const selected = search.queue ? [search.queue] : busyQueues

  const statusCounts = useQuery({
    queryKey: ['tasks', 'status-counts', selected, scope],
    enabled: queueCounts.isSuccess && selected.length > 0,
    queryFn: async () => {
      const results = await Promise.all(STATUSES.map((item) => fetchQueueCounts(selected, { ...scope, status: item })))
      return Object.fromEntries(STATUSES.map((item, index) => [
        item, Object.values(results[index]).reduce((sum, count) => sum + count, 0),
      ])) as Record<TaskStatus, number>
    },
    refetchInterval: 15_000,
  })

  const list = useQuery({
    queryKey: ['tasks', 'list', selected, filter, limit],
    enabled: queueCounts.isSuccess,
    queryFn: () => (selected.length ? fetchTasks(selected, filter, limit) : Promise.resolve([])),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((task) => ACTIVE.includes(task.status)) ? 5_000 : 30_000,
  })

  const total = search.queue
    ? queueCounts.data?.[search.queue] ?? 0
    : Object.values(queueCounts.data ?? {}).reduce((sum, count) => sum + count, 0)
  const matching = status ? statusCounts.data?.[status] ?? 0 : total
  const bulkActions: TaskAction[] = status
    ? ACTIVE.includes(status) ? ['cancel'] : ['reschedule', 'delete']
    : []

  return (
    <div className="flex h-full min-h-0">
      <nav aria-label="Очереди" className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
        <p className="px-3 pt-3 pb-1 text-[11.5px] font-semibold text-muted">Очереди</p>
        <div className="min-h-0 flex-1 overflow-auto pb-2">
          <QueueButton label="Все задачи" count={total} active={!search.queue} onClick={() => update({ queue: undefined, open: undefined })} />
          {(queues.data ?? []).map((queue) => (
            <QueueButton
              key={queue.name}
              label={queueLabel(queue)}
              count={queueCounts.data?.[queue.name]}
              active={search.queue === queue.name}
              onClick={() => update({ queue: queue.name, open: undefined })}
            />
          ))}
          {queues.isPending && <div className="px-3 py-2"><Spinner /></div>}
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-2">
          <div role="group" aria-label="Статус" className="flex flex-wrap gap-1">
            <StatusChip label="Все" active={!status} onClick={() => update({ status: undefined })} />
            {STATUSES.map((item) => (
              <StatusChip
                key={item}
                label={STATUS_LABELS[item]}
                count={statusCounts.data?.[item]}
                tone={STATUS_TONE[item]}
                active={status === item}
                onClick={() => update({ status: status === item ? undefined : item })}
              />
            ))}
          </div>
          <div className="flex-1" />
          <Segmented
            size="sm"
            label="Период"
            value={search.since ?? 'all'}
            onChange={(value) => update({ since: value === 'all' ? undefined : value })}
            options={[
              { value: 'all', label: 'Всё время' },
              { value: 'today', label: 'Сегодня' },
              { value: '7d', label: '7 дней' },
              { value: '30d', label: '30 дней' },
            ]}
          />
          <span className="w-40">
            <TextInput
              key={search.batch ?? ''}
              aria-label="Пакет"
              placeholder="Пакет (batch ID)"
              defaultValue={search.batch ?? ''}
              onKeyDown={(event) => {
                if (event.key === 'Enter') update({ batch: event.currentTarget.value.trim() || undefined })
              }}
              onBlur={(event) => update({ batch: event.currentTarget.value.trim() || undefined })}
            />
          </span>
          <Button aria-label="Обновить" onClick={() => void list.refetch()} title="Обновить сейчас">⟳</Button>
        </div>

        {(search.study || search.batch) && (
          <div className="flex items-center gap-2 border-b border-line px-4 py-1.5 text-[12px]">
            {search.study && <FilterTag label={`исследование ${search.study}`} onRemove={() => update({ study: undefined })} />}
            {search.batch && <FilterTag label={`пакет ${search.batch}`} onRemove={() => update({ batch: undefined })} />}
          </div>
        )}

        {bulkActions.length > 0 && matching > 0 && (
          <div className="flex items-center gap-2 border-b border-line bg-panel-2/40 px-4 py-1.5 text-[12px]">
            <span className="flex-1">
              {tasks(matching)} со статусом «{STATUS_LABELS[status!]}»
              {search.queue ? ` в очереди «${queueLabel(search.queue)}»` : ''}
            </span>
            {bulkActions.map((action) => (
              <Button key={action} tone={action === 'delete' ? 'danger' : 'ghost'} onClick={() => setBulk(action)}>
                {ACTION_LABELS[action]} все
              </Button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {queues.error || queueCounts.error || list.error ? (
            <ErrorBox error={(queues.error ?? queueCounts.error ?? list.error) as Error} retry={() => void list.refetch()} />
          ) : !list.data ? (
            <div className="p-4"><Spinner /></div>
          ) : list.data.length === 0 ? (
            <EmptyState
              title={total === 0 && !status ? 'Задач нет' : 'Под фильтр ничего не подходит'}
              hint={total === 0 && !status ? 'Задачи появляются, когда архив экспортирует, забирает или проверяет исследования.' : undefined}
            />
          ) : (
            <TaskTable tasks={list.data} openKey={search.open} onToggle={(key) => update({ open: search.open === key ? undefined : key })} />
          )}
          {list.data && list.data.length >= limit && (
            <div className="p-3 text-center">
              <Button onClick={() => setLimit((value) => value + PAGE)}>Показать ещё</Button>
            </div>
          )}
        </div>
      </div>

      {bulk && status && (
        <BulkDialog
          action={bulk}
          count={matching}
          status={status}
          queues={selected}
          filter={filter}
          onClose={() => setBulk(null)}
        />
      )}
    </div>
  )
}

function QueueButton({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1 text-left text-[12.5px] ${
        active ? 'bg-accent/15 font-medium' : 'hover:bg-panel-2'
      } ${count === 0 && !active ? 'text-muted' : ''}`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>{' '}
      <span className="text-[11.5px] text-muted tabular-nums">{count ?? ''}</span>
    </button>
  )
}

function StatusChip({ label, count, tone = '', active, onClick }: {
  label: string
  count?: number
  tone?: string
  active: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] ${
        active ? 'border-accent bg-accent text-accent-fg' : 'border-line hover:bg-panel-2'
      } ${count === 0 && !active ? 'opacity-50' : ''}`}
    >
      <span className={active ? '' : tone}>{label}</span>{' '}
      {count !== undefined && <span className={`tabular-nums ${active ? '' : 'text-muted'}`}>{count}</span>}
    </button>
  )
}

function FilterTag({ label, onRemove }: { label: string; onRemove(): void }) {
  return (
    <span className="flex items-center gap-1 rounded border border-line py-0.5 pr-0.5 pl-2">
      <span className="max-w-96 truncate font-mono text-[11px]">{label}</span>
      <button type="button" aria-label={`Убрать фильтр: ${label}`} onClick={onRemove} className="rounded px-1 text-muted hover:text-fg">✕</button>
    </span>
  )
}

const taskKey = (task: Task) => `${task.queue}/${task.taskID}`

function TaskTable({ tasks: rows, openKey, onToggle }: { tasks: Task[]; openKey?: string; onToggle(key: string): void }) {
  const action = useTaskAction()
  return (
    <table className="w-full border-collapse text-[12px]">
      <thead className="sticky top-0 z-10 bg-panel text-[11px] text-muted">
        <tr className="border-b border-line">
          <th className="px-4 py-1.5 text-left font-medium">Статус</th>
          <th className="px-3 py-1.5 text-left font-medium">Задача</th>
          <th className="px-3 py-1.5 text-left font-medium">Что</th>
          <th className="px-3 py-1.5 text-left font-medium">Куда</th>
          <th className="px-3 py-1.5 text-left font-medium">Итог</th>
          <th className="px-3 py-1.5 text-left font-medium">Изменена</th>
          <th className="w-0" />
        </tr>
      </thead>
      <tbody>
        {rows.map((task) => {
          const key = taskKey(task)
          const open = openKey === key
          const pending = action.isPending && action.variables?.task.taskID === task.taskID
          return (
            <Fragment key={key}>
              <tr
                data-task={key}
                onClick={() => onToggle(key)}
                className={`cursor-default border-b border-line/50 align-top ${open ? 'bg-accent/8' : 'hover:bg-panel-2'}`}
              >
                <td className={`px-4 py-1.5 whitespace-nowrap ${STATUS_TONE[task.status] ?? ''}`}>
                  {task.status === 'IN PROCESS' && <Spinner className="mr-1.5 size-3 align-[-2px]" />}
                  {STATUS_LABELS[task.status] ?? task.status}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {queueLabel(task.queue)}
                  <span className="ml-1.5 text-[11px] text-muted">#{task.taskID}</span>
                </td>
                <td className="max-w-64 px-3 py-1.5">
                  {task.StudyInstanceUID ? (
                    <Link
                      to="/studies"
                      search={{ q: task.StudyInstanceUID, study: task.StudyInstanceUID }}
                      onClick={(event) => event.stopPropagation()}
                      className="block truncate font-mono text-[11px] hover:underline"
                      title={task.StudyInstanceUID}
                    >
                      {task.StudyInstanceUID}
                    </Link>
                  ) : <span className="text-muted">—</span>}
                  {(task.Modality?.length || task.NumberOfInstances) && (
                    <span className="text-[11px] text-muted">
                      {[task.Modality?.join(', '), task.NumberOfInstances && countLabel(Number(task.NumberOfInstances), 'снимок', 'снимка', 'снимков')]
                        .filter(Boolean).join(' · ')}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 font-mono text-[11px] whitespace-nowrap">{describeTarget(task)}</td>
                <td className="max-w-80 px-3 py-1.5">
                  <span className="line-clamp-2">{describeOutcome(task)}</span>
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-muted" title={formatFull(task.updatedTime)}>
                  {formatMoment(task.updatedTime)}
                </td>
                <td className="px-2 py-1 whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                  <span className="flex gap-1">
                    {allowedActions(task.status).map((item) => (
                      <Button
                        key={item}
                        tone={item === 'delete' ? 'danger' : 'ghost'}
                        disabled={pending}
                        aria-label={`${ACTION_LABELS[item]} задачу ${task.taskID}`}
                        onClick={() => action.mutate({ task, action: item })}
                      >
                        {item === 'delete' ? '✕' : ACTION_LABELS[item]}
                      </Button>
                    ))}
                  </span>
                </td>
              </tr>
              {open && (
                <tr className="border-b border-line/50 bg-accent/4">
                  <td colSpan={7} className="px-4 py-2">
                    <TaskDetails task={task} />
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
      {action.error && (
        <caption className="caption-bottom p-2 text-left text-[12px] text-danger" role="alert">
          Не удалось: {(action.error as Error).message}
        </caption>
      )}
    </table>
  )
}

const DETAIL_LABELS: [string, string, 'time' | 'mono' | 'text'][] = [
  ['createdTime', 'Создана', 'time'],
  ['scheduledTime', 'Запланирована на', 'time'],
  ['processingStartTime', 'Начата', 'time'],
  ['processingEndTime', 'Закончена', 'time'],
  ['failures', 'Неудачных попыток', 'text'],
  ['batchID', 'Пакет', 'mono'],
  ['outcomeMessage', 'Сообщение архива', 'text'],
  ['errorMessage', 'Ошибка', 'text'],
  ['StudyInstanceUID', 'Исследование', 'mono'],
  ['ExporterID', 'Экспортёр', 'mono'],
  ['LocalAET', 'AE архива', 'mono'],
  ['RemoteAET', 'Откуда (C-MOVE SCP)', 'mono'],
  ['DestinationAET', 'Куда', 'mono'],
  ['RequesterUserID', 'Кто запросил', 'text'],
  ['RequestURI', 'Запрос', 'mono'],
  ['dicomDeviceName', 'Устройство', 'mono'],
]

function TaskDetails({ task }: { task: Task }) {
  const known = new Set(['taskID', 'queue', 'type', 'status', 'updatedTime', 'RequesterHostName', 'Modality', 'NumberOfInstances',
    ...DETAIL_LABELS.map(([key]) => key)])
  const rest = Object.entries(task).filter(([key, value]) => !known.has(key) && value !== undefined && value !== '')
  return (
    <dl aria-label={`Подробности задачи ${task.taskID}`} className="grid grid-cols-[180px_1fr] gap-x-4 gap-y-0.5 text-[12px]">
      {DETAIL_LABELS.filter(([key]) => task[key] !== undefined && task[key] !== '').map(([key, label, kind]) => (
        <Fragment key={key}>
          <dt className="text-muted">{label}</dt>
          <dd className={`break-all ${kind === 'mono' ? 'font-mono text-[11px]' : ''}`}>
            {kind === 'time' ? formatFull(String(task[key])) : String(task[key])}
          </dd>
        </Fragment>
      ))}
      {rest.map(([key, value]) => (
        <Fragment key={key}>
          <dt className="font-mono text-[11px] text-muted">{key}</dt>
          <dd className="font-mono text-[11px] break-all">{Array.isArray(value) ? value.join(', ') : String(value)}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

function BulkDialog({ action, count, status, queues, filter, onClose }: {
  action: TaskAction
  count: number
  status: TaskStatus
  queues: string[]
  filter: TaskFilter
  onClose(): void
}) {
  const bulk = useBulkAction()
  const verb = { reschedule: 'Повторить', cancel: 'Отменить', delete: 'Удалить' }[action]
  return (
    <Dialog
      title={`${verb} ${tasks(count)}`}
      onClose={onClose}
      busy={bulk.isPending}
      width="w-[460px]"
      footer={
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-[12px]" role="status">
            {bulk.data !== undefined && <span className="text-ok">Готово: {tasks(bulk.data)}.</span>}
            {bulk.error && <span className="text-danger">{(bulk.error as Error).message}</span>}
          </p>
          {bulk.data !== undefined ? (
            <Button tone="primary" onClick={onClose}>Закрыть</Button>
          ) : (
            <>
              <Button onClick={onClose} disabled={bulk.isPending}>Отмена</Button>
              <Button
                tone={action === 'delete' ? 'danger' : 'primary'}
                disabled={bulk.isPending}
                onClick={() => bulk.mutate({ queues, filter, action })}
              >
                {bulk.isPending ? 'Выполняем…' : verb}
              </Button>
            </>
          )}
        </div>
      }
    >
      <p className="p-4 text-[12.5px]">
        {verb} все задачи со статусом «{STATUS_LABELS[status]}»
        {queues.length === 1 ? ` в очереди «${queueLabel(queues[0])}»` : ` во всех очередях (${queues.map(queueLabel).join(', ')})`}
        {filter.since || filter.batchID || filter.study ? ' с учётом остальных фильтров' : ''}.
        {action === 'delete' && ' Записи о задачах удалятся; сами исследования не пострадают.'}
        {action === 'reschedule' && ' Архив выполнит их заново.'}
      </p>
    </Dialog>
  )
}
