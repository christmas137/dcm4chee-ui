import type { ReactNode } from 'react'

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="загрузка"
      className={`inline-block size-4 animate-spin rounded-full border-2 border-line border-t-accent ${className}`}
    />
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' }) {
  const tones = {
    neutral: 'bg-panel-2 text-muted',
    accent: 'bg-accent/15 text-accent',
  }
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>
}

export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <p className="text-sm text-fg">{title}</p>
      {hint && <p className="max-w-md text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function ErrorBox({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="m-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-xs">
      <p className="font-medium text-danger">Запрос к архиву не прошёл</p>
      <p className="mt-1 break-words font-mono text-[11px] text-muted">{error.message}</p>
      {retry && (
        <button type="button" onClick={retry} className="mt-2 rounded border border-line px-2 py-1 hover:bg-panel-2">
          Повторить
        </button>
      )}
    </div>
  )
}

/** Плашка из заголовка `Warning`: ответ архива неполный, но данные показать всё равно надо. */
export function WarningBar({ text }: { text: string }) {
  return (
    <div className="border-b border-warn/30 bg-warn/10 px-4 py-1.5 text-[11px] text-warn">{text}</div>
  )
}
