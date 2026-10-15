/**
 * Раскладка метаданных снимка (DICOM JSON) в плоский список строк для таблицы:
 * вложенные последовательности (SQ) разворачиваются с отступом, значения форматируются по VR,
 * бинарные данные не тащатся в интерфейс.
 */
import type { DicomElement, DicomJson } from './dicom'
import { tagToGroupElement } from './dicom'
import { countLabel } from '../lib/plural'

export type RowKind = 'element' | 'sequence' | 'item'

export interface MetadataRow {
  /** Уникальный ключ: путь от корня, например `00081032[0].00080100`. */
  key: string
  /** Тег без разделителей (`00100010`); у строки-элемента SQ — тег последовательности. */
  tag: string
  vr: string
  kind: RowKind
  depth: number
  /** Значение для показа. */
  value: string
  /** Ключи предков — нужны фильтру, чтобы показывать найденное внутри SQ вместе с контекстом. */
  ancestors: string[]
}

interface PersonName {
  Alphabetic?: string
  Ideographic?: string
  Phonetic?: string
}

function base64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

/** Значение элемента так, как его ждёт увидеть человек, знающий DICOM: без «улучшений». */
export function formatValue(element: DicomElement): string {
  if (element.BulkDataURI) return 'бинарные данные'
  if (element.InlineBinary !== undefined) return `бинарные данные, ${base64Bytes(element.InlineBinary)} Б`
  const values = element.Value ?? []
  if (element.vr === 'SQ') return countLabel(values.length, 'элемент', 'элемента', 'элементов')
  return values
    .map((value) => {
      if (value === null || value === undefined) return ''
      if (element.vr === 'PN' && typeof value === 'object') {
        const pn = value as PersonName
        // Компоненты PN через `=`, как в DICOM: латиница=иероглифы=фонетика.
        return [pn.Alphabetic, pn.Ideographic, pn.Phonetic].filter((part) => part !== undefined).join('=')
      }
      if (typeof value === 'object') return JSON.stringify(value)
      return String(value)
    })
    .join(' \\ ')
}

export function flattenDataset(ds: DicomJson, depth = 0, parentKey = '', ancestors: string[] = []): MetadataRow[] {
  const rows: MetadataRow[] = []
  for (const tag of Object.keys(ds).sort()) {
    const element = ds[tag]
    const key = parentKey ? `${parentKey}.${tag}` : tag
    const isSequence = element.vr === 'SQ'
    rows.push({
      key,
      tag,
      vr: element.vr,
      kind: isSequence ? 'sequence' : 'element',
      depth,
      value: formatValue(element),
      ancestors,
    })
    if (!isSequence) continue

    const items = (element.Value ?? []) as DicomJson[]
    items.forEach((item, index) => {
      const itemKey = `${key}[${index}]`
      const itemAncestors = [...ancestors, key]
      rows.push({
        key: itemKey,
        tag,
        vr: '',
        kind: 'item',
        depth: depth + 1,
        value: `элемент ${index + 1}`,
        ancestors: itemAncestors,
      })
      rows.push(...flattenDataset(item ?? {}, depth + 2, itemKey, [...itemAncestors, itemKey]))
    })
  }
  return rows
}

/**
 * Запрос похож на тег (`0010,0010`, `(0010,0010)`, `00100010`, `0010`)? Тогда возвращаем
 * нормализованные hex-цифры для сравнения с началом тега.
 */
export function tagQuery(query: string): string | undefined {
  const compact = query.replace(/[\s(),]/g, '').toUpperCase()
  return /^[0-9A-F]{4,8}$/.test(compact) ? compact : undefined
}

/**
 * Фильтр по тегу, имени тега и значению. Найденное внутри последовательности показывается
 * вместе с предками, а найденная последовательность — со всем содержимым.
 */
export function filterRows(rows: MetadataRow[], query: string, nameOf: (tag: string) => string): MetadataRow[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return rows
  const hex = tagQuery(query)

  const matched = new Set<string>()
  for (const row of rows) {
    if (row.kind === 'item') continue
    const hit =
      (hex !== undefined && row.tag.startsWith(hex)) ||
      nameOf(row.tag).toLowerCase().includes(needle) ||
      row.value.toLowerCase().includes(needle)
    if (hit) matched.add(row.key)
  }

  const visible = new Set<string>()
  for (const row of rows) {
    if (matched.has(row.key)) {
      visible.add(row.key)
      row.ancestors.forEach((ancestor) => visible.add(ancestor))
    } else if (row.ancestors.some((ancestor) => matched.has(ancestor))) {
      visible.add(row.key)
    }
  }
  return rows.filter((row) => visible.has(row.key))
}

/** Тег для показа: `(0010,0010)`. */
export const displayTag = tagToGroupElement
