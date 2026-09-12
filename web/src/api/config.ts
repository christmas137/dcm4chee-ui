/** Конфигурация архива: список AE-титлов, web-приложения, экспортёры. */
import { useQuery } from '@tanstack/react-query'
import { getJson } from './client'

export interface ArchiveAet {
  dicomAETitle: string
  dicomDescription?: string
  dcmHideNotRejectedInstances?: boolean
}

/** AE архива, доступные для QIDO/WADO. Меняются редко — держим в кэше долго. */
export function useAets() {
  return useQuery({
    queryKey: ['aets'],
    queryFn: () => getJson<ArchiveAet[]>('/aets'),
    staleTime: 30 * 60 * 1000,
  })
}
