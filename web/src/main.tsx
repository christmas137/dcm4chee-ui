import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './app/router'
import { applyTheme, preferredTheme } from './app/theme'
import { EngineContext } from './features/viewer/engine'
import { createCornerstoneEngine } from './features/viewer/cornerstoneEngine'
import './index.css'

applyTheme(preferredTheme())

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <EngineContext value={createCornerstoneEngine}>
        <RouterProvider router={router} />
      </EngineContext>
    </QueryClientProvider>
  </StrictMode>,
)
