import { useMemo, useState } from 'react'
import { TextInput } from '../../../components/form'
import { EmptyState } from '../../../components/ui'
import { countLabel } from '../../../lib/plural'
import { Description } from './Description'
import { fieldProblem, fieldState, fieldTitle, groupOf, matchesQuery } from './fields'
import type { FieldState, Group } from './fields'
import { trDescription, trTitle } from './i18n'
import { collectFields, unknownKeys } from './model'
import type { FieldInfo, Path } from './model'
import { getIn, setIn } from './values'
import { BooleanWidget, EnumsWidget, EnumWidget, NumberWidget, TextsWidget, TextWidget } from './widgets'

export type FilterMode = 'all' | 'set' | 'changed'

export interface ObjectFormProps {
  schema: string
  value: Record<string, unknown>
  /** Сохранённая версия — чтобы отметить несохранённые правки. */
  original?: Record<string, unknown>
  onChange(next: Record<string, unknown>): void
  /** Расширения, которые не разворачивать: у них свой экран. */
  skip?: string[]
  /** Показывать только часть полей (например, одну тему параметров архива). */
  include?(field: FieldInfo): boolean
  query: string
  mode: FilterMode
  onOpenList?(field: FieldInfo): void
  /** Ключи вне схемы: все, только одиночные значения (списки записей показаны разделами) или никакие. */
  unknown?: 'all' | 'scalars' | 'none'
}

/**
 * Форма объекта конфигурации, построенная по схеме. Поля сгруппированы, у каждого —
 * русское название, ключ атрибута, описание и значение по умолчанию.
 */
export function ObjectForm({
  schema, value, original, onChange, skip, include, query, mode, onOpenList, unknown: unknownMode = 'all',
}: ObjectFormProps) {
  const { fields, lists } = useMemo(() => collectFields(schema, { skip }), [schema, skip])

  const visible = fields.filter((field) => {
    if (include && !include(field)) return false
    if (!matchesQuery(field, query)) return false
    if (mode === 'all') return true
    const state = fieldState(field, value, original)
    return mode === 'set' ? state !== 'default' : state === 'changed'
  })

  const groups = new Map<string, { group: Group; fields: FieldInfo[] }>()
  for (const field of visible) {
    const group = groupOf(field)
    const entry = groups.get(group.id) ?? { group, fields: [] }
    entry.fields.push(field)
    groups.set(group.id, entry)
  }
  const ordered = [...groups.values()].sort((a, b) => a.group.order - b.group.order)

  // Ключи вне схемы показываем в общем виде и при поиске по их имени; фильтр «заданные» им не помеха.
  const unknown = unknownMode !== 'none' && mode !== 'changed'
    ? unknownKeys(schema, value, { skip }).filter((path) => {
        const inner = getIn(value, path)
        if (unknownMode === 'scalars' && Array.isArray(inner) && typeof inner[0] === 'object') return false
        return path.join('.').toLowerCase().includes(query.trim().toLowerCase())
      })
    : []

  const visibleLists = onOpenList
    ? lists.filter((field) => (!include || include(field)) && matchesQuery(field, query))
    : []

  return (
    <div className="@container">
      {ordered.map(({ group, fields: groupFields }) => (
        <section key={group.id} aria-label={group.label}>
          {(ordered.length > 1 || group.id !== 'main') && (
            <h3 className="sticky top-0 z-10 border-b border-line bg-panel/95 px-3 pt-3 pb-1.5 text-[12px] font-semibold backdrop-blur">
              {group.label}
              <span className="ml-2 font-normal text-muted">{groupFields.length}</span>
            </h3>
          )}
          {groupFields.map((field) => (
            <FieldRow
              key={field.path.join('.')}
              field={field}
              value={getIn(value, field.path)}
              state={fieldState(field, value, original)}
              onChange={(next) => onChange(setIn(value, field.path, next))}
            />
          ))}
        </section>
      ))}

      {visibleLists.length > 0 && (
        <section aria-label="Вложенные списки">
          <h3 className="border-b border-line px-3 pt-3 pb-1.5 text-[12px] font-semibold">Вложенные списки</h3>
          {visibleLists.map((field) => {
            const items = getIn(value, field.path)
            const count = Array.isArray(items) ? items.length : 0
            const countText = count ? countLabel(count, 'запись', 'записи', 'записей') : 'пусто'
            return (
              <button
                key={field.path.join('.')}
                type="button"
                aria-label={`${trTitle(field.prop.title)}: ${countText}`}
                onClick={() => onOpenList!(field)}
                className="flex w-full items-baseline gap-3 border-b border-line/50 px-3 py-2 text-left hover:bg-panel-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px]">{trTitle(field.prop.title)}</span>
                  <span className="block truncate text-[11px] text-muted">{trDescription(field.prop.description)}</span>
                </span>
                <span className={`text-[11.5px] ${count ? '' : 'text-muted'}`}>{countText}</span>
                <span aria-hidden className="text-muted">›</span>
              </button>
            )
          })}
        </section>
      )}

      {unknown.length > 0 && (
        <section aria-label="Нет в схеме">
          <h3 className="border-b border-line px-3 pt-3 pb-1.5 text-[12px] font-semibold">
            Нет в схеме этой версии
            <span className="ml-2 font-normal text-muted">
              поля из другой версии архива или заданные вручную — правятся как JSON
            </span>
          </h3>
          {unknown.map((path) => (
            <UnknownRow
              key={path.join('.')}
              path={path}
              value={getIn(value, path)}
              onChange={(next) => onChange(setIn(value, path, next))}
            />
          ))}
        </section>
      )}

      {ordered.length === 0 && visibleLists.length === 0 && unknown.length === 0 && (
        <EmptyState
          title={mode === 'changed' ? 'Несохранённых правок нет' : mode === 'set' ? 'Ни одно поле не задано явно' : 'Ничего не найдено'}
          hint={mode === 'all' ? 'Попробуйте другое слово: ищется по названию, ключу атрибута и описанию.' : undefined}
        />
      )}
    </div>
  )
}

