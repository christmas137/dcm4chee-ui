import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { describeConnection, useAeList, useDevice, useDevices } from '../../api/devices'
import type { AeSummary } from '../../api/devices'
import { SendError, useEcho, useExport } from '../../api/export'
import type { ExportResult } from '../../api/export'
import type { SeriesRow } from '../../api/series'
import type { StudyRow } from '../../api/studies'
import { Dialog } from '../../components/Dialog'
import { Button, Select, TextInput } from '../../components/form'
import { Spinner } from '../../components/ui'
import { countLabel } from '../../lib/plural'

const LAST_DESTINATION = 'dcm4chee-ui.sendTo'

type Destination = { kind: 'ae'; ae: AeSummary } | { kind: 'exporter'; id: string }

const snapshots = (n: number) => countLabel(n, 'снимок', 'снимка', 'снимков')

function rememberedDestination(): string | null {
  try {
    return localStorage.getItem(LAST_DESTINATION)
  } catch {
    return null
  }
}

/**
 * Отправка исследования или серии на другой узел: на DICOM-узел напрямую (C-STORE от имени
 * архива) или настроенным экспортёром (задачей в очереди). Свои AE архива в списке не нужны.
 */
export function SendDialog({
  aet, study, series, onClose,
}: {
  aet: string
  study: StudyRow
  series: SeriesRow[]
  onClose(): void
}) {
  const aes = useAeList()
  const devices = useDevices()
  const archiveName = devices.data?.find((device) => device.hasArcDevExt)?.dicomDeviceName
  const archive = useDevice(archiveName)
  const send = useExport()
  const check = useEcho()

  const [scope, setScope] = useState('')
  const [filter, setFilter] = useState('')
  const [chosen, setChosen] = useState<string | null>(rememberedDestination)

  const nodes = useMemo(
    () => (aes.data ?? [])
      .filter((ae) => archiveName && ae.dicomDeviceName !== archiveName)
      .sort((a, b) => a.dicomAETitle.localeCompare(b.dicomAETitle)),
    [aes.data, archiveName],
  )
  const exporters = useMemo(() => {
    const list = (archive.data?.dcmDevice as { dcmArchiveDevice?: { dcmExporter?: Record<string, string>[] } } | undefined)
      ?.dcmArchiveDevice?.dcmExporter ?? []
    return list.filter((item) => item.dcmExporterID)
  }, [archive.data])

  const needle = filter.trim().toLowerCase()
  const shownNodes = nodes.filter((ae) => !needle || [
    ae.dicomAETitle, ae.dicomDescription, ae.dicomDeviceName, ...(ae.dicomNetworkConnection ?? []).map(describeConnection),
  ].join(' ').toLowerCase().includes(needle))
  const shownExporters = exporters.filter((item) => !needle
    || `${item.dcmExporterID} ${item.dicomDescription ?? ''} ${item.dcmURI ?? ''}`.toLowerCase().includes(needle))

  const destination: Destination | null = chosen?.startsWith('exporter:')
    ? exporters.some((item) => `exporter:${item.dcmExporterID}` === chosen) ? { kind: 'exporter', id: chosen.slice(9) } : null
    : (() => {
        const ae = nodes.find((item) => item.dicomAETitle === chosen)
        return ae ? { kind: 'ae' as const, ae } : null
      })()

  const scopeSeries = series.find((item) => item.seriesUID === scope)
  const count = scopeSeries ? scopeSeries.instances : study.instances
  const what = scopeSeries
    ? `серию${scopeSeries.number !== undefined ? ` #${scopeSeries.number}` : ''}${scopeSeries.description ? ` «${scopeSeries.description}»` : ''}`
    : 'исследование'
  const destinationName = destination?.kind === 'ae' ? destination.ae.dicomAETitle : destination?.id

  function choose(key: string) {
    setChosen(key)
    send.reset()
    check.reset()
    try {
      localStorage.setItem(LAST_DESTINATION, key)
    } catch { /* без запоминания — не беда */ }
  }

  function submit() {
    if (!destination) return
    send.mutate({
      aet,
      target: { study: study.studyUID, series: scopeSeries?.seriesUID },
      exporterID: destination.kind === 'ae' ? `dicom:${destination.ae.dicomAETitle}` : destination.id,
    })
  }

  const loading = aes.isPending || devices.isPending

  return (
    <Dialog
      title={`Отправить: ${study.patientName || 'без имени'}${study.description ? `, ${study.description}` : ''}`}
      onClose={onClose}
      busy={send.isPending}
      width="w-[640px]"
      footer={
        <div className="space-y-2">
          <SendOutcome
            result={send.data}
            error={send.error}
            destination={destination}
            pending={send.isPending}
          />
          <div className="flex items-center gap-2">
            {destination?.kind === 'ae' && (
              <>
                <Button
                  disabled={check.isPending || send.isPending}
                  onClick={() => check.mutate({ aet, remote: destination.ae.dicomAETitle })}
                >
                  {check.isPending ? 'Проверяем…' : 'Проверить связь'}
                </Button>
                {check.data && (
                  <span className={`text-[12px] ${check.data.ok ? 'text-ok' : 'text-danger'}`} role="status">
                    {check.data.ok ? `Связь есть, ${check.data.ms ?? 0} мс` : check.data.message}
                  </span>
                )}
              </>
            )}
            <div className="flex-1" />
            {send.data ? (
              <Button tone="primary" onClick={onClose}>Готово</Button>
            ) : (
              <Button tone="primary" disabled={!destination || send.isPending} onClick={submit}>
                {send.isPending
                  ? 'Отправляем…'
                  : destinationName
                    ? `Отправить ${count !== undefined ? snapshots(count) : what} → ${destinationName}`
                    : 'Выберите, куда отправить'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-3 p-4">
        <label className="flex items-center gap-3 text-[12px]">
          <span className="w-20 shrink-0 text-muted">Что</span>
          <Select
            aria-label="Что отправить"
            value={scope}
            disabled={send.isPending}
            onChange={(event) => {
              setScope(event.target.value)
              send.reset()
            }}
          >
            <option value="">
              Всё исследование{study.instances !== undefined ? ` — ${snapshots(study.instances)}` : ''}
            </option>
            {series.map((item) => (
              <option key={item.seriesUID} value={item.seriesUID}>
                Серия {item.number !== undefined ? `#${item.number} ` : ''}{item.description ?? item.modality ?? ''}
                {item.instances !== undefined ? ` — ${snapshots(item.instances)}` : ''}
              </option>
            ))}
          </Select>
        </label>

        <div className="flex items-center gap-3 text-[12px]">
          <span className="w-20 shrink-0 text-muted">Куда</span>
          <TextInput
            aria-label="Найти узел"
            placeholder="AE-титл, описание, адрес…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>

        {loading ? (
          <div className="py-6 text-center"><Spinner /></div>
        ) : (
          <div role="radiogroup" aria-label="Куда отправить" className="max-h-80 overflow-auto rounded-md border border-line">
            {shownNodes.length === 0 && shownExporters.length === 0 && (
              <p className="px-3 py-6 text-center text-[12px] text-muted">
                {nodes.length === 0
                  ? 'Внешних узлов пока нет — заведите их в «Конфигурации» кнопкой «Новое подключение».'
                  : 'Ничего не найдено'}
              </p>
            )}
            {shownNodes.length > 0 && <p className="bg-panel-2/50 px-3 py-1 text-[11px] font-medium text-muted">DICOM-узлы</p>}
            {shownNodes.map((ae) => (
              <DestinationRow
                key={ae.dicomAETitle}
                checked={chosen === ae.dicomAETitle}
                onSelect={() => choose(ae.dicomAETitle)}
                title={ae.dicomAETitle}
                mono
                detail={[ae.dicomDescription, (ae.dicomNetworkConnection ?? []).map(describeConnection).join(', ')]
                  .filter(Boolean).join(' · ')}
              />
            ))}
            {shownExporters.length > 0 && (
              <p className="bg-panel-2/50 px-3 py-1 text-[11px] font-medium text-muted">Экспортёры — отправка задачей в очереди</p>
            )}
            {shownExporters.map((item) => (
              <DestinationRow
                key={item.dcmExporterID}
                checked={chosen === `exporter:${item.dcmExporterID}`}
                onSelect={() => choose(`exporter:${item.dcmExporterID}`)}
                title={item.dcmExporterID}
                mono
                detail={[item.dicomDescription, item.dcmURI].filter(Boolean).join(' · ')}
              />
            ))}
          </div>
        )}
      </div>
    </Dialog>
  )
}

function DestinationRow({ checked, onSelect, title, detail, mono }: {
  checked: boolean
  onSelect(): void
  title: string
  detail: string
  mono?: boolean
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={title}
      onClick={onSelect}
      className={`flex w-full items-baseline gap-3 border-b border-line/50 px-3 py-1.5 text-left last:border-b-0 ${
        checked ? 'bg-accent/12' : 'hover:bg-panel-2'
      }`}
    >
      <span aria-hidden className={`size-2.5 shrink-0 self-center rounded-full border ${checked ? 'border-accent bg-accent' : 'border-line'}`} />
      <span className={`w-40 shrink-0 truncate text-[12.5px] ${mono ? 'font-mono' : ''}`}>{title}</span>
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">{detail}</span>
    </button>
  )
}

function SendOutcome({ result, error, destination, pending }: {
  result?: ExportResult
  error: Error | null
  destination: Destination | null
  pending: boolean
}) {
  if (pending) {
    return <p className="flex items-center gap-2 text-[12px]" role="status"><Spinner /> Архив отправляет снимки…</p>
  }
  if (error) {
    return (
      <p className="text-[12px] text-danger" role="alert">
        {error instanceof SendError ? error.message : `Не удалось отправить: ${error.message}`}
      </p>
    )
  }
  if (!result) return null
  if (result.kind === 'queued') {
    return (
      <p className="text-[12px] text-ok" role="status">
        Поставлено в очередь{result.queue ? ` «${result.queue}»` : ''}{result.taskID ? `, задача ${result.taskID}` : ''}.
        Экспортёр отправит, как дойдёт очередь.
      </p>
    )
  }
  const total = result.completed + result.failed
  if (result.failed === 0) {
    return <p className="text-[12px] text-ok" role="status">Отправлено: {snapshots(result.completed)}.</p>
  }
  const ae = destination?.kind === 'ae' ? destination.ae : undefined
  return (
    <div className="space-y-1 text-[12px]" role="alert">
      <p className="text-warn">
        {result.completed ? `Отправлено ${result.completed} из ${total}` : `Не отправлено ни одного снимка из ${total}`}:
        узел принял не всё.
      </p>
      <p className="text-muted">
        Чаще всего у узла в конфигурации перечислены не все нужные SOP-классы (транспортные возможности).
        Причина по каждому снимку — в журнале сервера архива.
        {ae && (
          <>
            {' '}
            <Link
              to="/settings"
              search={{ tab: 'ae', device: ae.dicomDeviceName, ae: ae.dicomAETitle }}
              className="text-fg underline"
            >
              Открыть настройки {ae.dicomAETitle}
            </Link>
          </>
        )}
      </p>
    </div>
  )
}
