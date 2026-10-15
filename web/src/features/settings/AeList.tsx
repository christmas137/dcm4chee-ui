import { useMemo, useState } from 'react'
import { describeConnection, useAeList } from '../../api/devices'
import type { AeSummary } from '../../api/devices'
import { TextInput } from '../../components/form'
import { EmptyState, ErrorBox, Spinner } from '../../components/ui'

function role(ae: AeSummary): string {
  const parts = []
  if (ae.dicomAssociationAcceptor) parts.push('принимает')
  if (ae.dicomAssociationInitiator) parts.push('отправляет')
  return parts.join(', ') || '—'
}

function matches(ae: AeSummary, query: string): boolean {
  if (!query) return true
  const haystack = [
    ae.dicomAETitle,
    ae.dicomDeviceName,
    ae.dicomDescription,
    ...(ae.dicomNetworkConnection ?? []).map(describeConnection),
  ]
    .join(' ')
    .toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((part) => haystack.includes(part))
}

/** Все AE со всех устройств одной таблицей — в штатном UI их приходится собирать по вкладкам. */
export function AeList({
  selected, onSelect,
}: {
  selected?: { device: string; ae: string }
  onSelect(ae: AeSummary): void
}) {
  const aes = useAeList()
  const [query, setQuery] = useState('')

  const rows = useMemo(
    () => (aes.data ?? []).filter((ae) => matches(ae, query)).sort((a, b) => a.dicomAETitle.localeCompare(b.dicomAETitle)),
    [aes.data, query],
  )

  if (aes.error) return <ErrorBox error={aes.error as Error} retry={() => void aes.refetch()} />

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <TextInput
          placeholder="Фильтр: титл, устройство, хост…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-xs"
        />
        <span className="text-[11px] text-muted">
          {aes.isPending ? <Spinner /> : `${rows.length} из ${aes.data?.length ?? 0}`}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 bg-panel text-[11px] text-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-1.5 text-left font-medium">AE Title</th>
              <th className="px-3 py-1.5 text-left font-medium">Устройство</th>
              <th className="px-3 py-1.5 text-left font-medium">Адрес</th>
              <th className="px-3 py-1.5 text-left font-medium">Роль</th>
              <th className="px-3 py-1.5 text-left font-medium">Описание</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((ae) => {
              const isSelected =
                selected?.ae === ae.dicomAETitle && selected.device === ae.dicomDeviceName
              return (
                <tr
                  key={`${ae.dicomDeviceName}/${ae.dicomAETitle}`}
                  onClick={() => onSelect(ae)}
                  className={`cursor-default border-b border-line/50 ${
                    isSelected ? 'bg-accent/12' : 'hover:bg-panel-2'
                  }`}
                >
                  <td className="px-3 py-1.5 font-mono font-medium">{ae.dicomAETitle}</td>
                  <td className="px-3 py-1.5 text-muted">{ae.dicomDeviceName}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-muted">
                    {(ae.dicomNetworkConnection ?? []).map(describeConnection).join(', ') || '—'}
                  </td>
                  <td className="px-3 py-1.5 text-muted">{role(ae)}</td>
                  <td className="max-w-md truncate px-3 py-1.5 text-muted" title={ae.dicomDescription}>
                    {ae.dicomDescription}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!aes.isPending && rows.length === 0 && (
          <EmptyState title="AE не найдены" hint="Измените фильтр или создайте подключение." />
        )}
      </div>
    </div>
  )
}
