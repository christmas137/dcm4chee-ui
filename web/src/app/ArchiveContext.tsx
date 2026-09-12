import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useAets } from '../api/config'
import type { ArchiveAet } from '../api/config'

const STORAGE_KEY = 'dcm4chee-ui.aet'
const DEFAULT_AET = 'DCM4CHEE'

interface ArchiveContextValue {
  /** AE-титл, от имени которого идут все запросы к архиву. */
  aet: string
  setAet(aet: string): void
  aets: ArchiveAet[]
  isLoading: boolean
  error: Error | null
}

const ArchiveContext = createContext<ArchiveContextValue | null>(null)

export function ArchiveProvider({ children }: { children: ReactNode }) {
  const { data: aets, isLoading, error } = useAets()
  const [aet, setAetState] = useState(() => localStorage.getItem(STORAGE_KEY) ?? DEFAULT_AET)

  const setAet = useCallback((next: string) => {
    setAetState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [])

  // Сохранённого AET может не быть на этом сервере — откатываемся на первый доступный.
  useEffect(() => {
    if (!aets?.length) return
    if (!aets.some((it) => it.dicomAETitle === aet)) {
      setAet(aets.find((it) => it.dicomAETitle === DEFAULT_AET)?.dicomAETitle ?? aets[0].dicomAETitle)
    }
  }, [aets, aet, setAet])

  const value = useMemo<ArchiveContextValue>(
    () => ({ aet, setAet, aets: aets ?? [], isLoading, error: error as Error | null }),
    [aet, setAet, aets, isLoading, error],
  )

  return <ArchiveContext value={value}>{children}</ArchiveContext>
}

export function useArchive(): ArchiveContextValue {
  const ctx = use(ArchiveContext)
  if (!ctx) throw new Error('useArchive вне ArchiveProvider')
  return ctx
}
