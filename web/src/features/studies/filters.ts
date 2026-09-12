/** Слияние фильтров из чипов с тем, что разобрано из строки поиска. */
import type { QidoParams, QueryVariant } from '../../api/omnibox'
import type { StudiesSearch } from '../../app/router'

export const DEFAULT_SORT = '-StudyDate,-StudyTime'

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
