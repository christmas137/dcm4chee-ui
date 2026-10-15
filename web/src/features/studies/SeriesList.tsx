import { thumbnailUrl, useInstances } from '../../api/series'
import type { SeriesRow } from '../../api/series'
import { ModalityTag } from '../../components/Modality'
import { ErrorBox, Spinner } from '../../components/ui'
import { countLabel } from '../../lib/plural'

interface Props {
  aet: string
  studyUID: string
  series: SeriesRow[]
  /** Раскрытая серия — её снимки показаны сеткой. */
  openSeries?: string
  selectedSop?: string
  onToggleSeries(seriesUID: string): void
  onOpenInstance(seriesUID: string, sopUID: string): void
}

/** Серии исследования. Снимки подгружаются, только когда серию раскрыли. */
export function SeriesList({ aet, studyUID, series, openSeries, selectedSop, onToggleSeries, onOpenInstance }: Props) {
  return (
    <ul className="divide-y divide-line/60">
      {series.map((item) => {
        const open = item.seriesUID === openSeries
        return (
          <li key={item.seriesUID}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => onToggleSeries(item.seriesUID)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${open ? 'bg-panel-2' : 'hover:bg-panel-2/50'}`}
            >
              <img
                src={thumbnailUrl(aet, studyUID, item.seriesUID)}
                alt=""
                loading="lazy"
                className="size-14 shrink-0 rounded bg-black object-contain"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">
                  {item.number !== undefined && <span className="mr-1.5 text-muted">#{item.number}</span>}
                  {item.description || 'Без описания'}
                </span>
                <span className="mt-0.5 flex items-center gap-3 text-[12px] text-muted">
                  {item.modality && <ModalityTag modality={item.modality} />}
                  {item.bodyPart && <span>{item.bodyPart}</span>}
                  {item.instances !== undefined && <span>{countLabel(item.instances, 'снимок', 'снимка', 'снимков')}</span>}
                </span>
              </span>
              <span aria-hidden className={`text-[14px] text-muted transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
            </button>
            {open && (
              <InstanceGrid
                aet={aet}
                studyUID={studyUID}
                seriesUID={item.seriesUID}
                selectedSop={selectedSop}
                onOpen={(sop) => onOpenInstance(item.seriesUID, sop)}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function InstanceGrid({
  aet, studyUID, seriesUID, selectedSop, onOpen,
}: {
  aet: string
  studyUID: string
  seriesUID: string
  selectedSop?: string
  onOpen(sopUID: string): void
}) {
  const instances = useInstances(aet, studyUID, seriesUID)
  const rows = instances.data?.pages.flatMap((page) => page.rows) ?? []

  if (instances.isPending) return <div className="px-3 py-2"><Spinner /></div>
  if (instances.error) return <ErrorBox error={instances.error as Error} retry={() => void instances.refetch()} />

  return (
    <div className="bg-panel-2/50 px-3 py-2">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5">
        {rows.map((instance) => (
          <button
            key={instance.sopUID}
            type="button"
            title={`Снимок ${instance.number ?? '?'} — метаданные`}
            aria-label={`Снимок ${instance.number ?? instance.sopUID}`}
            onClick={() => onOpen(instance.sopUID)}
            className={`relative overflow-hidden rounded border ${
              instance.sopUID === selectedSop ? 'border-accent' : 'border-transparent hover:border-line'
            }`}
          >
            <img
              src={thumbnailUrl(aet, studyUID, seriesUID, instance.sopUID)}
              alt=""
              loading="lazy"
              className="aspect-square w-full bg-black object-contain"
            />
            <span className="absolute right-0.5 bottom-0.5 rounded bg-black/70 px-1 font-mono text-[9px] text-white">
              {instance.number ?? '?'}
              {instance.frames && instance.frames > 1 ? ` ×${instance.frames}` : ''}
            </span>
          </button>
        ))}
      </div>
      {instances.hasNextPage && (
        <button
          type="button"
          disabled={instances.isFetchingNextPage}
          onClick={() => void instances.fetchNextPage()}
          className="mt-2 w-full rounded border border-line py-1 text-[11px] text-muted hover:text-fg"
        >
          {instances.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}
        </button>
      )}
    </div>
  )
}
