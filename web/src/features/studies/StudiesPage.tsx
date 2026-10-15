import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { parseQuery } from '../../api/omnibox'
import { formatBytes } from '../../api/dicom'
import { Omnibox } from '../../app/Omnibox'
import { countLabel } from '../../lib/plural'
import { useStudySearch, useStudyTotals } from '../../api/studies'
import type { StudyRow } from '../../api/studies'
import { useArchive } from '../../app/ArchiveContext'
import { EmptyState, ErrorBox, Spinner, WarningBar } from '../../components/ui'
import { DateFilter, ModalityFilter } from './FilterBar'
import { QueryTokens } from './QueryTokens'
import { StudyPanel } from './StudyPanel'
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

  // Открытое исследование (в том числе по ссылке) подсвечено в списке.
  useEffect(() => {
    if (!search.study) return
    const index = rows.findIndex((row) => row.studyUID === search.study)
    if (index >= 0) setSelected(index)
  }, [search.study, rows])

  // j/k — вверх-вниз, Enter — открыть, Esc — закрыть панель. Пока пользователь печатает, не мешаем.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return
      if (event.key === 'Escape' && search.study) {
        event.preventDefault()
        closeStudy()
        return
      }
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
    void navigate({
      to: '/studies',
      search: (prev) => ({ ...prev, study: row.studyUID, series: undefined, sop: undefined, pane: undefined }),
    })
  }

  function closeStudy() {
    void navigate({
      to: '/studies',
      search: (prev) => ({ ...prev, study: undefined, series: undefined, sop: undefined, pane: undefined }),
    })
  }

  const firstPage = pages?.[0]
  const warning = firstPage?.warning
  const hint = firstPage?.hint

  const results = query.error ? (
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
        compact={Boolean(search.study)}
        sort={sort}
        selected={selected}
        onSelect={(index) => {
          // Один клик — и исследование открыто рядом со списком.
          setSelected(index)
          openStudy(rows[index])
        }}
        onActivate={openStudy}
        onSortChange={(next) => void navigate({ to: '/studies', search: (prev) => ({ ...prev, sort: next }) })}
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        fetchNextPage={() => void query.fetchNextPage()}
      />
    )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <section aria-label="Поиск исследований" className="shrink-0 border-b border-line bg-panel px-4 pt-3 pb-2.5">
        <div className="flex items-center gap-3">
          <Omnibox value={search.q ?? ''} />
          <DateFilter search={search} />
          <div aria-live="polite" className="ml-auto shrink-0 text-right leading-tight">
            {query.isPending ? (
              <Spinner />
            ) : (
              <>
                <p className="text-[14px] font-semibold">
                  {countLabel(totals.data?.count ?? rows.length, 'исследование', 'исследования', 'исследований')}
                </p>
                <p className="text-[12px] text-muted">{totals.data ? formatBytes(totals.data.size) : '\u00a0'}</p>
              </>
            )}
          </div>
        </div>
        <div className="mt-2.5 flex min-h-6 items-center gap-4">
          <div className="min-w-0 flex-1">
            <QueryTokens params={firstPage?.params} hint={hint} />
          </div>
          <ModalityFilter search={search} />
        </div>
      </section>
      {warning && <WarningBar text={`Архив вернул неполный ответ: ${warning}`} />}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">{results}</div>

        {search.study && (
          <StudyPanel
            key={`${aet}/${search.study}`}
            aet={aet}
            studyUID={search.study}
            series={search.series}
            sop={search.sop}
            pane={search.pane}
            onNavigate={(patch) => void navigate({ to: '/studies', search: (prev) => ({ ...prev, ...patch }) })}
            onClose={closeStudy}
          />
        )}
      </div>
    </div>
  )
}