/** Поле вне схемы: ключ и значение как JSON. Пока JSON не разбирается — в конфигурацию ничего не пишется. */
function UnknownRow({ path, value, onChange }: { path: Path; value: unknown; onChange(next: unknown): void }) {
  const [text, setText] = useState(() => JSON.stringify(value))
  const [error, setError] = useState(false)
  const label = path.join('.')
  return (
    <div className="grid gap-x-5 gap-y-1 border-b border-l-2 border-b-line/50 border-l-fg/35 px-3 py-2 @2xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <span className="font-mono text-[11px] break-all">{label}</span>
      <div className="flex flex-col gap-0.5">
        <TextInput
          aria-label={label}
          value={text}
          className={`font-mono text-[11.5px] ${error ? 'border-danger' : ''}`}
          onChange={(event) => {
            setText(event.target.value)
            if (event.target.value.trim() === '') {
              setError(false)
              return onChange(undefined)
            }
            try {
              onChange(JSON.parse(event.target.value))
              setError(false)
            } catch {
              setError(true)
            }
          }}
        />
        {error && <span className="text-[11px] text-danger">не разбирается как JSON — строки в кавычках</span>}
      </div>
    </div>
  )
}

const STATE_MARK: Record<FieldState, string> = {
  default: 'border-l-transparent',
  set: 'border-l-fg/35',
  changed: 'border-l-warn',
}

function FieldRow({ field, value, state, onChange }: {
  field: FieldInfo
  value: unknown
  state: FieldState
  onChange(next: unknown): void
}) {
  const title = fieldTitle(field)
  const problem = fieldProblem(field, value)
  const hasDefault = field.prop.default !== undefined

  return (
    <div
      data-field={field.key}
      data-state={state}
      className={`grid gap-x-5 gap-y-1.5 border-b border-l-2 border-b-line/50 px-3 py-2 @2xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] ${STATE_MARK[state]}`}
    >
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className={`text-[12.5px] ${state === 'default' ? '' : 'font-medium'}`}>
            {title}
            {field.required && !hasDefault && <span className="text-danger" title="обязательное поле"> *</span>}
          </span>
          <span className="font-mono text-[10.5px] text-muted">{field.key}</span>
          {state === 'changed' && <span className="text-[10.5px] text-warn">изменено</span>}
        </div>
        <Description text={trDescription(field.prop.description)} />
      </div>
      <div className="flex min-w-0 items-start gap-1">
        <div className="min-w-0 flex-1">
          <Widget field={field} label={title} value={value} onChange={onChange} />
          {problem && <p className="mt-0.5 text-[11px] text-danger">{problem}</p>}
        </div>
        {/* У флага «не задано» — одно из положений переключателя, отдельный сброс не нужен. */}
        {value !== undefined && field.kind.kind !== 'boolean' && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label={`Сбросить: ${title}`}
            title={hasDefault ? `Вернуть значение по умолчанию (${String(field.prop.default)})` : 'Убрать значение'}
            className="h-7 shrink-0 rounded px-1.5 text-[13px] text-muted hover:bg-panel-2 hover:text-fg"
          >
            ↺
          </button>
        )}
      </div>
    </div>
  )
}

function Widget({ field, label, value, onChange }: {
  field: FieldInfo
  label: string
  value: unknown
  onChange(next: unknown): void
}) {
  const props = { field, label, onChange }
  switch (field.kind.kind) {
    case 'boolean':
      return <BooleanWidget {...props} value={typeof value === 'boolean' ? value : undefined} />
    case 'number':
      return <NumberWidget {...props} value={typeof value === 'number' ? value : undefined} />
    case 'enum':
      return <EnumWidget {...props} value={value as string | number | undefined} />
    case 'enums':
      return <EnumsWidget {...props} value={Array.isArray(value) ? value : undefined} />
    case 'texts':
      return <TextsWidget {...props} value={Array.isArray(value) ? value.map(String) : undefined} />
    default:
      return <TextWidget {...props} value={value === undefined ? undefined : String(value)} />
  }
}
