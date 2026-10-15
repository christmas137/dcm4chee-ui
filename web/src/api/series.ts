/** Внутренности исследования: серии, снимки, метаданные снимка и превью. */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ARCHIVE_BASE, getJson } from './client'
import type { DicomJson } from './dicom'
import { num, str, Tag } from './dicom'
import { STUDY_SIZE_KB, toStudyRow } from './studies'
import type { StudyRow } from './studies'

export const INSTANCES_PAGE = 100

export interface SeriesRow {
  seriesUID: string
  number?: number
  description?: string
  modality?: string
  instances?: number
  bodyPart?: string
}

export interface InstanceRow {
  sopUID: string
  sopClassUID?: string
  number?: number
  frames?: number
  rows?: number
  columns?: number
}

export function toSeriesRow(ds: DicomJson): SeriesRow {
  return {
    seriesUID: str(ds, Tag.SeriesInstanceUID) ?? '',
    number: num(ds, Tag.SeriesNumber),
    description: str(ds, Tag.SeriesDescription),
    modality: str(ds, Tag.Modality),
    instances: num(ds, Tag.NumberOfSeriesRelatedInstances),
    bodyPart: str(ds, Tag.BodyPartExamined),
  }
}

export function toInstanceRow(ds: DicomJson): InstanceRow {
  return {
    sopUID: str(ds, Tag.SOPInstanceUID) ?? '',
    sopClassUID: str(ds, Tag.SOPClassUID),
    number: num(ds, Tag.InstanceNumber),
    frames: num(ds, '00280008'),
    rows: num(ds, Tag.Rows),
    columns: num(ds, Tag.Columns),
  }
}

/**
 * Серии по номеру. Архив отдаёт их в порядке поступления, а читать удобно по SeriesNumber;
 * серии без номера — в конец.
 */
export function sortSeries(rows: SeriesRow[]): SeriesRow[] {
  return [...rows].sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity))
}

const rs = (aet: string) => `/aets/${encodeURIComponent(aet)}/rs`

export function studyPath(aet: string, studyUID: string): string {
  return `${rs(aet)}/studies/${studyUID}`
}

export function seriesPath(aet: string, studyUID: string, seriesUID: string): string {
  return `${studyPath(aet, studyUID)}/series/${seriesUID}`
}

export function instancePath(aet: string, studyUID: string, seriesUID: string, sopUID: string): string {
  return `${seriesPath(aet, studyUID, seriesUID)}/instances/${sopUID}`
}

/** Превью рендерит сам архив (PNG). Для снимка — его кадр, для серии — характерный снимок серии. */
export function thumbnailUrl(aet: string, studyUID: string, seriesUID: string, sopUID?: string): string {
  const base = sopUID ? instancePath(aet, studyUID, seriesUID, sopUID) : seriesPath(aet, studyUID, seriesUID)
  return `${ARCHIVE_BASE}${base}/thumbnail`
}

/**
 * Заголовок панели. Строка списка может быть ещё не загружена (открыли по ссылке),
 * поэтому исследование запрашиваем отдельно — один лёгкий QIDO по UID.
 */
export function useStudy(aet: string, studyUID: string | undefined) {
  return useQuery({
    queryKey: ['study', aet, studyUID],
    enabled: Boolean(studyUID),
    queryFn: async (): Promise<StudyRow | null> => {
      const found = await getJson<DicomJson[]>(`${rs(aet)}/studies`, {
        StudyInstanceUID: studyUID,
        includefield: ['StudyDescription', STUDY_SIZE_KB],
      })
      return found[0] ? toStudyRow(found[0]) : null
    },
  })
}

export function useSeries(aet: string, studyUID: string | undefined) {
  return useQuery({
    queryKey: ['series', aet, studyUID],
    enabled: Boolean(studyUID),
    queryFn: async () => {
      const found = await getJson<DicomJson[]>(`${studyPath(aet, studyUID!)}/series`, {
        includefield: ['BodyPartExamined'],
      })
      return sortSeries(found.map(toSeriesRow))
    },
  })
}

