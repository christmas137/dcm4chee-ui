import { useEffect, useState } from 'react'
import { renderedUrl } from '../../api/series'
import type { Overlay } from './StackViewer'
import type { StackInstance } from './stack'
import { keyToCommand } from './keys'

interface Props {
  aet: string
  studyUID: string
  seriesUID: string
  instances: StackInstance[]
  initialIndex: number
  overlay: Overlay
  /** Почему не справился основной вьюер — инженеру пригодится. */
  reason?: string
  onIndexChange(index: number): void
  onClose(): void
}

/**
 * Запасной вьюер: кадры рендерит сам архив (JPEG). Окно/уровень и измерения недоступны,
 * зато показывается всё, что архив вообще умеет отрисовать, — включая экзотические сжатия.
 */
export function RenderedViewer({ aet, studyUID, seriesUID, instances, initialIndex, overlay, reason, onIndexChange, onClose }: Props) {
  const frames = instances.flatMap((instance) =>
    instance.frames > 1
      ? Array.from({ length: instance.frames }, (_, i) => renderedUrl(aet, studyUID, seriesUID, instance.sopUID, i + 1))
      : [renderedUrl(aet, studyUID, seriesUID, instance.sopUID)])
  const [index, setIndex] = useState(Math.min(Math.max(0, initialIndex), frames.length - 1))
  const go = (next: number) => setIndex(Math.min(Math.max(0, next), frames.length - 1))

  useEffect(() => onIndexChange(index), [index]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const command = keyToCommand(event.key)
      if (command?.type === 'scroll') go(index + command.delta)
      else if (command?.type === 'jump') go(command.to === 'first' ? 0 : frames.length - 1)
      else if (command?.type === 'close') onClose()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p role="status" className="border-b border-warn/30 bg-warn/10 px-3 py-1.5 text-[12px] text-warn">
        Браузер не смог раскодировать эти снимки — показан рендер архива. Окно, масштаб и измерения недоступны.
        {reason && <span className="ml-2 text-muted">Причина: {reason}</span>}
      </p>
      <div
        className="relative min-h-0 flex-1 bg-black"
        onWheel={(event) => go(index + Math.sign(event.deltaY))}
      >
        <img src={frames[index]} alt={`Срез ${index + 1}`} className="absolute inset-0 m-auto max-h-full max-w-full object-contain" />
        <div className="pointer-events-none absolute inset-0 text-[12px] leading-snug text-white/85 [text-shadow:0_1px_2px_#000]">
          <div className="absolute top-3 left-3">{overlay.topLeft.map((line) => <p key={line}>{line}</p>)}</div>
          <div className="absolute top-3 right-10 text-right">{overlay.topRight.map((line) => <p key={line}>{line}</p>)}</div>
          <p className="absolute bottom-3 left-3">Срез {index + 1} из {frames.length}</p>
        </div>
        {frames.length > 1 && (
          <input
            type="range" aria-label="Срез" min={1} max={frames.length} value={index + 1}
            onChange={(event) => go(Number(event.target.value) - 1)}
            className="absolute top-3 right-2 bottom-3 w-4 accent-white/70 [writing-mode:vertical-lr]"
          />
        )}
      </div>
    </div>
  )
}
