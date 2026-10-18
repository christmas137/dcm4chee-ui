import { useMemo } from 'react'
import { Button } from '../../../components/form'
import { EmptyState } from '../../../components/ui'
import { fieldTitle, isMonoFormat, missingRequired } from './fields'
import { trDescription, trTitle } from './i18n'
import { collectFields, getSchema, itemTitle } from './model'
import type { FieldInfo } from './model'

type Item = Record<string, unknown>

/** Ключи из шаблона подписи: `{dicomHostname}:{dicomPort}` → dicomHostname, dicomPort. */
function titleKeys(template: string | undefined): string[] {
  return [...(template ?? '').matchAll(/\{([^}]+)\}/g)].map((match) => match[1])
}

function cell(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return '{…}'
  return String(value)
}

/**
 * Колонки списка: обязательные поля записи (кроме тех, что уже в подписи) — именно они
 * отличают записи друг от друга. Явно заданные колонки — для разделов с устоявшимся видом.
 */
function pickColumns(fields: FieldInfo[], titleKey: string | undefined, explicit?: string[]): FieldInfo[] {
  const byKey = new Map(fields.map((field) => [field.key, field]))
  if (explicit) return explicit.map((key) => byKey.get(key)).filter((field): field is FieldInfo => Boolean(field))
  const used = new Set(titleKeys(titleKey))
  return fields
    .filter((field) => field.via.length === 0 && field.required && !used.has(field.key) && field.prop.default === undefined)
    .slice(0, 3)
}

export function ListView({
  schema, title, description, titleKey, items, onChange, onOpen, columns,
}: {
  /** Схема элемента списка. */
  schema: string
  title: string
  description?: string
  titleKey?: string
  items: Item[]
  onChange(items: Item[]): void
  onOpen(index: number): void
  columns?: string[]
}) {
  const { fields } = useMemo(() => collectFields(schema), [schema])
  const shown = pickColumns(fields, titleKey, columns)
  const idKey = titleKeys(titleKey)[0]

  function duplicate(index: number) {
    const copy = structuredClone(items[index])
    // Идентификатор должен остаться уникальным — помечаем копию.
    if (idKey && typeof copy[idKey] === 'string') copy[idKey] = `${copy[idKey]}-копия`
    const next = [...items.slice(0, index + 1), copy, ...items.slice(index + 1)]
    onChange(next)
    onOpen(index + 1)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-3 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-medium">{title}</h2>
          <p className="text-[11px] text-muted">
            {description ?? trDescription(getSchema(schema).description)}
          </p>
        </div>
        <Button
          onClick={() => {
            onChange([...items, {}])
            onOpen(items.length)
          }}
        >
          + Добавить
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {items.length === 0 ? (
          <EmptyState title="Пока пусто" hint="Нажмите «Добавить», чтобы создать первую запись." />
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 bg-panel text-[11px] text-muted">
              <tr className="border-b border-line">
                <th className="px-3 py-1.5 text-left font-medium">{trTitle(getSchema(schema).title)}</th>
                {shown.map((field) => (
                  <th key={field.key} className="px-3 py-1.5 text-left font-medium">{fieldTitle(field)}</th>
                ))}
                <th className="w-0" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const missing = missingRequired(fields, item)
                return (
                  <tr
                    key={index}
                    onClick={() => onOpen(index)}
                    className="group cursor-default border-b border-line/50 hover:bg-panel-2"
                  >
                    <td className="px-3 py-1.5">
                      <button type="button" className="text-left font-medium hover:underline" onClick={() => onOpen(index)}>
                        {itemTitle(item, titleKey)}
                      </button>
                      {missing.length > 0 && (
                        <span className="ml-2 text-[11px] text-danger" title={missing.map(fieldTitle).join(', ')}>
                          не заполнено: {missing.length}
                        </span>
                      )}
                    </td>
                    {shown.map((field) => (
                      <td
                        key={field.key}
                        title={cell(item[field.key])}
                        className={`max-w-xs truncate px-3 py-1.5 text-muted ${
                          isMonoFormat(field.prop.format ?? field.prop.items?.format) ? 'font-mono text-[11px]' : ''
                        }`}
                      >
                        {cell(item[field.key])}
                      </td>
                    ))}
                    <td className="px-2 py-1 whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                      <span className="flex gap-1 opacity-60 group-hover:opacity-100">
                        <Button aria-label={`Копировать ${itemTitle(item, titleKey)}`} onClick={() => duplicate(index)}>
                          Копия
                        </Button>
                        <Button
                          tone="danger"
                          aria-label={`Удалить ${itemTitle(item, titleKey)}`}
                          onClick={() => onChange(items.filter((_, i) => i !== index))}
                        >
                          ✕
                        </Button>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
