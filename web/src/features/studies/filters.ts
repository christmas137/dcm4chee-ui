/** Слияние фильтров из чипов с тем, что разобрано из строки поиска. */
import { formatDA } from '../../api/dicom'
import type { QidoParams, QueryVariant } from '../../api/omnibox'
import type { StudiesSearch } from '../../app/searchParams'

export const DEFAULT_SORT = '-StudyDate,-StudyTime'

/**
 * Границы периода. Ключи обязательные, а не опциональные, именно чтобы «Все даты»
 * отдавали `{from: undefined, to: undefined}` и затирали прежний фильтр в URL:
 * пустой объект в патче ничего не затирает — на этом уже один раз обожглись.
 */
export interface DateRange {
  from: string | undefined
  to: string | undefined
}

export interface DatePreset {
  label: string
  range(): DateRange
}

function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return formatDA(date)
}

export const DATE_PRESETS: DatePreset[] = [
  { label: 'Все даты', range: () => ({ from: undefined, to: undefined }) },
  { label: 'Сегодня', range: () => ({ from: formatDA(new Date()), to: formatDA(new Date()) }) },
  { label: '7 дней', range: () => ({ from: daysAgo(7), to: formatDA(new Date()) }) },
  { label: '30 дней', range: () => ({ from: daysAgo(30), to: formatDA(new Date()) }) },
  { label: 'Год', range: () => ({ from: daysAgo(365), to: formatDA(new Date()) }) },
]

/** Границы диапазона → значение QIDO `StudyDate` (открытые интервалы допустимы). */
export function dateRangeParam(from?: string, to?: string): string | undefined {
  if (from && to) return from === to ? from : `${from}-${to}`
  if (from) return `${from}-`
  if (to) return `-${to}`
  return undefined
}

/** Чипы перекрывают то, что пришло из текста: их пользователь выставил явно. */
export function withUiFilters(variants: QueryVariant[], search: StudiesSearch): QueryVariant[] {
  const extra: QidoParams = {}
  const date = dateRangeParam(search.from, search.to)
  if (date) extra.StudyDate = date
  if (search.mod?.length) extra.ModalitiesInStudy = search.mod.join('\\')
  if (!Object.keys(extra).length) return variants
  return variants.map((variant) => ({ ...variant, params: { ...variant.params, ...extra } }))
}
