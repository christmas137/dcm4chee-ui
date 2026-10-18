import { useState } from 'react'
import type { ReactNode } from 'react'

const LINK = /<a\s[^>]*?href="([^"]+)"[^>]*>(.*?)<\/a>/gi

/** Описания в схемах — текст с редкими ссылками на вики dcm4chee и `<br>` в списках; прочую разметку выкидываем. */
function renderDescription(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(LINK)) {
    if (match.index > last) parts.push(strip(text.slice(last, match.index)))
    parts.push(
      <a key={match.index} href={match[1]} target="_blank" rel="noreferrer" className="underline hover:text-fg">
        {strip(match[2])}
      </a>,
    )
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(strip(text.slice(last)))
  return parts
}

function strip(html: string): string {
  // Только настоящие HTML-теги: «<ширина>,<высота>» и «<ae-title>=<число>» — это формат, его не трогаем.
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?(?:b|i|u|em|strong|p|span|code|div)\b[^>]*>/gi, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

/** Длинные описания свёрнуты до двух строк — форма не должна превращаться в документацию. */
export function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  const long = text.length > 150
  return (
    <div className="text-[11px] leading-snug text-muted">
      <p className={`whitespace-pre-line ${long && !open ? 'line-clamp-2' : ''}`}>{renderDescription(text)}</p>
      {long && (
        <button type="button" onClick={() => setOpen((value) => !value)} className="text-fg/70 hover:underline">
          {open ? 'свернуть' : 'подробнее'}
        </button>
      )}
    </div>
  )
}
