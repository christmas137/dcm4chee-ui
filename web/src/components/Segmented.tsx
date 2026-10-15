/**
 * Сегментный переключатель — для выбора одного из нескольких. Форма подсказывает смысл:
 * выбрать можно только один вариант, в отличие от переключателей модальностей.
 */
export interface SegmentOption<T extends string> {
  value: T
  label: string
}

export function Segmented<T extends string>({
  options, value, onChange, label, asTabs = false, size = 'md',
}: {
  options: SegmentOption<T>[]
  value: T | undefined
  onChange(value: T): void
  label: string
  /** Вкладки (role=tab) — когда переключается содержимое под переключателем. */
  asTabs?: boolean
  size?: 'sm' | 'md'
}) {
  return (
    <div
      role={asTabs ? 'tablist' : 'group'}
      aria-label={label}
      className="inline-flex shrink-0 rounded-md border border-line bg-panel-2/60 p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role={asTabs ? 'tab' : undefined}
            aria-selected={asTabs ? active : undefined}
            aria-pressed={asTabs ? undefined : active}
            onClick={() => onChange(option.value)}
            className={[
              'rounded-[5px] whitespace-nowrap transition-colors',
              size === 'sm' ? 'h-6 px-2.5 text-[12px]' : 'h-7 px-3 text-[12.5px]',
              active ? 'bg-accent font-medium text-accent-fg' : 'text-muted hover:text-fg',
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
