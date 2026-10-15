import {
  createRootRoute,
  createRoute,
  createRouter,
  parseSearchWith,
  redirect,
  stringifySearchWith,
} from '@tanstack/react-router'
import type { RouterHistory } from '@tanstack/react-router'
import { Layout } from './Layout'
import { parseValue, stringifyValue, validateSettingsSearch, validateStudiesSearch } from './searchParams'
import { StudiesPage } from '../features/studies/StudiesPage'
import { TasksPage } from '../features/tasks/TasksPage'
import { UploadPage } from '../features/upload/UploadPage'
import { SettingsPage } from '../features/settings/SettingsPage'

export type { SettingsSearch, StudiesSearch } from './searchParams'

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
  validateSearch: validateStudiesSearch,
})

const tasksRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tasks', component: TasksPage })
const uploadRoute = createRoute({ getParentRoute: () => rootRoute, path: '/upload', component: UploadPage })
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
  validateSearch: validateSettingsSearch,
})

const routeTree = rootRoute.addChildren([indexRoute, studiesRoute, tasksRoute, uploadRoute, settingsRoute])

/** Фабрика — чтобы тесты поднимали то же самое приложение, но на памяти вместо адресной строки. */
export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    defaultPreload: 'intent',
    parseSearch: parseSearchWith(parseValue),
    stringifySearch: stringifySearchWith(stringifyValue, parseValue),
  })
}

export const router = createAppRouter()

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
