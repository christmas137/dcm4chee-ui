import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
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

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined

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
    mod: Array.isArray(search.mod) ? search.mod.filter((m): m is string => typeof m === 'string') : undefined,
    sort: asString(search.sort),
    study: asString(search.study),
  }),
})

const tasksRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tasks', component: TasksPage })
const uploadRoute = createRoute({ getParentRoute: () => rootRoute, path: '/upload', component: UploadPage })
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage })

const routeTree = rootRoute.addChildren([indexRoute, studiesRoute, tasksRoute, uploadRoute, settingsRoute])

export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
