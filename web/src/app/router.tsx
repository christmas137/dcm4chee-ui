import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  parseSearchWith,
  redirect,
  stringifySearchWith,
} from '@tanstack/react-router'
import type { RouterHistory } from '@tanstack/react-router'
import { Layout } from './Layout'
import {
  parseValue, stringifyValue, validateSettingsSearch, validateStudiesSearch, validateTasksSearch, validateViewerSearch,
} from './searchParams'
import { StudiesPage } from '../features/studies/StudiesPage'
import { TasksPage } from '../features/tasks/TasksPage'

export type { SettingsSearch, StudiesSearch, TasksSearch, ViewerSearch } from './searchParams'

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

/** Вьюер грузится отдельным чанком: cornerstone тяжёлый, списку он не нужен. */
const viewerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/view',
  component: lazyRouteComponent(() => import('../features/viewer/ViewerPage'), 'ViewerPage'),
  validateSearch: validateViewerSearch,
})

const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tasks',
  component: TasksPage,
  validateSearch: validateTasksSearch,
})
/** Загрузка — отдельным чанком: разбор DICOM и распаковка ZIP нужны только здесь. */
const uploadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/upload',
  component: lazyRouteComponent(() => import('../features/upload/UploadPage'), 'UploadPage'),
})
/** Конфигурация — отдельным чанком: схемы dcm4chee с переводом весят около мегабайта. */
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('../features/settings/SettingsPage'), 'SettingsPage'),
  validateSearch: validateSettingsSearch,
})

const routeTree = rootRoute.addChildren([indexRoute, studiesRoute, viewerRoute, tasksRoute, uploadRoute, settingsRoute])

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
