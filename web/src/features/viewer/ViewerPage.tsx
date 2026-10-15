import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useCanGoBack, useNavigate, useRouter, useSearch } from '@tanstack/react-router'
import type { DicomJson } from '../../api/dicom'
import { formatDateTime, str, Tag } from '../../api/dicom'
import { renderedUrl, thumbnailUrl, useSeries, useSeriesMetadata, useStudy, useTransferSyntaxes } from '../../api/series'
import { useArchive } from '../../app/ArchiveContext'
import { ModalityTag } from '../../components/Modality'
import { EmptyState, ErrorBox, Spinner } from '../../components/ui'
import { countLabel } from '../../lib/plural'
import { MetadataView } from '../studies/MetadataView'
import { RenderedViewer } from './RenderedViewer'
import { StackViewer } from './StackViewer'
import type { Overlay } from './StackViewer'
import { archiveOrigin, classifySeries, frameAccept, sortStack, toStackInstance, wadorsImageIds } from './stack'

const SEX: Record<string, string> = { M: 'М', F: 'Ж', O: 'Др.' }

export function ViewerPage() {
  const search = useSearch({ from: '/view' })
  const navigate = useNavigate()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const { aet } = useArchive()
  const studyUID = search.study ?? ''

  const study = useStudy(aet, studyUID || undefined)
  const seriesList = useSeries(aet, studyUID || undefined)
  // По умолчанию — первая серия со снимками, а не, скажем, отчёт.
  const seriesUID = search.series
    ?? seriesList.data?.find((item) => classifySeries(item.modality) === 'image')?.seriesUID
    ?? seriesList.data?.[0]?.seriesUID
  const series = seriesList.data?.find((item) => item.seriesUID === seriesUID)
  const metadata = useSeriesMetadata(aet, studyUID, seriesUID)
  // Не критично: без синтаксисов кадры просто придут несжатыми — архив разожмёт их сам.
  const syntaxes = useTransferSyntaxes(aet, studyUID, seriesUID)

  const [failure, setFailure] = useState<{ series: string; reason: string } | null>(null)

  const stack = useMemo(() => {
    const datasets = metadata.data ?? []
    const bySop = new Map<string, DicomJson>(datasets.map((ds) => [str(ds, Tag.SOPInstanceUID) ?? '', ds]))
    const instances = sortStack(datasets.map(toStackInstance))
    const imageIds = seriesUID ? wadorsImageIds(archiveOrigin(), aet, studyUID, seriesUID, instances) : []
    // Каждому кадру — метаданные его снимка: загрузчику они нужны для декодирования.
    const meta: Record<string, unknown> = {}
    const accept: Record<string, string> = {}
    let cursor = 0
    for (const instance of instances) {
      const header = frameAccept(syntaxes.data?.get(instance.sopUID))
      for (let frame = 0; frame < instance.frames; frame++) {
        meta[imageIds[cursor]] = bySop.get(instance.sopUID)
        accept[imageIds[cursor++]] = header
      }
    }
    return { instances, imageIds, meta, accept }
  }, [metadata.data, syntaxes.data, aet, studyUID, seriesUID])

  const kind = classifySeries(series?.modality, stack.instances[0]?.sopClassUID)

  // Номер среза — в адрес, но не на каждый оборот колеса: история браузера не резиновая.
  const sliceTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  function rememberSlice(index: number) {
    clearTimeout(sliceTimer.current)
    sliceTimer.current = setTimeout(() => {
      void navigate({ to: '/view', search: (prev) => ({ ...prev, slice: index + 1 }), replace: true })
    }, 300)
  }
  useEffect(() => () => clearTimeout(sliceTimer.current), [])

  function close() {
    if (canGoBack) router.history.back()
    else void navigate({ to: '/studies', search: { study: studyUID, series: seriesUID } })
  }

  function openSeries(uid: string) {
    setFailure(null)
    void navigate({ to: '/view', search: { study: studyUID, series: uid } })
  }

  const row = study.data
  const overlay: Overlay = {
    topLeft: row
      ? [row.patientName, `ID ${row.patientID}`, [formatDateTime(row.birthDate), row.sex && SEX[row.sex]].filter(Boolean).join(', ')].filter(Boolean)
      : [],
    topRight: [
      row?.description ?? '',
      row ? formatDateTime(row.studyDate, row.studyTime) : '',
      series ? `Серия ${series.number ?? ''} ${series.description ?? ''}`.replace(/\s+/g, ' ').trim() : '',
    ].filter(Boolean),
  }

  if (!studyUID) return <EmptyState title="Не указано исследование" hint="Откройте вьюер из списка исследований — клавишей V или из панели." />

  let content: ReactNode
  if (seriesList.error || metadata.error) {
    content = <ErrorBox error={(seriesList.error ?? metadata.error) as Error} retry={() => void metadata.refetch()} />
  } else if (seriesList.isPending || metadata.isPending || syntaxes.isPending || !seriesUID) {
    content = seriesList.data?.length === 0
      ? <EmptyState title="В исследовании нет серий" />
      : <div className="flex flex-1 items-center justify-center bg-black"><Spinner /></div>
  } else if (kind === 'pdf') {
    content = (
      <iframe
        title="Документ PDF"
        src={renderedUrl(aet, studyUID, seriesUID, stack.instances[0].sopUID)}
        className="min-h-0 flex-1 bg-white"
      />
    )
  } else if (kind !== 'image') {
    content = (
      <MetadataView
        dataset={metadata.data![0]}
        caption={kind === 'report' ? 'Структурированный отчёт: содержимое — в последовательностях ниже' : 'Это не изображение — показаны метаданные'}
      />
    )
  } else if (failure?.series === seriesUID) {
    content = (
      <RenderedViewer
        key={seriesUID}
        aet={aet}
        studyUID={studyUID}
        seriesUID={seriesUID}
        instances={stack.instances}
        initialIndex={(search.slice ?? 1) - 1}
        overlay={overlay}
        reason={failure.reason}
        onIndexChange={rememberSlice}
        onClose={close}
      />
    )
  } else {
    content = (
      <StackViewer
        key={seriesUID}
        imageIds={stack.imageIds}
        metadata={stack.meta}
        accept={stack.accept}
        modality={series?.modality}
        initialIndex={(search.slice ?? 1) - 1}
        overlay={overlay}
        onIndexChange={rememberSlice}
        onFailure={(error) => setFailure({ series: seriesUID, reason: error.message })}
        onClose={close}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-4 border-b border-line bg-panel px-3 py-2">
        <button type="button" onClick={close} title="Вернуться — Esc"
          className="flex h-7 items-center gap-1 rounded-md border border-line px-2.5 text-[12px] hover:bg-panel-2">
          <span aria-hidden className="text-[15px] leading-none">‹</span> К списку
        </button>
        {row && (
          <p className="min-w-0 truncate text-[13px]">
            <span className="font-semibold">{row.patientName}</span>
            <span className="ml-3 text-muted">{row.description}</span>
            <span className="ml-3 text-muted">{formatDateTime(row.studyDate, row.studyTime)}</span>
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Серии" className="w-48 shrink-0 overflow-auto border-r border-line bg-panel">
          {(seriesList.data ?? []).map((item) => {
            const current = item.seriesUID === seriesUID
            return (
              <button
                key={item.seriesUID}
                type="button"
                aria-current={current ? 'true' : undefined}
                onClick={() => openSeries(item.seriesUID)}
                className={`flex w-full flex-col gap-1 border-b border-line/60 p-2 text-left ${
                  current ? 'bg-panel-2 shadow-[inset_3px_0_0_var(--color-accent)]' : 'hover:bg-panel-2/50'
                }`}
              >
                <img src={thumbnailUrl(aet, studyUID, item.seriesUID)} alt="" loading="lazy"
                  className="aspect-square w-full rounded bg-black object-contain" />
                <span className="truncate text-[12px] font-medium">
                  {item.number !== undefined && <span className="mr-1 text-muted">#{item.number}</span>}
                  {item.description || 'Без описания'}
                </span>
                <span className="flex items-center gap-2 text-[11px] text-muted">
                  {item.modality && <ModalityTag modality={item.modality} />}
                  {item.instances !== undefined && countLabel(item.instances, 'снимок', 'снимка', 'снимков')}
                </span>
              </button>
            )
          })}
        </nav>
        <section aria-label="Просмотр" className="flex min-w-0 flex-1 flex-col">{content}</section>
      </div>
    </div>
  )
}
