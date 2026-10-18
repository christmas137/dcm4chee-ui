/**
 * Виджеты полей конфигурации. Каждый получает текущее значение (или `undefined` — «не задано,
 * действует умолчание») и отдаёт новое; `undefined` из виджета означает «убрать ключ».
 */
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { useTagDictionary } from '../../../api/useTagDictionary'
import { Select, TextInput } from '../../../components/form'
import { describeDuration, describePeriod } from './duration'
import { isMonoFormat } from './fields'
import { trOption } from './i18n'
import type { EnumOption, FieldInfo } from './model'
import { useInherited, useSuggestions } from './refs'
import type { Suggestion } from './refs'

interface WidgetProps<T> {
  field: FieldInfo
  label: string
  value: T | undefined
  onChange(next: T | undefined): void
}

/**
 * Что действует, пока поле не задано. У AE и HL7-приложений архива — значение уровня
 * устройства (они его переопределяют), у остальных — умолчание из схемы.
 */
function useFallback(field: FieldInfo): { text: string; value: unknown; label: string } | undefined {
  const inherited = useInherited(field.schema, field.key)
  const value = inherited ?? field.prop.default
  if (value === undefined || value === null) return undefined
  const text = Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? (value ? 'да' : 'нет') : String(value)
  return { text, value, label: inherited !== undefined ? 'как у устройства' : 'по умолчанию' }
}

/** Подсказка под полем: расшифровка длительности, имя тега, описание выбранного AE. */
function FormatHint({ format, value, suggestions }: { format?: string; value: string; suggestions: Suggestion[] }) {
  if (!value) return null
  let text: ReactNode = null
  let bad = false
  if (format === 'dcmDuration') {
    const human = describeDuration(value)
    text = human ?? 'не похоже на длительность: например PT30S, PT15M, PT1H, P1D'
    bad = human === null
  } else if (format === 'dcmPeriod') {
    const human = describePeriod(value)
    text = human ?? 'не похоже на период: например P1D, P2W, P6M, P1Y'
    bad = human === null
  } else if (format === 'dcmTag') {
    return <TagName tag={value} />
  } else {
    text = suggestions.find((item) => item.value === value)?.label ?? null
  }
  if (!text) return null
  return <span className={`text-[11px] ${bad ? 'text-danger' : 'text-muted'}`}>{text}</span>
}

function TagName({ tag }: { tag: string }) {
  const dictionary = useTagDictionary()
  if (!/^[0-9a-f]{8}$/i.test(tag)) {
    return <span className="text-[11px] text-danger">тег пишется восемью шестнадцатеричными цифрами: 00100020</span>
  }
  const name = dictionary.name(tag.toUpperCase())
  return name.startsWith('(') ? null : <span className="text-[11px] text-muted">{name}</span>
}

function SuggestionList({ id, items }: { id: string; items: Suggestion[] }) {
  if (items.length === 0) return null
  return (
    <datalist id={id}>
      {items.map((item) => <option key={item.value} value={item.value} label={item.label} />)}
    </datalist>
  )
}

export function TextWidget({ field, label, value, onChange }: WidgetProps<string>) {
  const listId = useId()
  const format = field.kind.kind === 'text' ? field.kind.format : undefined
  const suggestions = useSuggestions(format)
  const fallback = useFallback(field)
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <TextInput
        aria-label={label}
        value={value ?? ''}
        list={suggestions.length ? listId : undefined}
        placeholder={fallback && `${fallback.label}: ${fallback.text}`}
        className={isMonoFormat(format) ? 'font-mono text-[11.5px]' : ''}
        onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
      />
      <SuggestionList id={listId} items={suggestions} />
      <FormatHint format={format} value={value ?? ''} suggestions={suggestions} />
    </div>
  )
}

/**
 * Число. Текст поля живёт отдельно от конфигурации: пока там пусто или не число, в конфигурацию
 * ничего не пишется, иначе «стёр и набрал заново» уезжало бы на сервер строкой ("500" вместо 500).
 */
