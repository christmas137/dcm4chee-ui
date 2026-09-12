import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { SearchIcon, CloseIcon } from '../components/icons'

/**
 * Единственная строка поиска. Ввод разбирается в QIDO-параметры (см. api/omnibox.ts),
 * поэтому никаких форм с двумя десятками полей, как в штатном UI.
 */
export function Omnibox({ value }: { value: string }) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(value)

  // Значение живёт в URL: back/forward и внешние ссылки должны попадать в поле.
  useEffect(() => setText(value), [value])

  // `/` — фокус в поиск, Esc — снять фокус. Не перехватываем, когда пользователь уже печатает.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      if (event.key === '/' && !typing) {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
      if (event.key === 'Escape' && target === inputRef.current) inputRef.current?.blur()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function submit(next: string) {
    void navigate({ to: '/studies', search: (prev) => ({ ...prev, q: next || undefined }) })
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        submit(text.trim())
      }}
      className="relative flex-1"
    >
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Поиск: фамилия, дата, модальность, № назначения…"
        spellCheck={false}
        autoComplete="off"
        className="h-8 w-full rounded-md border border-line bg-panel pr-16 pl-8 text-[13px] placeholder:text-muted focus-visible:border-accent"
      />
      {text ? (
        <button
          type="button"
          aria-label="Очистить"
          onClick={() => {
            setText('')
            submit('')
            inputRef.current?.focus()
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg"
        >
          <CloseIcon className="size-3.5" />
        </button>
      ) : (
        <kbd className="absolute top-1/2 right-2 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">
          /
        </kbd>
      )}
    </form>
  )
}
