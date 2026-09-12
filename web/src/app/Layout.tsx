import { useState } from 'react'
import { Link, Outlet, useSearch } from '@tanstack/react-router'
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

  if (error) return <span className="text-[11px] text-danger">архив недоступен</span>
  if (isLoading) return <Spinner />

  return (
    <label className="flex items-center gap-1.5 text-[11px] text-muted">
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
      aria-label="Сменить тему"
      onClick={() => {
        const next: Theme = theme === 'dark' ? 'light' : 'dark'
        setTheme(next)
        applyTheme(next)
      }}
      className="rounded-md border border-line p-1.5 text-muted hover:text-fg"
    >
      {theme === 'dark' ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </button>
  )
}

export function Layout() {
  const search = useSearch({ strict: false }) as { q?: string }

  return (
    <ArchiveProvider>
      <div className="flex h-full flex-col">
        <header className="flex h-13 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
          <Link to="/studies" className="flex items-center gap-1.5 font-semibold tracking-tight text-fg">
            <LayersIcon className="size-4 text-accent" />
            dcm4chee
          </Link>
          <div className="flex max-w-2xl flex-1 justify-center">
            <Omnibox value={search.q ?? ''} />
          </div>
          <AetSelect />
          <ThemeToggle />
        </header>

        <nav className="flex h-9 shrink-0 items-center gap-1 border-b border-line bg-panel px-3">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded px-2 py-1 text-[12px] text-muted hover:bg-panel-2 hover:text-fg"
              activeProps={{ className: 'rounded px-2 py-1 text-[12px] bg-panel-2 text-fg font-medium' }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </ArchiveProvider>
  )
}
