/** Поиск исследований: QIDO-RS + перебор вариантов трактовки запроса. */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { getJson, getJsonFull } from './client'
import type { Params } from './client'
import type { DicomJson } from './dicom'
import { num, personName, str, strings, Tag } from './dicom'
import type { QidoParams, QueryVariant } from './omnibox'

export const PAGE_SIZE = 100

/** Приватный тег dcm4chee: размер исследования в КБ. Проверено на 5.35.1. */
export const STUDY_SIZE_KB = '77771029'

/** QIDO по умолчанию не отдаёт описание; размер — приватный тег, тоже нужно просить явно. */
const INCLUDE_FIELDS = ['StudyDescription', STUDY_SIZE_KB]

export interface StudyRow {
  studyUID: string
  patientName: string
  patientID: string
  birthDate?: string
  sex?: string
  studyDate?: string
  studyTime?: string
  accession?: string
  description?: string
  modalities: string[]
  series?: number
  instances?: number
  sizeKB?: number
  raw: DicomJson
}

export function toStudyRow(ds: DicomJson): StudyRow {
  return {
    studyUID: str(ds, Tag.StudyInstanceUID) ?? '',
    patientName: personName(str(ds, Tag.PatientName)),
    patientID: str(ds, Tag.PatientID) ?? '',
    birthDate: str(ds, Tag.PatientBirthDate),
    sex: str(ds, Tag.PatientSex),
    studyDate: str(ds, Tag.StudyDate),
    studyTime: str(ds, Tag.StudyTime),
    accession: str(ds, Tag.AccessionNumber),
    description: str(ds, Tag.StudyDescription),
    modalities: strings(ds, Tag.ModalitiesInStudy),
    series: num(ds, Tag.NumberOfStudyRelatedSeries),
    instances: num(ds, Tag.NumberOfStudyRelatedInstances),
    sizeKB: num(ds, STUDY_SIZE_KB),
    raw: ds,
  }
}

function qidoParams(params: QidoParams, offset: number, orderby: string): Params {
  return { ...params, includefield: INCLUDE_FIELDS, offset, limit: PAGE_SIZE, orderby }
}

export interface StudiesPage {
  rows: StudyRow[]
  offset: number
  /** Какой из вариантов трактовки запроса сработал. */
  variantIndex: number
  hint?: string
  warning?: string
  params: QidoParams
}

export interface PageParam {
  offset: number
  variantIndex: number
}

/**
 * Первая страница перебирает варианты трактовки запроса, пока не найдёт непустой результат;
 * следующие страницы идут уже по выбранному варианту.
 */
export async function fetchStudiesPage(
  aet: string,
  variants: QueryVariant[],
  orderby: string,
  { offset, variantIndex }: PageParam,
): Promise<StudiesPage> {
  const start = offset === 0 ? 0 : variantIndex
  const last = offset === 0 ? variants.length - 1 : variantIndex

  for (let index = start; index <= last; index++) {
    const variant = variants[index]
    const { data, warning } = await getJsonFull<DicomJson[]>(
      `/aets/${aet}/rs/studies`,
      qidoParams(variant.params, offset, orderby),
    )
    if (data.length || index === last) {
      return {
        rows: data.map(toStudyRow),
        offset,
        variantIndex: index,
        hint: data.length ? variant.hint : undefined,
        warning,
        params: variant.params,
      }
    }
  }
  // Сюда попадаем, только если вариантов нет вовсе: parseQuery всегда даёт хотя бы один.
  throw new Error('нет вариантов запроса')
}

export function useStudySearch(aet: string, variants: QueryVariant[], orderby: string) {
  return useInfiniteQuery({
    queryKey: ['studies', aet, variants.map((v) => v.params), orderby],
    initialPageParam: { offset: 0, variantIndex: 0 } as PageParam,
    queryFn: ({ pageParam }) => fetchStudiesPage(aet, variants, orderby, pageParam),
    getNextPageParam: (lastPage) =>
      lastPage.rows.length < PAGE_SIZE
        ? undefined
        : { offset: lastPage.offset + PAGE_SIZE, variantIndex: lastPage.variantIndex },
  })
}

/** Счётчик и объём считаются по тем же фильтрам, что дали результат. */
export function useStudyTotals(aet: string, params: QidoParams | undefined) {
  return useQuery({
    queryKey: ['studies-totals', aet, params],
    enabled: params !== undefined,
    queryFn: async () => {
      const [count, size] = await Promise.all([
        getJson<{ count: number }>(`/aets/${aet}/rs/studies/count`, params),
        getJson<{ size: number }>(`/aets/${aet}/rs/studies/size`, params),
      ])
      return { count: count.count, size: size.size }
    },
  })
}
