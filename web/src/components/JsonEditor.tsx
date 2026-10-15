import { useEffect, useState } from 'react'

/**
 * Правка произвольного куска конфигурации как JSON.
 *
 * Нужен, чтобы в новом интерфейсе не было «мёртвых зон»: удобные формы закрывают частые поля,
 * а всё остальное, что умеет dcm4chee, остаётся доступным здесь же.
 */
export function JsonEditor({
  value, onChange, rows = 16, label = 'JSON',
}: {
  value: unknown
  onChange(next: unknown): void
  rows?: number
  /** Подпись для экранных читалок и тестов. */
  label?: string
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2))
  const [error, setError] = useState<string | null>(null)

  // Значение могло измениться снаружи (перезагрузили устройство) — подхватываем.
  useEffect(() => setText(JSON.stringify(value, null, 2)), [value])

  return (
    <div className="flex flex-col gap-1">
      <textarea
        aria-label={label}
        value={text}
        rows={rows}
        spellCheck={false}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          try {
            const parsed: unknown = JSON.parse(next)
            setError(null)
            onChange(parsed)
          } catch (parseError) {
            setError((parseError as Error).message)
          }
        }}
        className={`w-full resize-y rounded border bg-panel p-2 font-mono text-[11px] leading-relaxed text-fg ${
          error ? 'border-danger' : 'border-line'
        }`}
      />
      {error && <span className="text-[10px] text-danger">JSON не разбирается: {error}</span>}
    </div>
  )
}
