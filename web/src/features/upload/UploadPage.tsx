import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { formatBytes, formatDateTime } from '../../api/dicom'
import { useArchive } from '../../app/ArchiveContext'
import { Button, Select } from '../../components/form'
import { ModalityList } from '../../components/Modality'
import { Spinner } from '../../components/ui'
import { countLabel } from '../../lib/plural'
import { pickedFromDrop, pickedFromList } from './pick'
import type { StudyGroup } from './scan'
import { useUpload } from './useUpload'
import type { FileOutcome, Phase } from './useUpload'

const snapshots = (n: number) => countLabel(n, 'снимок', 'снимка', 'снимков')

/** Загрузка в архив: файлы, папки, ZIP → проверка до отправки → STOW-RS пачками → отчёт. */
export function UploadPage() {
  const { aet, aets } = useArchive()
  const [target, setTarget] = useState<string | null>(null)
  const destination = target ?? aet
  const upload = useUpload()
  const [dragging, setDragging] = useState(false)
  const filesInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  const busy = upload.phase === 'scanning' || upload.phase === 'uploading'
  const total = upload.groups.reduce((sum, group) => sum + group.files.length, 0)
  const totalBytes = upload.groups.reduce((sum, group) => sum + group.bytes, 0)
  const empty = upload.phase === 'idle'

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (busy || upload.phase === 'done') return
    void pickedFromDrop(event.dataTransfer).then(upload.add)
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onDragOver={(event) => {
        event.preventDefault()
        if (!busy && upload.phase !== 'done') setDragging(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
        <h1 className="text-[14px] font-semibold">Загрузка в архив</h1>
        <label className="flex items-center gap-2 text-[12px] text-muted">
          куда
          <Select
            aria-label="AE архива, куда загружать"
            value={destination}
            disabled={busy}
            onChange={(event) => setTarget(event.target.value)}
            className="w-auto font-mono"
          >
            {aets.map((item) => <option key={item.dicomAETitle} value={item.dicomAETitle}>{item.dicomAETitle}</option>)}
          </Select>
        </label>
        <div className="flex-1" />
        {!empty && upload.phase !== 'uploading' && (
          <Button onClick={upload.reset} disabled={busy}>{upload.phase === 'done' ? 'Загрузить ещё' : 'Очистить'}</Button>
        )}
        {upload.phase === 'ready' && (
          <>
            <Button onClick={() => filesInput.current?.click()}>+ Файлы</Button>
            <Button tone="primary" disabled={total === 0} onClick={() => void upload.upload(destination)}>
              Загрузить {snapshots(total)} в {destination}
            </Button>
          </>
        )}
        {upload.phase === 'uploading' && <Button tone="danger" onClick={upload.stop}>Остановить</Button>}
      </div>

      <input
        ref={filesInput}
        type="file"
        multiple
        hidden
        aria-label="Выбрать файлы"
        onChange={(event) => {
          void upload.add(pickedFromList(event.target.files))
          event.target.value = ''
        }}
      />
      <input
        ref={folderInput}
        type="file"
        hidden
        aria-label="Выбрать папку"
        {...{ webkitdirectory: '' }}
        onChange={(event) => {
          void upload.add(pickedFromList(event.target.files))
          event.target.value = ''
        }}
      />

      {empty ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div
            className={`flex w-full max-w-2xl flex-col items-center gap-3 rounded-xl border-2 border-dashed px-8 py-16 text-center ${
              dragging ? 'border-accent bg-accent/5' : 'border-line'
            }`}
          >
            <p className="text-[16px] font-medium">Перетащите сюда файлы DICOM, папки или ZIP</p>
            <p className="max-w-md text-[12px] text-muted">
              Перед отправкой покажем, какие исследования нашлись и что будет пропущено.
              Повторная загрузка уже имеющихся снимков ничего не испортит — архив их узнает.
            </p>
            <div className="mt-2 flex gap-2">
              <Button tone="primary" onClick={() => filesInput.current?.click()}>Выбрать файлы</Button>
              <Button onClick={() => folderInput.current?.click()}>Выбрать папку</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <Summary
            phase={upload.phase}
            scanProgress={upload.scanProgress}
            studies={upload.groups.length}
            total={total}
            totalBytes={totalBytes}
            skipped={upload.skipped.length}
            duplicates={upload.duplicates}
            outcomes={upload.outcomes}
            progress={upload.progress}
            error={upload.error}
            dragging={dragging}
          />

          {upload.groups.length > 0 && (
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-panel text-[11px] text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-1.5 text-left font-medium">Пациент</th>
                  <th className="px-3 py-1.5 text-left font-medium">Дата</th>
                  <th className="px-3 py-1.5 text-left font-medium">Исследование</th>
                  <th className="px-3 py-1.5 text-right font-medium">Снимков</th>
                  <th className="px-3 py-1.5 text-right font-medium">Объём</th>
                  <th className="px-4 py-1.5 text-left font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {upload.groups.map((group) => (
                  <GroupRow key={group.studyUID} group={group} phase={upload.phase} outcomes={upload.outcomes} />
                ))}
              </tbody>
            </table>
          )}

          {upload.skipped.length > 0 && (
            <details className="border-t border-line px-4 py-3">
              <summary className="cursor-pointer text-[12px] text-muted">
                Пропущено: {countLabel(upload.skipped.length, 'файл', 'файла', 'файлов')}
              </summary>
              <ul aria-label="Пропущенные файлы" className="mt-2 space-y-0.5 text-[12px]">
                {upload.skipped.map((item) => (
                  <li key={item.path} className="flex gap-3">
                    <span className="min-w-0 truncate font-mono text-[11px]">{item.path}</span>
                    <span className="shrink-0 text-muted">{item.kind === 'skipped' && item.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

function Summary({
  phase, scanProgress, studies, total, totalBytes, skipped, duplicates, outcomes, progress, error, dragging,
}: {
  phase: Phase
  scanProgress: { done: number; total: number } | null
  studies: number
  total: number
  totalBytes: number
  skipped: number
  duplicates: number
  outcomes: Map<string, FileOutcome>
  progress: { files: number; totalFiles: number; bytes: number; totalBytes: number } | null
  error: string | null
  dragging: boolean
}) {
  const stored = [...outcomes.values()].filter((outcome) => outcome.status === 'stored').length
  const failed = [...outcomes.values()].filter((outcome) => outcome.status === 'failed').length
  const notSent = phase === 'done' ? total - stored - failed : 0

  return (
    <div className={`space-y-2 border-b border-line px-4 py-3 ${dragging ? 'bg-accent/5' : ''}`} role="status">
      {phase === 'scanning' && scanProgress ? (
        <p className="flex items-center gap-2 text-[13px]">
          <Spinner /> Читаем файлы… {scanProgress.done} из {scanProgress.total}
        </p>
      ) : phase === 'done' ? (
        <p className="text-[13px]">
          <span className={failed || notSent ? 'text-warn' : 'text-ok'}>
            Загружено {stored} из {total}
          </span>
          {failed > 0 && <span className="text-danger"> · не принято: {failed}</span>}
          {notSent > 0 && <span className="text-muted"> · не отправлено: {notSent}</span>}
        </p>
      ) : (
        <p className="text-[13px]">
          {total
            ? <>Найдено {snapshots(total)} в {countLabel(studies, 'исследовании', 'исследованиях', 'исследованиях')}, {formatBytes(totalBytes)}</>
            : 'DICOM-снимков среди выбранного нет'}
          {skipped > 0 && <span className="text-muted"> · пропущено {countLabel(skipped, 'файл', 'файла', 'файлов')}</span>}
          {duplicates > 0 && <span className="text-muted"> · повторов {duplicates}</span>}
          {phase === 'ready' && <span className="text-muted"> · можно добавить ещё, перетащив сюда</span>}
        </p>
      )}

      {progress && (phase === 'uploading' || phase === 'done') && (
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-label="Загрузка"
            aria-valuemin={0}
            aria-valuemax={progress.totalBytes}
            aria-valuenow={progress.bytes}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2"
          >
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${progress.totalBytes ? (progress.bytes / progress.totalBytes) * 100 : 100}%` }}
            />
          </div>
          <span className="shrink-0 text-[11px] text-muted tabular-nums">
            {progress.files} / {progress.totalFiles} · {formatBytes(progress.bytes)} из {formatBytes(progress.totalBytes)}
          </span>
        </div>
      )}

      {error && <p className="text-[12px] text-danger">Загрузка прервана: {error}</p>}
    </div>
  )
}

function GroupRow({ group, phase, outcomes }: { group: StudyGroup; phase: Phase; outcomes: Map<string, FileOutcome> }) {
  const results = group.files.map((item) => ({ item, outcome: outcomes.get(item.info.sopUID) }))
  const stored = results.filter((result) => result.outcome?.status === 'stored').length
  const failures = results.filter((result) => result.outcome?.status === 'failed')
  const warnings = results.filter((result) => result.outcome?.status === 'stored' && result.outcome.warning)
  const sent = stored + failures.length

  let status
  if (phase === 'scanning' || phase === 'ready') status = <span className="text-muted">готово к отправке</span>
  else if (phase === 'uploading' && sent < group.files.length) {
    status = <span className="text-muted">{sent ? `загружено ${sent} из ${group.files.length}` : 'в очереди'}</span>
  } else if (sent === 0) status = <span className="text-muted">не отправлено</span>
  else {
    status = (
      <span className="flex flex-wrap items-center gap-x-3">
        <span className={failures.length ? 'text-warn' : 'text-ok'}>
          {failures.length ? `принято ${stored} из ${group.files.length}` : 'загружено'}
        </span>
        {stored > 0 && (
          <Link
            to="/studies"
            search={{ q: group.studyUID, study: group.studyUID }}
            className="text-fg underline-offset-2 hover:underline"
          >
            Открыть
          </Link>
        )}
      </span>
    )
  }

  return (
    <>
      <tr className="border-b border-line/50 align-top" data-study={group.studyUID}>
        <td className="px-4 py-2">
          <p className="font-medium">{group.patientName || 'Без имени'}</p>
          <p className="text-[11px] text-muted">{group.patientID}</p>
        </td>
        <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(group.studyDate)}</td>
        <td className="px-3 py-2">
          <p>{group.description || 'Без описания'}</p>
          <p className="text-[11px] text-muted">
            <ModalityList modalities={group.modalities} />
            {' '}{countLabel(group.series, 'серия', 'серии', 'серий')}
          </p>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{group.files.length}</td>
        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatBytes(group.bytes)}</td>
        <td className="px-4 py-2">{status}</td>
      </tr>
      {(failures.length > 0 || warnings.length > 0) && (
        <tr className="border-b border-line/50">
          <td colSpan={6} className="px-4 pb-2">
            <ul aria-label={`Проблемы: ${group.patientName}`} className="space-y-0.5 text-[11.5px]">
              {failures.map(({ item, outcome }) => (
                <li key={item.path} className="flex gap-3">
                  <span className="min-w-0 truncate font-mono text-[11px]">{item.path}</span>
                  <span className="text-danger">{outcome?.status === 'failed' && outcome.reason}</span>
                </li>
              ))}
              {warnings.map(({ item, outcome }) => (
                <li key={item.path} className="flex gap-3">
                  <span className="min-w-0 truncate font-mono text-[11px]">{item.path}</span>
                  <span className="text-warn">{outcome?.status === 'stored' && outcome.warning}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
}
