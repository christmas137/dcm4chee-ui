import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { parseQuery } from '../../api/omnibox'
import { formatBytes } from '../../api/dicom'
import { useStudySearch, useStudyTotals } from '../../api/studies'
import type { StudyRow } from '../../api/studies'
import { useArchive } from '../../app/ArchiveContext'
import { EmptyState, ErrorBox, Spinner, WarningBar } from '../../components/ui'
import { FilterBar } from './FilterBar'
import { StudyTable } from './StudyTable'
import { DEFAULT_SORT, withUiFilters } from './filters'

export function StudiesPage() {
  const search = useSearch({ from: '/studies' })
  const navigate = useNavigate()
  const { aet } = useArchive()
  const [selected, setSelected] = useState(0)

  const sort = search.sort ?? DEFAULT_SORT
  const parsed = useMemo(() => parseQuery(search.q ?? ''), [search.q])
  const variants = useMemo(() => withUiFilters(parsed.variants, search), [parsed, search])

  const query = useStudySearch(aet, variants, sort)
  const pages = query.data?.pages
  const rows = useMemo(() => pages?.flatMap((page) => page.rows) ?? [], [pages])
  const totals = useStudyTotals(aet, pages?.[0]?.params)

  // Новый запрос — выделение возвращается на первую строку.
  useEffect(() => setSelected(0), [search.q, search.from, search.to, search.mod, sort, aet])

  // j/k — вверх-вниз, Enter — открыть. Пока пользователь печатает, не мешаем.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return
      if (!rows.length) return

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        setSelected((index) => Math.min(index + 1, rows.length - 1))
      } else if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        setSelected((index) => Math.max(index - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        openStudy(rows[selected])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function openStudy(row: StudyRow | undefined) {
    if (!row) return
    // Панель деталей — фаза 3; ссылка на исследование уже живёт в URL.
    void navigate({ to: '/studies', search: (prev) => ({ ...prev, study: row.studyUID }) })
  }

  const firstPage = pages?.[0]
  const warning = firstPage?.warning
  const hint = firstPage?.hint

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FilterBar search={search} />
      {warning && <WarningBar text={`Архив вернул неполный ответ: ${warning}`} />}

      <div className="flex h-7 shrink-0 items-center gap-3 border-b border-line px-3 text-[11px] text-muted">
        {query.isPending ? (
          <Spinner />
        ) : (
          <>
            <span className="text-fg">
              {totals.data ? `${totals.data.count} исслед.` : `${rows.length} исслед.`}
            </span>
            {totals.data && <span>{formatBytes(totals.data.size)}</span>}
            {hint && <span className="text-warn">найдено {hint}</span>}
            {parsed.explain.length > 0 && (
              <span className="truncate" title={parsed.explain.join(' · ')}>
                запрос: {parsed.explain.join(' · ')}
              </span>
            )}
          </>
        )}
      </div>

      {query.error ? (
        <ErrorBox error={query.error as Error} retry={() => void query.refetch()} />
      ) : !query.isPending && rows.length === 0 ? (
        <EmptyState
          title="Ничего не найдено"
          hint={
            <>
              Попробуйте фамилию, дату (<code>сегодня</code>, <code>13.05.2024</code>, <code>2024-05</code>),
              модальность (<code>CT</code>) или номер: <code>acc:12345</code>, <code>pid:P-1001</code>.
            </>
          }
        />
      ) : (
        <StudyTable
          rows={rows}
          sort={sort}
          selected={selected}
          onSelect={setSelected}
          onActivate={openStudy}
          onSortChange={(next) => void navigate({ to: '/studies', search: (prev) => ({ ...prev, sort: next }) })}
          hasNextPage={query.hasNextPage}
          isFetchingNextPage={query.isFetchingNextPage}
          fetchNextPage={() => void query.fetchNextPage()}
        />
      )}
    </div>
  )
}
