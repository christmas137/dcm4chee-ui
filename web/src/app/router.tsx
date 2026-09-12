import {
  createRootRoute,
  createRoute,
  createRouter,
  parseSearchWith,
  redirect,
  stringifySearchWith,
} from '@tanstack/react-router'
import { Layout } from './Layout'
import { StudiesPage } from '../features/studies/StudiesPage'
import { TasksPage } from '../features/tasks/TasksPage'
import { UploadPage } from '../features/upload/UploadPage'
import { SettingsPage } from '../features/settings/SettingsPage'

/** Состояние поиска живёт в URL: ссылка на результат должна открываться один в один. */
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
}

/**
 * По умолчанию роутер прогоняет значения через JSON, и строка в URL выглядит как
 * `from=%2220260912%22`. Ссылками на такое неудобно делиться, поэтому строки пишем как есть,
 * а JSON оставляем массивам и числам.
 */
const parseValue = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

const stringifyValue = (value: unknown): string => {
  if (typeof value === 'string') return value
  // Список модальностей читается как `mod=CT,MR`, а не как JSON-массив.
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value.join(',')
  return JSON.stringify(value)
}

/** `mod` может прийти строкой (`CT,MR`) или массивом — нормализуем к массиву. */
const asStringList = (value: unknown): string[] | undefined => {
  const list = typeof value === 'string'
    ? value.split(',')
    : Array.isArray(value)
      ? value.map((item) => (typeof item === 'string' ? item : String(item)))
      : []
  const cleaned = list.map((item) => item.trim()).filter(Boolean)
  return cleaned.length ? cleaned : undefined
}

/** Число из URL (`from=20260912`, `q=20000`) — тоже строка с точки зрения фильтров. */
const asString = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value || undefined
  if (typeof value === 'number') return String(value)
  return undefined
}

const rootRoute = createRootRoute({ component: Layout })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/studies' })
  },
})

const studiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/studies',
  component: StudiesPage,
  validateSearch: (search: Record<string, unknown>): StudiesSearch => ({
    q: asString(search.q),
    from: asString(search.from),
    to: asString(search.to),
    mod: asStringList(search.mod),
    sort: asString(search.sort),
    study: asString(search.study),
  }),
})

/** Что открыто в конфигурации: вкладка, выбранное устройство, выбранный AE. */
export interface SettingsSearch {
  tab?: 'ae' | 'devices' | 'archive'
  device?: string
  ae?: string
  /** Путь раздела настроек архива, например `dcmDevice/dcmArchiveDevice/dcmStorage`. */
  section?: string
}

const tasksRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tasks', component: TasksPage })
const uploadRoute = createRoute({ getParentRoute: () => rootRoute, path: '/upload', component: UploadPage })
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    tab: search.tab === 'devices' || search.tab === 'archive' || search.tab === 'ae' ? search.tab : undefined,
    device: asString(search.device),
    ae: asString(search.ae),
    section: asString(search.section),
  }),
})

const routeTree = rootRoute.addChildren([indexRoute, studiesRoute, tasksRoute, uploadRoute, settingsRoute])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  parseSearch: parseSearchWith(parseValue),
  stringifySearch: stringifySearchWith(stringifyValue, parseValue),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
