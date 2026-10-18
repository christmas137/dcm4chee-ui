/**
 * Состояние загрузки: выбранные файлы → разбор → отправка пачками → итог по каждому снимку.
 * Отправка идёт последовательно: архиву проще, а прогресс честный. «Остановить» прерывает
 * текущую пачку и не начинает следующие — уже принятое остаётся в архиве.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { stow, stowReasonText } from '../../api/stow'
import { batches, groupByStudy, scanAll } from './scan'
import type { Picked, Scanned } from './scan'

export type FileOutcome =
  | { status: 'stored'; warning?: string }
  | { status: 'failed'; reason: string }

export type Phase = 'idle' | 'scanning' | 'ready' | 'uploading' | 'done'

export interface Progress {
  files: number
  totalFiles: number
  bytes: number
  totalBytes: number
}

export function useUpload() {
  const queryClient = useQueryClient()
  const [scanned, setScanned] = useState<Scanned[]>([])
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [outcomes, setOutcomes] = useState<Map<string, FileOutcome>>(new Map())
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const { groups, duplicates } = useMemo(() => groupByStudy(scanned), [scanned])
  const skipped = useMemo(() => scanned.filter((item) => item.kind === 'skipped'), [scanned])

  const add = useCallback(async (picked: Picked[]) => {
    if (!picked.length) return
    setPhase('scanning')
    setScanProgress({ done: 0, total: picked.length })
    const result = await scanAll(picked, (done, total) => setScanProgress({ done, total }))
    setScanned((previous) => [...previous, ...result])
    setScanProgress(null)
    setPhase('ready')
  }, [])

  const upload = useCallback(async (aet: string) => {
    const files = groups.flatMap((group) => group.files)
    if (!files.length) return
    const controller = new AbortController()
    abort.current = controller
    setPhase('uploading')
    setError(null)
    const done = new Map<string, FileOutcome>()
    const total: Progress = {
      files: 0, totalFiles: files.length, bytes: 0, totalBytes: files.reduce((sum, item) => sum + item.file.size, 0),
    }
    setProgress({ ...total })
    try {
      for (const batch of batches(files)) {
        if (controller.signal.aborted) break
        const result = await stow(aet, batch.map((item) => item.file), controller.signal)
        for (const item of result.stored) {
          done.set(item.sopUID, { status: 'stored', warning: item.warning ? stowReasonText(item.warning) : undefined })
        }
        for (const item of result.failed) done.set(item.sopUID, { status: 'failed', reason: stowReasonText(item.reason) })
        // Архив не упомянул снимок ни в принятых, ни в отказах — так бывает, если он подменил UID.
        for (const item of batch) {
          if (!done.has(item.info.sopUID)) done.set(item.info.sopUID, { status: 'failed', reason: 'архив не подтвердил приём' })
        }
        total.files += batch.length
        total.bytes += batch.reduce((sum, item) => sum + item.file.size, 0)
        setProgress({ ...total })
        setOutcomes(new Map(done))
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError((reason as Error).message)
    } finally {
      abort.current = null
      setPhase('done')
      // В списке исследований должно появиться загруженное.
      void queryClient.invalidateQueries({ queryKey: ['studies'] })
      void queryClient.invalidateQueries({ queryKey: ['studies-totals'] })
    }
  }, [groups, queryClient])

  const stop = useCallback(() => abort.current?.abort(), [])

  const reset = useCallback(() => {
    setScanned([])
    setOutcomes(new Map())
    setProgress(null)
    setError(null)
    setPhase('idle')
  }, [])

  return { phase, groups, skipped, duplicates, scanProgress, progress, outcomes, error, add, upload, stop, reset }
}
