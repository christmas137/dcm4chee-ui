import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/client'
import { deleteStudy, reject, rejectionNoteName, useRejectionNotes } from '../../api/iocm'
import type { RejectionNote } from '../../api/iocm'
import type { SeriesRow } from '../../api/series'
import type { StudyRow } from '../../api/studies'
import { Dialog } from '../../components/Dialog'
import { Button, Checkbox, Select } from '../../components/form'
import { ErrorBox, Spinner } from '../../components/ui'
import { countLabel } from '../../lib/plural'

const snapshots = (n: number) => countLabel(n, 'снимок', 'снимка', 'снимков')

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    try {
      const body = JSON.parse(error.body) as { errorMessage?: string }
      if (body.errorMessage?.includes('not permitted')) return 'настройки архива запрещают удаление'
      if (body.errorMessage) return body.errorMessage
    } catch { /* не JSON */ }
  }
  return (error as Error).message
}

/**
 * Отклонение исследования или серии с причиной — и, по желанию, безвозвратное удаление.
 * Удалить архив позволяет только отклонённое, поэтому удаление — это отклонение плюс DELETE.
 */
export function RejectDialog({
  aet, study, series, onClose, onDeleted,
}: {
  aet: string
  study: StudyRow
  series: SeriesRow[]
  onClose(): void
  onDeleted(): void
}) {
  const queryClient = useQueryClient()
  const notes = useRejectionNotes()
  const [scope, setScope] = useState('')
  const [note, setNote] = useState<RejectionNote | null>(null)
  const [remove, setRemove] = useState(false)
  const [understood, setUnderstood] = useState(false)

  const scopeSeries = series.find((item) => item.seriesUID === scope)
  const count = scopeSeries ? scopeSeries.instances : study.instances
  const willDelete = remove && !scopeSeries

  const run = useMutation({
    mutationFn: async () => {
      const rejected = await reject(aet, { study: study.studyUID, series: scopeSeries?.seriesUID }, note!)
      if (!willDelete) return { rejected, deleted: false }
      try {
        await deleteStudy(aet, study.studyUID)
      } catch (error) {
        throw new Error(`Отклонено (${snapshots(rejected)}), но удалить не удалось: ${errorText(error)}`)
      }
      return { rejected, deleted: true }
    },
    onSettled: () => {
      for (const key of ['studies', 'study', 'series', 'instances', 'studies-totals']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
    onSuccess: ({ deleted }) => (deleted ? onDeleted() : undefined),
  })

  const ready = note && (!willDelete || understood)

  return (
    <Dialog
      title={`${willDelete ? 'Удалить' : 'Отклонить'}: ${study.patientName || 'без имени'}${study.description ? `, ${study.description}` : ''}`}
      onClose={onClose}
      busy={run.isPending}
      footer={
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 text-[12px]" role="status">
            {run.isPending && <span className="flex items-center gap-2"><Spinner /> Архив обрабатывает…</span>}
            {run.data && !run.data.deleted && (
              <span className="text-ok">
                Отклонено: {snapshots(run.data.rejected)}. Из обычного поиска они пропали, в архиве остались.
              </span>
            )}
            {run.error && <span className="text-danger" role="alert">{errorText(run.error)}</span>}
          </div>
          {run.data ? (
            <Button tone="primary" onClick={onClose}>Готово</Button>
          ) : (
            <>
              <Button onClick={onClose} disabled={run.isPending}>Отмена</Button>
              <Button tone="danger" disabled={!ready || run.isPending} onClick={() => run.mutate()}>
                {willDelete ? 'Отклонить и удалить навсегда' : `Отклонить ${count !== undefined ? snapshots(count) : ''}`.trim()}
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-4 p-4">
        <label className="flex items-center gap-3 text-[12px]">
          <span className="w-20 shrink-0 text-muted">Что</span>
          <Select
            aria-label="Что отклонить"
            value={scope}
            disabled={run.isPending || Boolean(run.data)}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="">Всё исследование{study.instances !== undefined ? ` — ${snapshots(study.instances)}` : ''}</option>
            {series.map((item) => (
              <option key={item.seriesUID} value={item.seriesUID}>
                Серия {item.number !== undefined ? `#${item.number} ` : ''}{item.description ?? item.modality ?? ''}
                {item.instances !== undefined ? ` — ${snapshots(item.instances)}` : ''}
              </option>
            ))}
          </Select>
        </label>

        <div className="space-y-1">
          <p className="text-[12px] text-muted">Причина</p>
          {notes.isPending ? (
            <Spinner />
          ) : notes.error ? (
            <ErrorBox error={notes.error as Error} retry={() => void notes.refetch()} />
          ) : (
            <div role="radiogroup" aria-label="Причина отклонения" className="rounded-md border border-line">
              {(notes.data ?? []).map((item) => {
                const checked = note?.codeValue === item.codeValue && note.codingSchemeDesignator === item.codingSchemeDesignator
                return (
                  <button
                    key={`${item.codeValue}^${item.codingSchemeDesignator}`}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={rejectionNoteName(item)}
                    disabled={run.isPending || Boolean(run.data)}
                    onClick={() => setNote(item)}
                    className={`flex w-full items-baseline gap-3 border-b border-line/50 px-3 py-1.5 text-left last:border-b-0 ${
                      checked ? 'bg-accent/12' : 'hover:bg-panel-2'
                    }`}
                  >
                    <span aria-hidden className={`size-2.5 shrink-0 self-center rounded-full border ${checked ? 'border-accent bg-accent' : 'border-line'}`} />
                    <span className="flex-1 text-[12.5px]">{rejectionNoteName(item)}</span>
                    <span className="font-mono text-[10.5px] text-muted">{item.codeValue}^{item.codingSchemeDesignator}</span>
                  </button>
                )
              })}
            </div>
          )}
          <p className="text-[11px] text-muted">
            Отклонённые снимки пропадают из обычного поиска, но остаются в архиве — их видно,
            если выбрать в шапке AE для отклонённых (IOCM_*). Удаление — уже без возврата.
          </p>
        </div>

        {!scopeSeries && (
          <div className="space-y-2 rounded-md border border-danger/30 p-3">
            <Checkbox
              label="Удалить из архива безвозвратно"
              checked={remove}
              disabled={run.isPending || Boolean(run.data)}
              onChange={(checked) => {
                setRemove(checked)
                setUnderstood(false)
              }}
            />
            {remove && (
              <Checkbox
                label={<span className="text-danger">Понимаю: {count !== undefined ? snapshots(count) : 'снимки'} исчезнут навсегда, восстановить будет нельзя</span>}
                checked={understood}
                disabled={run.isPending || Boolean(run.data)}
                onChange={setUnderstood}
              />
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
