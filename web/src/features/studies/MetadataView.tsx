import { useMemo, useState } from 'react'
import { displayTag, filterRows, flattenDataset } from '../../api/metadata'
import { useTagDictionary } from '../../api/useTagDictionary'
import type { DicomJson } from '../../api/dicom'
import { TextInput } from '../../components/form'
import { EmptyState } from '../../components/ui'

/** Метаданные снимка: таблица с именами тегов и поиском, либо «как есть» — сырой DICOM JSON. */
export function MetadataView({ dataset, caption }: { dataset: DicomJson; caption: string }) {
  const dictionary = useTagDictionary()
  const [query, setQuery] = useState('')
  const [raw, setRaw] = useState(false)

  const rows = useMemo(() => flattenDataset(dataset), [dataset])
  const visible = useMemo(() => filterRows(rows, query, dictionary.name), [rows, query, dictionary])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{caption}</span>
        {!raw && (
          <TextInput
            aria-label="Поиск по метаданным"
            placeholder="Тег, имя или значение…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="max-w-52"
          />
        )}
        <button
          type="button"
          aria-pressed={raw}
          onClick={() => setRaw((value) => !value)}
          className={`h-7 rounded border px-2 text-[11px] ${
            raw ? 'border-accent bg-accent/15 text-accent' : 'border-line text-muted hover:text-fg'
          }`}
        >
          JSON
        </button>
      </div>

      {raw ? (
        <pre
          aria-label="Сырой DICOM JSON"
          className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text"
        >
          {JSON.stringify(dataset, null, 2)}
        </pre>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-[11px]">
            <tbody>
              {visible.map((row) => (
                <tr key={row.key} data-kind={row.kind} className="border-b border-line/40 align-top">
                  {row.kind === 'item' ? (
                    <td colSpan={4} className="py-0.5 pr-3 text-muted italic" style={{ paddingLeft: 12 + row.depth * 14 }}>
                      {row.value}
                    </td>
                  ) : (
                    <>
                      <td className="w-[92px] py-1 pr-2 font-mono whitespace-nowrap text-muted" style={{ paddingLeft: 12 + row.depth * 14 }}>
                        {displayTag(row.tag)}
                      </td>
                      <td className={`w-[34%] py-1 pr-2 break-all ${row.kind === 'sequence' ? 'font-medium' : ''}`}>
                        {dictionary.name(row.tag)}
                      </td>
                      <td className="w-8 py-1 pr-2 font-mono text-muted">{row.vr}</td>
                      <td className="py-1 pr-3 break-all select-text" title={row.value}>
                        {row.value || <span className="text-muted">—</span>}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <EmptyState title="Ничего не найдено" hint="Ищется по тегу (0010,0010), имени тега и значению." />}
        </div>
      )}
    </div>
  )
}
