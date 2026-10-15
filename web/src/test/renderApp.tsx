import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { createAppRouter } from '../app/router'
import { EngineContext } from '../features/viewer/engine'
import type { EngineFactory } from '../features/viewer/engine'
import { fakeEngines } from './fakeEngine'

/**
 * Поднимает настоящее приложение — те же маршруты, страницы, провайдеры — на заданном URL.
 * Архив подменяется через FakeArchive.install() до вызова.
 */
export function renderApp(url: string, { engine = fakeEngines().factory }: { engine?: EngineFactory } = {}) {
  const history = createMemoryHistory({ initialEntries: [url] })
  const router = createAppRouter(history)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: Infinity },
      mutations: { retry: false },
    },
  })
  const user = userEvent.setup()
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <EngineContext value={engine}>
        <RouterProvider router={router} />
      </EngineContext>
    </QueryClientProvider>,
  )
  return {
    ...utils,
    user,
    router,
    queryClient,
    /** Текущие параметры адресной строки (после разбора роутером). */
    search: () => router.state.location.search as Record<string, unknown>,
    /** Адрес так, как его видит пользователь, — для проверки читаемости ссылок. */
    href: () => decodeURIComponent(router.state.location.href),
  }
}
