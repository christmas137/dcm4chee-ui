import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button, TextInput } from '../../../components/form'
import { Segmented } from '../../../components/Segmented'
import { trTitle } from './i18n'
import { ListView } from './ListView'
import { ObjectForm } from './ObjectForm'
import type { FilterMode } from './ObjectForm'
import { itemTitle } from './model'
import type { FieldInfo, Path } from './model'
import { getIn, setIn } from './values'

type Item = Record<string, unknown>

/** Уровень редактора: объект (форма) или список дочерних записей (таблица). */
export type Level =
  | { kind: 'object'; path: Path; schema: string; label: string; titleKey?: string }
  | { kind: 'list'; path: Path; schema: string; label: string; titleKey?: string; description?: string; columns?: string[] }

export interface Crumb {
  label: string
  onClick?(): void
}

/**
 * Редактор конфигурации по схеме с переходом вглубь: устройство → правила AE → правило.
 * Сверху «хлебные крошки», на каждом уровне — свой экран, а данные одни: правка где угодно
 * меняет общий черновик, который сохраняется целиком.
 */
export function SchemaEditor({
  root, original, onChange, base, skip, include, unknown, crumbsBefore = [], initialQuery = '', actions,
}: {
  root: unknown
  original?: unknown
  onChange(next: unknown): void
  /** Первый уровень — дальше него назад не уйти. */
  base: Level
  /** Только для первого уровня: какие расширения не разворачивать, какие поля показывать. */
  skip?: string[]
  include?(field: FieldInfo): boolean
  unknown?: 'all' | 'scalars' | 'none'
  crumbsBefore?: Crumb[]
  initialQuery?: string
  /** Кнопки справа в строке фильтров первого уровня. */
  actions?: ReactNode
}) {
  const [stack, setStack] = useState<Level[]>([])
  const [query, setQuery] = useState(initialQuery)
  const [mode, setMode] = useState<FilterMode>('all')
  const levels = [base, ...stack]
  const level = levels[levels.length - 1]
  const atBase = stack.length === 0

  function go(next: Level[]) {
    setStack(next)
    setQuery('')
    setMode('all')
  }

  function label(item: Level): string {
    if (item.kind === 'object' && item.titleKey !== undefined) {
      const value = getIn(root, item.path)
      return itemTitle((value ?? {}) as Item, item.titleKey)
    }
    return item.label
  }

  function openList(from: Level, field: FieldInfo) {
    if (field.kind.kind !== 'list') return
    go([...stack, {
      kind: 'list', path: [...from.path, ...field.path], schema: field.kind.ref,
      label: trTitle(field.prop.title), titleKey: field.kind.titleKey,
    }])
  }

  function openItem(list: Extract<Level, { kind: 'list' }>, index: number) {
    go([...stack, { kind: 'object', path: [...list.path, index], schema: list.schema, label: '', titleKey: list.titleKey ?? '' }])
  }

  const crumbs: Crumb[] = [
    ...crumbsBefore,
    ...levels.map((item, index) => ({
      label: label(item),
      onClick: index < levels.length - 1 ? () => go(stack.slice(0, index)) : undefined,
    })),
  ]

  const parent = levels[levels.length - 2]
  const isListItem = level.kind === 'object' && parent?.kind === 'list'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {crumbs.length > 1 && (
        <nav aria-label="Путь" className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-1.5 text-[12px]">
          {crumbs.map((crumb, index) => (
            <span key={index} className="flex items-center gap-1">
              {index > 0 && <span aria-hidden className="text-muted">›</span>}
              {crumb.onClick ? (
                <button type="button" onClick={crumb.onClick} className="text-muted hover:text-fg hover:underline">
                  {crumb.label}
                </button>
              ) : (
                <span aria-current="page" className="font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      {level.kind === 'list' ? (
        <ListView
          key={level.path.join('/')}
          schema={level.schema}
          title={level.label}
          description={level.description}
          titleKey={level.titleKey}
          columns={level.columns}
          items={(getIn(root, level.path) as Item[] | undefined) ?? []}
          onChange={(items) => onChange(setIn(root, level.path, items))}
          onOpen={(index) => openItem(level, index)}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
            <TextInput
              aria-label="Найти параметр"
              placeholder="Найти параметр: название, ключ, слово из описания…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="max-w-sm min-w-48 flex-1"
            />
            <Segmented<FilterMode>
              size="sm"
              label="Какие поля показывать"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'all' as const, label: 'Все' },
                { value: 'set' as const, label: 'Заданные', title: 'Только поля со значением, отличным от умолчания' },
                ...(original !== undefined
                  ? [{ value: 'changed' as const, label: 'Изменённые', title: 'Несохранённые правки' }]
                  : []),
              ]}
            />
            <div className="flex-1" />
            {isListItem && (
              <Button
                tone="danger"
                onClick={() => {
                  const listPath = parent.path
                  const index = level.path[level.path.length - 1] as number
                  const items = (getIn(root, listPath) as Item[] | undefined) ?? []
                  onChange(setIn(root, listPath, items.filter((_, i) => i !== index)))
                  go(stack.slice(0, -1))
                }}
              >
                Удалить запись
              </Button>
            )}
            {atBase && actions}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <ObjectForm
              key={level.path.join('/')}
              schema={level.schema}
              value={(getIn(root, level.path) as Item | undefined) ?? {}}
              original={original === undefined ? undefined : ((getIn(original, level.path) as Item | undefined) ?? {})}
              onChange={(next) => onChange(setIn(root, level.path, next))}
              skip={atBase ? skip : undefined}
              include={atBase ? include : undefined}
              unknown={atBase ? unknown : undefined}
              query={query}
              mode={mode}
              onOpenList={(field) => openList(level, field)}
            />
          </div>
        </>
      )}
    </div>
  )
}
