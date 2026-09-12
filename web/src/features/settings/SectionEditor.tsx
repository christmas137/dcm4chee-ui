import { useState } from 'react'
import { Button } from '../../components/form'
import { JsonEditor } from '../../components/JsonEditor'
import { EmptyState } from '../../components/ui'
import { itemLabel } from './archiveSections'
import type { SectionDef } from './archiveSections'

function cell(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return '{…}'
  return String(value)
}

/**
 * Список элементов одного раздела конфигурации и редактор выбранного элемента.
 * Формы под каждый из сорока разделов писать бессмысленно, поэтому колонки берём из реестра,
 * а правку делаем через JSON — зато доступны все поля без исключения.
 */
export function SectionEditor({
  section, items, onChange,
}: {
  section: SectionDef
  items: Record<string, unknown>[]
  onChange(items: Record<string, unknown>[]): void
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const columns = section.columns ?? []
  const current = selected !== null ? items[selected] : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-medium">{section.label}</h2>
          <p className="truncate text-[11px] text-muted">
            {section.hint ?? <span className="font-mono">{section.path.join(' › ')}</span>}
          </p>
        </div>
        <Button
          onClick={() => {
            const next = [...items, section.idKey ? { [section.idKey]: '' } : {}]
            onChange(next)
            setSelected(next.length - 1)
          }}
        >
          + Добавить
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {items.length === 0 ? (
          <EmptyState title="Раздел пуст" hint="Нажмите «Добавить», чтобы создать первую запись." />
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 bg-panel text-[11px] text-muted">
              <tr className="border-b border-line">
                <th className="px-3 py-1.5 text-left font-medium">
                  {columns[0]?.title ?? section.idKey ?? 'Запись'}
                </th>
                {columns.slice(1).map((column) => (
                  <th key={column.key} className="px-3 py-1.5 text-left font-medium">{column.title}</th>
                ))}
                {columns.length === 0 && <th className="px-3 py-1.5 text-left font-medium">Поля</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr
                  key={index}
                  onClick={() => setSelected(index)}
                  className={`cursor-default border-b border-line/50 ${
                    selected === index ? 'bg-accent/12' : 'hover:bg-panel-2'
                  }`}
                >
                  <td className="px-3 py-1.5 font-medium">
                    {columns[0] ? cell(item[columns[0].key]) : itemLabel(item, section)}
                  </td>
                  {columns.slice(1).map((column) => (
                    <td key={column.key} className="max-w-sm truncate px-3 py-1.5 text-muted" title={cell(item[column.key])}>
                      {cell(item[column.key])}
                    </td>
                  ))}
                  {columns.length === 0 && (
                    <td className="max-w-xl truncate px-3 py-1.5 text-muted">
                      {Object.keys(item).slice(0, 6).join(', ')}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {current && (
        <div className="max-h-[46%] shrink-0 space-y-2 overflow-auto border-t border-line p-3">
          <div className="flex items-center gap-2">
            <p className="flex-1 truncate text-[12px] font-medium">{itemLabel(current, section)}</p>
            <Button
              tone="danger"
              onClick={() => {
                onChange(items.filter((_, index) => index !== selected))
                setSelected(null)
              }}
            >
              Удалить запись
            </Button>
            <Button onClick={() => setSelected(null)}>Закрыть</Button>
          </div>
          <JsonEditor
            value={current}
            rows={12}
            onChange={(next) =>
              onChange(items.map((item, index) => (index === selected ? (next as Record<string, unknown>) : item)))}
          />
        </div>
      )}
    </div>
  )
}
