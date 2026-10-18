import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

/**
 * Модальное окно: затемнение, Esc и клик мимо — закрыть, фокус — внутрь при открытии.
 * Пока идёт действие (`busy`), закрыть нельзя: иначе непонятно, чем оно кончилось.
 */
export function Dialog({
  title, onClose, busy = false, width = 'w-[560px]', children, footer,
}: {
  title: string
  onClose(): void
  busy?: boolean
  width?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panel.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [busy, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className={`flex max-h-[85vh] ${width} max-w-full flex-col rounded-lg border border-line bg-panel shadow-xl outline-none`}
      >
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Закрыть"
            disabled={busy}
            onClick={onClose}
            className="rounded px-1.5 text-muted hover:bg-panel-2 hover:text-fg disabled:opacity-40"
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        {footer && <footer className="border-t border-line px-4 py-3">{footer}</footer>}
      </div>
    </div>
  )
}
