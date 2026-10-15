import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { StudyRow } from '../../api/studies'
import { formatBytes, formatDateTime } from '../../api/dicom'
import { Spinner } from '../../components/ui'

interface Column {
  key: string
  title: string
  width: string
  /** Поле для QIDO `orderby`; без него столбец не сортируется. */
  sort?: string
  align?: 'right'
  /** Прячется, когда рядом открыта панель исследования и места мало. */
  optional?: boolean
  render(row: StudyRow): string
}

const COLUMNS: Column[] = [
  { key: 'patient', title: 'Пациент', width: 'minmax(190px,1.8fr)', sort: 'PatientName', render: (r) => r.patientName },
  { key: 'pid', title: 'ID пациента', width: '120px', sort: 'PatientID', render: (r) => r.patientID },
  { key: 'birth', title: 'ДР / пол', width: '120px', sort: 'PatientBirthDate', optional: true,
    render: (r) => [formatDateTime(r.birthDate), r.sex].filter(Boolean).join(' · ') },
  { key: 'date', title: 'Дата', width: '130px', sort: 'StudyDate', render: (r) => formatDateTime(r.studyDate, r.studyTime) },
  { key: 'mod', title: 'Мод.', width: '86px', render: (r) => r.modalities.join(', ') },
  { key: 'desc', title: 'Описание', width: 'minmax(180px,2fr)', sort: 'StudyDescription', render: (r) => r.description ?? '' },
  { key: 'acc', title: '№ назначения', width: '120px', sort: 'AccessionNumber', optional: true, render: (r) => r.accession ?? '' },
  { key: 'series', title: 'Сер.', width: '56px', align: 'right', optional: true, render: (r) => String(r.series ?? '') },
  { key: 'inst', title: 'Сним.', width: '64px', align: 'right', optional: true, render: (r) => String(r.instances ?? '') },
  { key: 'size', title: 'Объём', width: '84px', align: 'right', optional: true,
    render: (r) => (r.sizeKB === undefined ? '' : formatBytes(r.sizeKB * 1024)) },
]

const COMPACT_COLUMNS = COLUMNS.filter((column) => !column.optional)
const ROW_HEIGHT = 30

/** Клик по столбцу: по убыванию → по возрастанию → как было. */
export function nextSort(current: string, field: string): string | undefined {
  if (current === `-${field}`) return field
  if (current === field) return undefined
  return `-${field}`
}

interface Props {
  rows: StudyRow[]
  /** Узкий режим: только главные колонки. */
  compact?: boolean
  sort: string
  selected: number
  onSelect(index: number): void
  onActivate(row: StudyRow): void
  onSortChange(sort: string | undefined): void
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage(): void
}

export function StudyTable({
  rows, compact = false, sort, selected, onSelect, onActivate, onSortChange,
  hasNextPage, isFetchingNextPage, fetchNextPage,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const columns = compact ? COMPACT_COLUMNS : COLUMNS
  const grid = columns.map((column) => column.width).join(' ')

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 14,
  })

  const items = virtualizer.getVirtualItems()
  const lastVisible = items.at(-1)?.index ?? 0

  // Догружаем следующую страницу, не дожидаясь самого низа списка.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastVisible >= rows.length - 20) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, lastVisible, rows.length, fetchNextPage])

  // Клавиатурная навигация не должна уводить выбранную строку за пределы экрана.
  useEffect(() => {
    if (selected >= 0) virtualizer.scrollToIndex(selected, { align: 'auto' })
  }, [selected, virtualizer])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="grid shrink-0 items-center gap-x-3 border-b border-line bg-panel px-3 text-[11px] font-medium text-muted"
        style={{ gridTemplateColumns: grid, height: 28 }}
      >
        {columns.map((column) => {
          const active = column.sort && (sort === column.sort || sort === `-${column.sort}`)
          return (
            <button
              key={column.key}
              type="button"
              disabled={!column.sort}
              onClick={() => column.sort && onSortChange(nextSort(sort, column.sort))}
              className={[
                'truncate text-left',
                column.align === 'right' ? 'text-right' : '',
                column.sort ? 'cursor-pointer hover:text-fg' : 'cursor-default',
                active ? 'text-accent' : '',
              ].join(' ')}
            >
              {column.title}
              {active && (sort.startsWith('-') ? ' ↓' : ' ↑')}
            </button>
          )
        })}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {items.map((item) => {
            const row = rows[item.index]
            const isSelected = item.index === selected
            return (
              <div
                key={row.studyUID}
                role="row"
                aria-selected={isSelected}
                onClick={() => onSelect(item.index)}
                onDoubleClick={() => onActivate(row)}
                className={[
                  'absolute inset-x-0 grid cursor-default items-center gap-x-3 border-b border-line/50 px-3 text-[12px]',
                  isSelected ? 'bg-accent/12 text-fg' : 'hover:bg-panel-2',
                ].join(' ')}
                style={{
                  gridTemplateColumns: grid,
                  height: ROW_HEIGHT,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                {columns.map((column) => (
                  <span
                    key={column.key}
                    title={column.render(row)}
                    className={[
                      'truncate',
                      column.align === 'right' ? 'text-right tabular-nums' : '',
                      column.key === 'patient' ? 'font-medium' : '',
                      column.key === 'pid' || column.key === 'acc' ? 'font-mono text-[11px]' : '',
                      column.key === 'desc' || column.key === 'birth' ? 'text-muted' : '',
                    ].join(' ')}
                  >
                    {column.render(row)}
                  </span>
                ))}
              </div>
            )
          })}
        </div>
        {isFetchingNextPage && (
          <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-muted">
            <Spinner /> подгружаем ещё
          </div>
        )}
      </div>
    </div>
  )
}
