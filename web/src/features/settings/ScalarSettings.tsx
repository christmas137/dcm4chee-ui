import { useMemo, useState } from 'react'
import { Checkbox, TextInput } from '../../components/form'
import { EmptyState } from '../../components/ui'
import { scalarSettings } from './archiveSections'

/**
 * Одиночные параметры архива (их полсотни: интервалы, политики, алгоритмы).
 * В штатном UI они рассыпаны по длинной форме — здесь это таблица с поиском.
 */
export function ScalarSettings({
  device, onChange,
}: {
  device: unknown
  onChange(key: string, value: string | number | boolean): void
}) {
  const [query, setQuery] = useState('')
  const all = useMemo(() => scalarSettings(device), [device])
  const rows = useMemo(() => {
    const needle = query.toLowerCase()
    return all.filter(([key, value]) => !needle || `${key} ${String(value)}`.toLowerCase().includes(needle))
  }, [all, query])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-medium">Параметры архива</h2>
          <p className="text-[11px] text-muted">
            Одиночные настройки dcmArchiveDevice: интервалы опроса, политики, алгоритмы
          </p>
        </div>
        <TextInput
          placeholder="Поиск по имени или значению…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-xs"
        />
        <span className="text-[11px] text-muted">{rows.length} из {all.length}</span>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[12px]">
          <tbody>
            {rows.map(([key, value]) => (
              <tr key={key} className="border-b border-line/50">
                <td className="w-[46%] px-3 py-1 align-middle font-mono text-[11px]">{key}</td>
                <td className="px-3 py-1">
                  {typeof value === 'boolean' ? (
                    <Checkbox label={value ? 'включено' : 'выключено'} checked={value}
                      onChange={(checked) => onChange(key, checked)} />
                  ) : (
                    <TextInput
                      value={String(value)}
                      onChange={(event) => {
                        const raw = event.target.value
                        onChange(key, typeof value === 'number' && raw !== '' && !Number.isNaN(Number(raw))
                          ? Number(raw)
                          : raw)
                      }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState title="Ничего не найдено" />}
      </div>
    </div>
  )
}