export function NumberWidget({ field, label, value, onChange }: WidgetProps<number>) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  const integer = field.kind.kind === 'number' && field.kind.integer
  const parsed = Number(text.replace(',', '.'))
  // Значение поменяли снаружи (сброс к умолчанию, отмена правок) — текст поля догоняет его.
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    if (value === undefined ? text.trim() !== '' : value !== parsed) setText(value === undefined ? '' : String(value))
  }
  const invalid = text.trim() !== '' && (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)))
  const { minimum, exclusiveMinimum, maximum } = field.prop
  const tooSmall = !invalid && text.trim() !== '' && (
    (minimum !== undefined && parsed < minimum) || (exclusiveMinimum !== undefined && parsed <= exclusiveMinimum))
  const tooBig = !invalid && text.trim() !== '' && maximum !== undefined && parsed > maximum
  const fallback = useFallback(field)
  return (
    <div className="flex flex-col gap-0.5">
      <TextInput
        aria-label={label}
        aria-invalid={invalid || tooSmall || tooBig}
        inputMode={integer ? 'numeric' : 'decimal'}
        value={text}
        placeholder={fallback && `${fallback.label}: ${fallback.text}`}
        className={`max-w-48 ${invalid || tooSmall || tooBig ? 'border-danger' : ''}`}
        onChange={(event) => {
          const raw = event.target.value
          setText(raw)
          if (raw.trim() === '') return onChange(undefined)
          const next = Number(raw.replace(',', '.'))
          if (Number.isFinite(next) && (!integer || Number.isInteger(next))) onChange(next)
        }}
      />
      {invalid && <span className="text-[11px] text-danger">{integer ? 'нужно целое число' : 'нужно число'}</span>}
      {tooSmall && (
        <span className="text-[11px] text-danger">
          не меньше {minimum ?? `чем ${exclusiveMinimum! + 1}`}
        </span>
      )}
      {tooBig && <span className="text-[11px] text-danger">не больше {maximum}</span>}
    </div>
  )
}

/**
 * Флаг — три положения: «не задано» (действует умолчание или значение уровнем выше), «да», «нет».
 * Галочка тут врала бы: явное «нет» и «не задано» выглядели бы одинаково.
 */
export function BooleanWidget({ field, label, value, onChange }: WidgetProps<boolean>) {
  const fallback = useFallback(field)
  const unset = fallback ? `${fallback.label}: ${fallback.text}` : 'не задано'
  const options: { key: string; text: string; next: boolean | undefined }[] = [
    { key: 'unset', text: unset, next: undefined },
    { key: 'yes', text: 'да', next: true },
    { key: 'no', text: 'нет', next: false },
  ]
  const active = value === undefined ? 'unset' : value ? 'yes' : 'no'
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-panel-2/60 p-0.5">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="radio"
          aria-checked={active === option.key}
          onClick={() => onChange(option.next)}
          className={`h-6 rounded-[5px] px-2.5 text-[12px] whitespace-nowrap ${
            active === option.key
              ? option.key === 'unset' ? 'bg-panel font-medium text-fg shadow-sm' : 'bg-accent font-medium text-accent-fg'
              : 'text-muted hover:text-fg'
          }`}
        >
          {option.text}
        </button>
      ))}
    </div>
  )
}

function optionText(option: EnumOption): string | undefined {
  return option.description ? trOption(option.description) : undefined
}

export function EnumWidget({ field, label, value, onChange }: WidgetProps<string | number>) {
  const options = field.kind.kind === 'enum' ? field.kind.options : []
  const fallback = useFallback(field)
  const shown = value ?? fallback?.value
  const selected = options.find((option) => String(option.value) === String(shown))
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <Select
        aria-label={label}
        value={value === undefined ? '' : String(value)}
        className="font-mono text-[11.5px]"
        onChange={(event) => {
          const raw = event.target.value
          if (raw === '') return onChange(undefined)
          const option = options.find((item) => String(item.value) === raw)
          onChange(option?.value ?? raw)
        }}
      >
        <option value="">{fallback ? `${fallback.label} (${fallback.text})` : '— не задано —'}</option>
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>{String(option.value)}</option>
        ))}
        {/* Значение из новой версии архива, которого нет в схеме, — не теряем его. */}
        {value !== undefined && !options.some((option) => String(option.value) === String(value)) && (
          <option value={String(value)}>{String(value)}</option>
        )}
      </Select>
      {selected && optionText(selected) && (
        <span className="text-[11px] leading-snug text-muted">{optionText(selected)}</span>
      )}
    </div>
  )
}