/** Снимки грузятся только для раскрытой серии и порциями: в серии бывает несколько тысяч. */
export function useInstances(aet: string, studyUID: string, seriesUID: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['instances', aet, studyUID, seriesUID],
    enabled: Boolean(seriesUID),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const found = await getJson<DicomJson[]>(`${seriesPath(aet, studyUID, seriesUID!)}/instances`, {
        orderby: 'InstanceNumber',
        offset: pageParam,
        limit: INSTANCES_PAGE,
      })
      return { rows: found.map(toInstanceRow), offset: pageParam }
    },
    getNextPageParam: (last) => (last.rows.length < INSTANCES_PAGE ? undefined : last.offset + INSTANCES_PAGE),
  })
}

/** Первый снимок серии — его метаданные показываем, пока пользователь не выбрал конкретный. */
export function useFirstInstance(aet: string, studyUID: string, seriesUID: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['first-instance', aet, studyUID, seriesUID],
    enabled: enabled && Boolean(seriesUID),
    queryFn: async () => {
      const found = await getJson<DicomJson[]>(`${seriesPath(aet, studyUID, seriesUID!)}/instances`, {
        orderby: 'InstanceNumber',
        limit: 1,
      })
      return found[0] ? toInstanceRow(found[0]) : null
    },
  })
}

/**
 * Метаданные одного снимка. Метаданные всей серии/исследования брать не стоит: на большой КТ
 * это мегабайты JSON, а смотрят их всё равно по одному снимку.
 */
export function useInstanceMetadata(aet: string, studyUID: string, seriesUID?: string, sopUID?: string) {
  return useQuery({
    queryKey: ['metadata', aet, studyUID, seriesUID, sopUID],
    enabled: Boolean(seriesUID && sopUID),
    queryFn: async () => {
      const found = await getJson<DicomJson[]>(`${instancePath(aet, studyUID, seriesUID!, sopUID!)}/metadata`)
      return found[0] ?? null
    },
  })
}

/**
 * Метаданные всех снимков серии — их требует загрузчик кадров вьюера (WADO-RS).
 * Один запрос на серию: так делает и OHIF; для серии в тысячу срезов это пара мегабайт.
 */
export function useSeriesMetadata(aet: string, studyUID: string, seriesUID: string | undefined) {
  return useQuery({
    queryKey: ['series-metadata', aet, studyUID, seriesUID],
    enabled: Boolean(seriesUID),
    staleTime: 5 * 60_000,
    queryFn: () => getJson<DicomJson[]>(`${seriesPath(aet, studyUID, seriesUID!)}/metadata`),
  })
}

/**
 * Синтаксис хранения каждого снимка серии (AvailableTransferSyntaxUID). В /metadata его нет,
 * а вьюеру он нужен, чтобы просить кадры в родном сжатии.
 */
export function useTransferSyntaxes(aet: string, studyUID: string, seriesUID: string | undefined) {
  return useQuery({
    queryKey: ['transfer-syntaxes', aet, studyUID, seriesUID],
    enabled: Boolean(seriesUID),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Без limit: dcm4chee принимает не больше 99999 (иначе 400), а без него отдаёт всю серию.
      const found = await getJson<DicomJson[]>(`${seriesPath(aet, studyUID, seriesUID!)}/instances`, {
        includefield: '00083002',
      })
      return new Map(found.map((ds) => [str(ds, Tag.SOPInstanceUID) ?? '', str(ds, '00083002')]))
    },
  })
}

/** Серверный рендер кадра: JPEG/PNG для картинок, PDF для документов. Запасной путь вьюера. */
export function renderedUrl(aet: string, studyUID: string, seriesUID: string, sopUID: string, frame?: number): string {
  const base = instancePath(aet, studyUID, seriesUID, sopUID)
  return `${ARCHIVE_BASE}${base}${frame ? `/frames/${frame}` : ''}/rendered`
}
