import { useMemo, useState } from 'react'
import { useDevices } from '../../api/devices'
import { TextInput } from '../../components/form'
import { Badge, EmptyState, ErrorBox, Spinner } from '../../components/ui'

export function DeviceList({
  selected, onSelect,
}: {
  selected?: string
  onSelect(deviceName: string): void
}) {
  const devices = useDevices()
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const needle = query.toLowerCase()
    return (devices.data ?? [])
      .filter((device) =>
        !needle ||
        `${device.dicomDeviceName} ${device.dicomDescription ?? ''} ${device.dicomPrimaryDeviceType?.join(' ') ?? ''}`
          .toLowerCase()
          .includes(needle))
      .sort((a, b) => a.dicomDeviceName.localeCompare(b.dicomDeviceName))
  }, [devices.data, query])

  if (devices.error) return <ErrorBox error={devices.error as Error} retry={() => void devices.refetch()} />

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <TextInput
          placeholder="Фильтр по устройствам…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-xs"
        />
        <span className="text-[11px] text-muted">
          {devices.isPending ? <Spinner /> : `${rows.length} из ${devices.data?.length ?? 0}`}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 bg-panel text-[11px] text-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-1.5 text-left font-medium">Устройство</th>
              <th className="px-3 py-1.5 text-left font-medium">Тип</th>
              <th className="px-3 py-1.5 text-left font-medium">Описание</th>
              <th className="px-3 py-1.5 text-left font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((device) => (
              <tr
                key={device.dicomDeviceName}
                onClick={() => onSelect(device.dicomDeviceName)}
                className={`cursor-default border-b border-line/50 ${
                  selected === device.dicomDeviceName ? 'bg-accent/12' : 'hover:bg-panel-2'
                }`}
              >
                <td className="px-3 py-1.5 font-medium">
                  {device.dicomDeviceName}
                  {device.hasArcDevExt && <span className="ml-2"><Badge tone="accent">архив</Badge></span>}
                </td>
                <td className="px-3 py-1.5 text-muted">{device.dicomPrimaryDeviceType?.join(', ') ?? '—'}</td>
                <td className="max-w-md truncate px-3 py-1.5 text-muted">{device.dicomDescription}</td>
                <td className="px-3 py-1.5 text-muted">
                  {device.dicomInstalled === false ? 'выключено' : 'установлено'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!devices.isPending && rows.length === 0 && <EmptyState title="Устройства не найдены" />}
      </div>
    </div>
  )
}