/** Несколько значений из фиксированного набора — переключателями. */
export function EnumsWidget({ field, label, value, onChange }: WidgetProps<(string | number)[]>) {
  const options = field.kind.kind === 'enums' ? field.kind.options : []
  const current = value ?? []
  const extra = current.filter((item) => !options.some((option) => option.value === item))
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {[...options, ...extra.map((item) => ({ value: item }) as EnumOption)].map((option) => {
        const active = current.includes(option.value)
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            title={optionText(option)}
            onClick={() => {
              const next = active ? current.filter((item) => item !== option.value) : [...current, option.value]
              onChange(next.length ? next : undefined)
            }}
            className={`h-6 rounded border px-2 font-mono text-[11px] ${
              active ? 'border-accent bg-accent text-accent-fg' : 'border-line text-muted hover:text-fg'
            }`}
          >
            {String(option.value)}
          </button>
        )
      })}
    </div>
  )
}

/** Список строк: значения чипами, новое — в поле ввода (Enter или «+»). */
export function TextsWidget({ field, label, value, onChange }: WidgetProps<string[]>) {
  const listId = useId()
  const format = field.kind.kind === 'texts' ? field.kind.format : undefined
  const suggestions = useSuggestions(format)
  const [draft, setDraft] = useState('')
  const current = value ?? []
  const mono = isMonoFormat(format)
  const fallback = useFallback(field)

  function add(raw: string) {
    // Вставка столбца значений: по строке на значение.
    const items = raw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    const fresh = items.filter((item) => !current.includes(item))
    if (fresh.length) onChange([...current, ...fresh])
    setDraft('')
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {current.length > 0 && (
        <ul aria-label={label} className="flex flex-wrap gap-1">
          {current.map((item, index) => (
            <li
              key={`${item}#${index}`}
              className="flex max-w-full items-center gap-1 rounded border border-line bg-panel-2/60 py-0.5 pr-0.5 pl-1.5"
            >
              <span className={`min-w-0 truncate text-[11.5px] ${mono ? 'font-mono' : ''}`} title={item}>{item}</span>
              <ChipHint format={format} value={item} suggestions={suggestions} />
              <button
                type="button"
                aria-label={`Убрать ${item}`}
                onClick={() => {
                  const next = current.filter((_, i) => i !== index)
                  onChange(next.length ? next : undefined)
                }}
                className="rounded px-1 text-[11px] text-muted hover:bg-panel-2 hover:text-fg"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1">
        <TextInput
          aria-label={`${label}: добавить значение`}
          value={draft}
          list={suggestions.length ? listId : undefined}
          placeholder={current.length === 0 && fallback ? `${fallback.label}: ${fallback.text}` : 'добавить…'}
          className={mono ? 'font-mono text-[11.5px]' : ''}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text')
            if (text.includes('\n')) {
              event.preventDefault()
              add(text)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add(draft)
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
        />
        <SuggestionList id={listId} items={suggestions} />
      </div>
    </div>
  )
}

function ChipHint({ format, value, suggestions }: { format?: string; value: string; suggestions: Suggestion[] }) {
  // Словарь тегов тяжёлый — грузим его, только если поле действительно про теги.
  if (format === 'dcmTag') return <ChipTagName tag={value} />
  const text = format === 'dcmDuration' ? describeDuration(value)
    : format === 'dcmPeriod' ? describePeriod(value)
      : suggestions.find((item) => item.value === value)?.label
  return text ? <span className="truncate text-[11px] text-muted">{text}</span> : null
}

function ChipTagName({ tag }: { tag: string }) {
  const dictionary = useTagDictionary()
  if (!/^[0-9a-f]{8}$/i.test(tag)) return null
  const name = dictionary.name(tag.toUpperCase())
  return name.startsWith('(') ? null : <span className="truncate text-[11px] text-muted">{name}</span>
}
