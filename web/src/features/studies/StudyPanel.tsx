import { formatBytes, formatDateTime, num, Tag } from '../../api/dicom'
import { useFirstInstance, useInstanceMetadata, useSeries, useStudy } from '../../api/series'
import type { StudiesSearch } from '../../app/searchParams'
import { ErrorBox, Spinner } from '../../components/ui'
import { countLabel } from '../../lib/plural'
import { MetadataView } from './MetadataView'
import { SeriesList } from './SeriesList'

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

  // Для метаданных нужен конкретный снимок: выбранный, иначе первый в выбранной (или первой) серии.
  const targetSeries = series ?? seriesList.data?.[0]?.seriesUID
  const firstInstance = useFirstInstance(aet, studyUID, targetSeries, pane === 'meta' && !sop)
  const targetSop = sop ?? firstInstance.data?.sopUID ?? undefined
  const metadata = useInstanceMetadata(aet, studyUID, pane === 'meta' ? targetSeries : undefined, targetSop)

  const row = study.data
  const seriesInfo = seriesList.data?.find((item) => item.seriesUID === targetSeries)

  return (
    <aside aria-label="Исследование" className="flex w-[540px] shrink-0 flex-col border-l border-line bg-panel">
      <header className="space-y-0.5 border-b border-line px-3 py-2">
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 truncate text-[14px] font-medium">
            {study.isPending ? <Spinner /> : row ? row.patientName || 'Без имени' : 'Исследование не найдено'}
          </h2>
          <button type="button" aria-label="Закрыть панель" onClick={onClose} className="rounded px-1.5 text-muted hover:text-fg">
            ✕
          </button>
        </div>
        {row && (
          <>
            <p className="truncate text-[11px] text-muted">
              <span className="font-mono">{row.patientID}</span>
              {[formatDateTime(row.birthDate), row.sex].filter(Boolean).map((part) => ` · ${part}`)}
            </p>
            <p className="truncate text-[12px]">
              {[formatDateTime(row.studyDate, row.studyTime), row.modalities.join(', '), row.description].filter(Boolean).join(' · ')}
            </p>
            <p className="truncate text-[11px] text-muted">
              {[
                row.accession && `№ ${row.accession}`,
                row.series !== undefined && countLabel(row.series, 'серия', 'серии', 'серий'),
                row.instances !== undefined && countLabel(row.instances, 'снимок', 'снимка', 'снимков'),
                row.sizeKB !== undefined && formatBytes(row.sizeKB * 1024),
              ].filter(Boolean).join(' · ')}
            </p>
          </>
        )}
        <div role="tablist" className="flex gap-1 pt-1.5">
          {([['series', 'Серии'], ['meta', 'Метаданные']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={pane === key}
              onClick={() => onNavigate({ pane: key })}
              className={`h-6 rounded-full border px-2.5 text-[11px] ${
                pane === key ? 'border-accent bg-accent/15 text-accent' : 'border-line text-muted hover:text-fg'
              }`}
            >
              {label}
            </button>
          ))}
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
          ].filter(Boolean).join(' · ')}
        />
      ) : seriesList.data?.length === 0 ? (
        <p className="p-3 text-[12px] text-muted">В исследовании нет серий.</p>
      ) : (
        <div className="p-3"><Spinner /></div>
      )}
    </aside>
  )
}
