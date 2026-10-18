/**
 * Состояние экранов живёт в URL: ссылка на результат должна открываться один в один.
 * Здесь — типы параметров каждого экрана и их разбор/сериализация. Чистые функции, без роутера.
 */

export interface StudiesSearch {
  /** Строка омнибокса. */
  q?: string
  /** Границы StudyDate в формате YYYYMMDD — задаются чипами, перекрывают дату из текста. */
  from?: string
  to?: string
  /** Отмеченные модальности. */
  mod?: string[]
  /** Значение QIDO `orderby`. */
  sort?: string
  /** StudyInstanceUID открытого исследования — панель деталей. */
  study?: string
  /** Выбранная в панели серия. */
  series?: string
  /** Выбранный снимок — его метаданные показывает вкладка «Метаданные». */
  sop?: string
  /** Вкладка панели деталей. */
  pane?: 'series' | 'meta'
}

/** Что открыто в конфигурации: вкладка, выбранное устройство, выбранный AE. */
export interface SettingsSearch {
  tab?: 'ae' | 'devices' | 'archive'
  device?: string
  ae?: string
  /** Путь раздела настроек архива, например `dcmDevice/dcmArchiveDevice/dcmStorage`. */
  section?: string
}

/**
 * По умолчанию роутер прогоняет значения через JSON, и строка в URL выглядит как
 * `from=%2220260912%22`. Ссылками на такое неудобно делиться, поэтому строки пишем как есть,
 * а JSON оставляем массивам и числам.
 */
export const parseValue = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export const stringifyValue = (value: unknown): string => {
  if (typeof value === 'string') return value
  // Список модальностей читается как `mod=CT,MR`, а не как JSON-массив.
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value.join(',')
  return JSON.stringify(value)
}

/** Число из URL (`from=20260912`, `q=20000`) — тоже строка с точки зрения фильтров. */
export const asString = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value || undefined
  if (typeof value === 'number') return String(value)
  return undefined
}

/** `mod` может прийти строкой (`CT,MR`) или массивом — нормализуем к массиву. */
export const asStringList = (value: unknown): string[] | undefined => {
  let list: string[] = []
  if (typeof value === 'string') list = value.split(',')
  else if (typeof value === 'number') list = [String(value)]
  else if (Array.isArray(value)) list = value.map((item) => (typeof item === 'string' ? item : String(item)))
  const cleaned = list.map((item) => item.trim()).filter(Boolean)
  return cleaned.length ? cleaned : undefined
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined
}

export function validateStudiesSearch(search: Record<string, unknown>): StudiesSearch {
  return {
    q: asString(search.q),
    from: asString(search.from),
    to: asString(search.to),
    mod: asStringList(search.mod),
    sort: asString(search.sort),
    study: asString(search.study),
    series: asString(search.series),
    sop: asString(search.sop),
    pane: oneOf(search.pane, ['series', 'meta'] as const),
  }
}

export function validateSettingsSearch(search: Record<string, unknown>): SettingsSearch {
  return {
    tab: oneOf(search.tab, ['ae', 'devices', 'archive'] as const),
    device: asString(search.device),
    ae: asString(search.ae),
    section: asString(search.section),
  }
}

/** Задачи: очередь, статус, период, пакет, исследование и раскрытая задача (`очередь/ID`). */
export interface TasksSearch {
  queue?: string
  status?: string
  since?: 'today' | '7d' | '30d'
  batch?: string
  study?: string
  open?: string
}

export function validateTasksSearch(search: Record<string, unknown>): TasksSearch {
  return {
    queue: asString(search.queue),
    status: asString(search.status),
    since: oneOf(search.since, ['today', '7d', '30d'] as const),
    batch: asString(search.batch),
    study: asString(search.study),
    open: asString(search.open),
  }
}

/** Вьюер: исследование, серия и срез (с единицы — как говорят люди: «смотри 57-й срез»). */
export interface ViewerSearch {
  study?: string
  series?: string
  slice?: number
}

export function validateViewerSearch(search: Record<string, unknown>): ViewerSearch {
  const slice = Number(search.slice)
  return {
    study: asString(search.study),
    series: asString(search.series),
    slice: Number.isInteger(slice) && slice > 0 ? slice : undefined,
  }
}
