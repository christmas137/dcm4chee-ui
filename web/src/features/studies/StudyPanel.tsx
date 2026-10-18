import { lazy, Suspense, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { formatBytes, formatDateTime, num, Tag } from '../../api/dicom'
import { useFirstInstance, useInstanceMetadata, useSeries, useStudy } from '../../api/series'
import type { StudiesSearch } from '../../app/searchParams'
import { ModalityList } from '../../components/Modality'
import { Segmented } from '../../components/Segmented'
import { ErrorBox, Spinner } from '../../components/ui'
import { countLabel } from '../../lib/plural'
import { Button } from '../../components/form'
import { MetadataView } from './MetadataView'
// Диалоги действий открываются редко — грузим их по требованию, а не с основным бандлом.
const SendDialog = lazy(() => import('./SendDialog').then((module) => ({ default: module.SendDialog })))
const EditDialog = lazy(() => import('./EditDialog').then((module) => ({ default: module.EditDialog })))
const RejectDialog = lazy(() => import('./RejectDialog').then((module) => ({ default: module.RejectDialog })))
import { SeriesList } from './SeriesList'

const SEX: Record<string, string> = { M: 'мужской', F: 'женский', O: 'другой' }

interface Props {
  aet: string
  studyUID: string
  series?: string
  sop?: string
  pane?: StudiesSearch['pane']
  onNavigate(patch: Pick<StudiesSearch, 'series' | 'sop' | 'pane'>): void
  onClose(): void
}

/** Панель исследования рядом со списком: серии со снимками и метаданные, без смены экрана. */
export function StudyPanel({ aet, studyUID, series, sop, pane = 'series', onNavigate, onClose }: Props) {
  const study = useStudy(aet, studyUID)
  const seriesList = useSeries(aet, studyUID)
  const [dialog, setDialog] = useState<'send' | 'edit' | 'reject' | null>(null)

  // Для метаданных нужен конкретный снимок: выбранный, иначе первый в выбранной (или первой) серии.
  const targetSeries = series ?? seriesList.data?.[0]?.seriesUID
  const firstInstance = useFirstInstance(aet, studyUID, targetSeries, pane === 'meta' && !sop)
  const targetSop = sop ?? firstInstance.data?.sopUID ?? undefined
  const metadata = useInstanceMetadata(aet, studyUID, pane === 'meta' ? targetSeries : undefined, targetSop)

  const row = study.data
  const seriesInfo = seriesList.data?.find((item) => item.seriesUID === targetSeries)

  return (
    <aside aria-label="Исследование" className="flex w-[540px] shrink-0 flex-col border-l border-line bg-panel">
      <header className="border-b border-line px-4 pt-3 pb-3">
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 text-[19px] leading-tight font-semibold">
            {study.isPending ? <Spinner /> : row ? row.patientName || 'Без имени' : 'Исследование не найдено'}
          </h2>
          <button type="button" aria-label="Закрыть панель" onClick={onClose}
            className="-mt-0.5 rounded px-1.5 py-0.5 text-muted hover:bg-panel-2 hover:text-fg">
            ✕
          </button>
        </div>
        {row && (
          <>
            <dl className="mt-1 flex flex-wrap gap-x-4 text-[12px] text-muted">
              <div className="flex gap-1"><dt className="sr-only">ID пациента</dt><dd className="text-fg">{row.patientID}</dd></div>
              {row.birthDate && (
                <div className="flex gap-1"><dt>родился</dt><dd className="text-fg">{formatDateTime(row.birthDate)}</dd></div>
              )}
              {row.sex && <div className="flex gap-1"><dt className="sr-only">Пол</dt><dd>{SEX[row.sex] ?? row.sex}</dd></div>}
            </dl>

            <div className="mt-3 rounded-md border border-line bg-bg/60 px-3 py-2">
              <p className="text-[14px] font-medium">{row.description || 'Без описания'}</p>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
                <dt className="text-muted">Дата</dt>
                <dd>{formatDateTime(row.studyDate, row.studyTime)}</dd>
                <dt className="text-muted">Модальность</dt>
                <dd><ModalityList modalities={row.modalities} /></dd>
                {row.accession && (<><dt className="text-muted">№ назначения</dt><dd>{row.accession}</dd></>)}
                <dt className="text-muted">Объём</dt>
                <dd>
                  {[
                    row.series !== undefined && countLabel(row.series, 'серия', 'серии', 'серий'),
                    row.instances !== undefined && countLabel(row.instances, 'снимок', 'снимка', 'снимков'),
                    row.sizeKB !== undefined && formatBytes(row.sizeKB * 1024),
                  ].filter(Boolean).join(', ')}
                </dd>
              </dl>
            </div>
          </>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Действия с исследованием">
          <Link
            to="/view"
            search={{ study: studyUID, series }}
            title="Открыть во вьюере — V"
            className="flex h-7 items-center rounded-md bg-accent px-3 text-[12.5px] font-medium text-accent-fg hover:opacity-90"
          >
            Смотреть снимки
          </Link>
          {/* Остальным действиям нужны данные исследования — до загрузки они неактивны. */}
          <Button disabled={!row} onClick={() => setDialog('send')}>Отправить</Button>
          <Button disabled={!row} onClick={() => setDialog('edit')}>Изменить</Button>
          <div className="flex-1" />
          <Button tone="danger" disabled={!row} onClick={() => setDialog('reject')}>Отклонить или удалить</Button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Segmented
            asTabs
            size="sm"
            label="Содержимое исследования"
            options={[{ value: 'series', label: 'Серии' }, { value: 'meta', label: 'Метаданные' }]}
            value={pane}
            onChange={(next) => onNavigate({ pane: next })}
          />
        </div>
      </header>

      {seriesList.error ? (
        <ErrorBox error={seriesList.error as Error} retry={() => void seriesList.refetch()} />
      ) : pane === 'series' ? (
        <div className="min-h-0 flex-1 overflow-auto">
          {seriesList.isPending ? (
            <div className="p-3"><Spinner /></div>
          ) : (
            <SeriesList
              aet={aet}
              studyUID={studyUID}
              series={seriesList.data ?? []}
              openSeries={series}
              selectedSop={sop}
              onToggleSeries={(uid) => onNavigate({ series: uid === series ? undefined : uid, sop: undefined })}
              onOpenInstance={(seriesUID, sopUID) => onNavigate({ series: seriesUID, sop: sopUID, pane: 'meta' })}
            />
          )}
        </div>
      ) : metadata.error ? (
        <ErrorBox error={metadata.error as Error} retry={() => void metadata.refetch()} />
      ) : metadata.data ? (
        <MetadataView
          key={targetSop}
          dataset={metadata.data}
          caption={[
            seriesInfo && `Серия ${seriesInfo.number !== undefined ? `#${seriesInfo.number} ` : ''}${seriesInfo.description ?? ''}`.trim(),
            `снимок #${num(metadata.data, Tag.InstanceNumber) ?? '?'}`,
          ].filter(Boolean).join(', ')}
        />
      ) : seriesList.data?.length === 0 ? (
        <p className="p-3 text-[12px] text-muted">В исследовании нет серий.</p>
      ) : (
        <div className="p-3"><Spinner /></div>
      )}
      <Suspense fallback={null}>
      {dialog === 'send' && row && (
        <SendDialog aet={aet} study={row} series={seriesList.data ?? []} onClose={() => setDialog(null)} />
      )}
      {dialog === 'edit' && <EditDialog aet={aet} studyUID={studyUID} onClose={() => setDialog(null)} />}
      {dialog === 'reject' && row && (
        <RejectDialog
          aet={aet}
          study={row}
          series={seriesList.data ?? []}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            setDialog(null)
            onClose()
          }}
        />
      )}
      </Suspense>
    </aside>
  )
}
