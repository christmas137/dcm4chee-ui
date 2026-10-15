import { useState } from 'react'
import { Link, Outlet, useRouterState, useSearch } from '@tanstack/react-router'
import { ArchiveProvider, useArchive } from './ArchiveContext'
import { Omnibox } from './Omnibox'
import { applyTheme, preferredTheme } from './theme'
import type { Theme } from './theme'
import { LayersIcon, MoonIcon, SunIcon } from '../components/icons'
import { Spinner } from '../components/ui'

const NAV = [
  { to: '/studies', label: 'Исследования' },
  { to: '/tasks', label: 'Задачи' },
  { to: '/upload', label: 'Загрузка' },
  { to: '/settings', label: 'Конфигурация' },
] as const

function AetSelect() {
  const { aet, setAet, aets, isLoading, error } = useArchive()

  if (error) return <span className="text-[12px] text-danger">Архив не отвечает</span>
  if (isLoading) return <Spinner />

  return (
    <label className="flex items-center gap-2 text-[12px] text-muted">
      AET
      <select
        value={aet}
        onChange={(event) => setAet(event.target.value)}
        title="Application Entity, от имени которого идут запросы"
        className="h-7 rounded-md border border-line bg-panel px-1.5 font-mono text-[12px] text-fg"
      >
        {aets.map((it) => (
          <option key={it.dicomAETitle} value={it.dicomAETitle}>
            {it.dicomAETitle}
          </option>
        ))}
      </select>
    </label>
  )
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => preferredTheme())
  return (
    <button
      type="button"
      aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      onClick={() => {
        const next: Theme = theme === 'dark' ? 'light' : 'dark'
        setTheme(next)
        applyTheme(next)
      }}
      className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-fg"
    >
      {theme === 'dark' ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </button>
  )
}

export function Layout() {
  const search = useSearch({ strict: false }) as { q?: string }
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  // На экране исследований строка поиска крупная и живёт в самой странице, на остальных —
  // компактная в шапке: искать можно откуда угодно.
  const onStudies = pathname.startsWith('/studies')

  return (
    <ArchiveProvider>
      <div className="flex h-full flex-col">
        <header className="flex h-12 shrink-0 items-stretch gap-6 border-b border-line bg-panel px-4">
          <Link to="/studies" className="flex items-center gap-2 text-[14px] font-semibold text-fg">
            <LayersIcon className="size-4" />
            dcm4chee
          </Link>

          <nav aria-label="Разделы" className="flex items-stretch gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center border-b-2 px-2 pt-0.5 text-[13px]"
                activeProps={{ className: 'border-accent font-medium text-fg' }}
                inactiveProps={{ className: 'border-transparent text-muted hover:text-fg' }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-1 items-center justify-center">
            {!onStudies && <Omnibox value={search.q ?? ''} size="compact" />}
          </div>

          <div className="flex items-center gap-3">
            <AetSelect />
            <ThemeToggle />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </ArchiveProvider>
  )
}
