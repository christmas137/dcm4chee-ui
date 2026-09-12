/**
 * Конфигурация архива: устройства, AE-титлы, сетевые соединения.
 *
 * Модель конфигурации в dcm4chee — LDAP-дерево, наружу отдаётся как JSON устройства.
 * Запись всегда идёт целым устройством (`PUT /devices/{name}`), поэтому правка любого поля
 * означает: забрать свежее устройство → изменить нужный кусок → отправить целиком.
 * Изменения попадают в конфигурацию сразу, но работающий архив подхватывает их
 * только после `POST /ctrl/reload`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, getJson } from './client'

export interface DeviceSummary {
  dicomDeviceName: string
  dicomDescription?: string
  dicomManufacturer?: string
  dicomManufacturerModelName?: string
  dicomPrimaryDeviceType?: string[]
  dicomSoftwareVersion?: string[]
  dicomInstalled?: boolean
  /** Устройство несёт расширение архива (dcmArchiveDevice) — это сам dcm4chee-arc. */
  hasArcDevExt?: boolean
}

export interface ConnectionSummary {
  dicomHostname?: string
  dicomPort?: number
  dicomTLSCipherSuite?: string[]
}

/** Элемент `/aes`: AE со всех устройств, соединения уже подставлены. */
export interface AeSummary {
  dicomDeviceName: string
  dicomAETitle: string
  dicomDescription?: string
  dicomAssociationInitiator?: boolean
  dicomAssociationAcceptor?: boolean
  dicomNetworkConnection?: ConnectionSummary[]
}

export interface NetworkConnection {
  cn?: string
  dicomHostname?: string
  dicomPort?: number
  dicomTLSCipherSuite?: string[]
  dicomInstalled?: boolean
  dcmNetworkConnection?: Record<string, unknown>
  [key: string]: unknown
}

export interface TransferCapability {
  cn?: string
  dicomSOPClass?: string
  dicomTransferRole?: 'SCU' | 'SCP'
  dicomTransferSyntax?: string[]
  [key: string]: unknown
}

export interface NetworkAE {
  dicomAETitle: string
  dicomDescription?: string
  dicomAssociationInitiator?: boolean
  dicomAssociationAcceptor?: boolean
  /** Ссылки вида `/dicomNetworkConnection/0` — индекс в списке соединений устройства. */
  dicomNetworkConnectionReference?: string[]
  dicomTransferCapability?: TransferCapability[]
  [key: string]: unknown
}

export interface Device {
  dicomDeviceName: string
  dicomDescription?: string
  dicomInstalled?: boolean
  dicomNetworkConnection?: NetworkConnection[]
  dicomNetworkAE?: NetworkAE[]
  [key: string]: unknown
}

const CONNECTION_REF = '/dicomNetworkConnection/'

export function connectionRef(index: number): string {
  return `${CONNECTION_REF}${index}`
}

export function connectionIndex(ref: string): number | undefined {
  if (!ref.startsWith(CONNECTION_REF)) return undefined
  const index = Number(ref.slice(CONNECTION_REF.length))
  return Number.isInteger(index) && index >= 0 ? index : undefined
}

/** Соединения устройства, на которые ссылается AE. */
export function aeConnections(device: Device, ae: NetworkAE): NetworkConnection[] {
  const all = device.dicomNetworkConnection ?? []
  return (ae.dicomNetworkConnectionReference ?? [])
    .map(connectionIndex)
    .filter((index): index is number => index !== undefined && index < all.length)
    .map((index) => all[index])
}

export function describeConnection(connection: ConnectionSummary | NetworkConnection): string {
  const host = connection.dicomHostname ?? '—'
  const port = connection.dicomPort
  const tls = (connection.dicomTLSCipherSuite?.length ?? 0) > 0 ? ' TLS' : ''
  return port ? `${host}:${port}${tls}` : `${host}${tls}`
}

export function useDevices() {
  return useQuery({
    queryKey: ['devices'],
    queryFn: () => getJson<DeviceSummary[]>('/devices'),
    staleTime: 60_000,
  })
}

export function useAeList() {
  return useQuery({
    queryKey: ['aes'],
    queryFn: () => getJson<AeSummary[]>('/aes'),
    staleTime: 60_000,
  })
}

export function useDevice(name: string | undefined) {
  return useQuery({
    queryKey: ['device', name],
    enabled: Boolean(name),
    queryFn: () => getJson<Device>(`/devices/${encodeURIComponent(name!)}`),
    staleTime: 0,
  })
}

/** Занятые AE-титлы — для проверки уникальности при создании. */
export function useUsedAeTitles() {
  return useQuery({
    queryKey: ['unique-aets'],
    queryFn: () => getJson<string[]>('/unique/aets'),
    staleTime: 60_000,
  })
}

async function writeDevice(device: Device, method: 'PUT' | 'POST'): Promise<void> {
  await apiFetch(`/devices/${encodeURIComponent(device.dicomDeviceName)}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(device),
  })
}

function useDeviceMutation(method: 'PUT' | 'POST') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (device: Device) => writeDevice(device, method),
    onSuccess: (_result, device) => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] })
      void queryClient.invalidateQueries({ queryKey: ['aes'] })
      void queryClient.invalidateQueries({ queryKey: ['unique-aets'] })
      void queryClient.invalidateQueries({ queryKey: ['device', device.dicomDeviceName] })
    },
  })
}

export const useSaveDevice = () => useDeviceMutation('PUT')
export const useCreateDevice = () => useDeviceMutation('POST')

export function useDeleteDevice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch(`/devices/${encodeURIComponent(name)}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] })
      void queryClient.invalidateQueries({ queryKey: ['aes'] })
      void queryClient.invalidateQueries({ queryKey: ['unique-aets'] })
    },
  })
}

/** Перечитать конфигурацию работающим архивом. Без этого правки лежат «на полке». */
export function useReloadConfig() {
  return useMutation({
    mutationFn: () => apiFetch('/ctrl/reload', { method: 'POST' }),
  })
}
