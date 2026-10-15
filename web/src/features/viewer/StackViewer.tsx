import { use, useEffect, useRef, useState } from 'react'
import { Segmented } from '../../components/Segmented'
import { EngineContext } from './engine'
import type { ToolName, ViewerEngine, ViewportState } from './engine'
import { keyToCommand } from './keys'
import { formatVoi, presetsFor } from './voi'

export interface Overlay {
  topLeft: string[]
  topRight: string[]
}

interface Props {
  imageIds: string[]
  metadata: Record<string, unknown>
  accept: Record<string, string>
  modality?: string
  initialIndex: number
  overlay: Overlay
  onIndexChange(index: number): void
  /** Движок не справился (формат, декодер) — страница переключится на серверный рендер. */
  onFailure(error: Error): void
  onClose(): void
}

const TOOLS: Array<{ value: ToolName; label: string; title: string }> = [
  { value: 'windowLevel', label: 'Окно', title: 'Окно/уровень — W' },
  { value: 'pan', label: 'Сдвиг', title: 'Сдвиг — P, или средняя кнопка' },
  { value: 'zoom', label: 'Масштаб', title: 'Масштаб — Z, или правая кнопка' },
  { value: 'length', label: 'Длина', title: 'Измерить длину — L' },
  { value: 'angle', label: 'Угол', title: 'Измерить угол — A' },
]

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  // Ползунок срезов — тоже input, но стрелки на нём должны листать, а не мешать.
  return (el?.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range') || el?.tagName === 'TEXTAREA'
}

/**
 * Стек снимков в движке. Монтируется один раз на серию (страница меняет key при смене серии).
 */
export function StackViewer({ imageIds, metadata, accept, modality, initialIndex, overlay, onIndexChange, onFailure, onClose }: Props) {
  const factory = use(EngineContext)
  const elementRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ViewerEngine | null>(null)
  const [state, setState] = useState<ViewportState | null>(null)
  const [tool, setTool] = useState<ToolName>('windowLevel')
  const presets = presetsFor(modality)

  // Пропсы читаются один раз при монтировании: серия сменилась — компонент пересоздан.
  const initial = useRef({ imageIds, metadata, accept, initialIndex, onFailure })

  useEffect(() => {
    const engine = factory()
    engineRef.current = engine
    let alive = true
    const offChange = engine.onChange((next) => alive && setState(next))
    const fail = (error: unknown) => {
      if (!alive) return
      const normalized = error instanceof Error ? error : new Error(String(error))
      console.error('Вьюер: cornerstone не справился, переключаюсь на рендер архива', normalized)
      initial.current.onFailure(normalized)
    }
    const offError = engine.onError(fail)
    const { imageIds: ids, metadata: meta, accept: headers, initialIndex: index } = initial.current
    engine
      .mount(elementRef.current!)
      .then(() => (alive ? engine.setStack(ids, index, meta, headers) : undefined))
      .catch(fail)
    return () => {
      alive = false
      offChange()
      offError()
      engine.destroy()
      engineRef.current = null
    }
  }, [factory])

  useEffect(() => {
    if (state) onIndexChange(state.index)
  }, [state?.index]) // eslint-disable-line react-hooks/exhaustive-deps

  function chooseTool(next: ToolName) {
    setTool(next)
    engineRef.current?.setTool(next)
  }

  function scrollTo(index: number) {
    engineRef.current?.scrollTo(index)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      const command = keyToCommand(event.key)
      if (!command) return
      const engine = engineRef.current
      const index = state?.index ?? 0
      const total = state?.total ?? 0
      switch (command.type) {
        case 'tool': chooseTool(command.tool); break
        case 'scroll': scrollTo(index + command.delta); break
        case 'jump': scrollTo(command.to === 'first' ? 0 : total - 1); break
        case 'invert': engine?.setInvert(!state?.inverted); break
        case 'reset': engine?.reset(); break
        case 'close': onClose(); break
        case 'preset': {
          const preset = presets.find((item) => item.key === command.key)
          if (!preset) return
          engine?.setVOI(preset.width, preset.center)
          break
        }
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const activePreset = presets.find((preset) =>
    state?.windowWidth !== undefined && Math.round(state.windowWidth) === preset.width &&
    Math.round(state.windowCenter ?? NaN) === preset.center)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="toolbar" aria-label="Инструменты" className="flex flex-wrap items-center gap-3 border-b border-line bg-panel px-3 py-2">
        <Segmented label="Инструмент" size="sm" options={TOOLS} value={tool} onChange={chooseTool} />
        {presets.length > 0 && (
          <div role="group" aria-label="Окна КТ" className="flex gap-1">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={activePreset?.id === preset.id}
                title={`Окно ${preset.width}, уровень ${preset.center} — клавиша ${preset.key}`}
                onClick={() => engineRef.current?.setVOI(preset.width, preset.center)}
                className={`h-6 rounded px-2 text-[12px] ${
                  activePreset?.id === preset.id ? 'bg-panel-2 font-medium text-fg' : 'text-muted hover:text-fg'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            aria-pressed={state?.inverted ?? false}
            title="Инверсия — I"
            onClick={() => engineRef.current?.setInvert(!state?.inverted)}
            className={`h-6 rounded px-2 text-[12px] ${state?.inverted ? 'bg-panel-2 font-medium text-fg' : 'text-muted hover:text-fg'}`}
          >
            Инверсия
          </button>
          <button type="button" title="Сбросить окно, масштаб и сдвиг — R" onClick={() => engineRef.current?.reset()}
            className="h-6 rounded px-2 text-[12px] text-muted hover:text-fg">
            Сброс
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-black">
        <div ref={elementRef} data-testid="viewport" className="absolute inset-0" />

        {/* Угловые подписи — как на рабочих станциях: пациент слева, исследование справа. */}
        <div className="pointer-events-none absolute inset-0 p-3 text-[12px] leading-snug text-white/85 [text-shadow:0_1px_2px_#000]">
          <div className="absolute top-3 left-3">{overlay.topLeft.map((line) => <p key={line}>{line}</p>)}</div>
          <div className="absolute top-3 right-10 text-right">{overlay.topRight.map((line) => <p key={line}>{line}</p>)}</div>
          {state && (
            <>
              <p className="absolute bottom-3 left-3">
                Срез {state.index + 1} из {state.total}
                {state.zoom !== undefined && <span className="ml-3">Масштаб {Math.round(state.zoom * 100)}%</span>}
              </p>
              <p className="absolute right-10 bottom-3 whitespace-pre">
                {formatVoi(state.windowWidth, state.windowCenter)}
                {state.inverted && '   инверсия'}
              </p>
            </>
          )}
        </div>

        {state && state.total > 1 && (
          <input
            type="range"
            aria-label="Срез"
            min={1}
            max={state.total}
            value={state.index + 1}
            onChange={(event) => scrollTo(Number(event.target.value) - 1)}
            className="absolute top-3 right-2 bottom-3 w-4 accent-white/70 [writing-mode:vertical-lr]"
          />
        )}
      </div>
    </div>
  )
}
