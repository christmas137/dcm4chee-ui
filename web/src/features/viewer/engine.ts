/**
 * Движок отрисовки за интерфейсом. Вьюер не знает про cornerstone напрямую:
 * в браузере работает cornerstoneEngine, в тестах — фейк, который записывает команды.
 * Так поведение вьюера (что грузим, какие инструменты включаем, что показываем)
 * проверяется без WebGL.
 */
import { createContext } from 'react'

export type ToolName = 'windowLevel' | 'pan' | 'zoom' | 'length' | 'angle'

export interface ViewportState {
  /** Номер кадра в стеке, с нуля. */
  index: number
  total: number
  windowWidth?: number
  windowCenter?: number
  /** Масштаб относительно «вписать в окно», 1 = 100%. */
  zoom?: number
  inverted: boolean
}

export interface ViewerEngine {
  mount(element: HTMLDivElement): Promise<void>
  /**
   * @param metadata метаданные снимка для каждого кадра — нужны загрузчику для декодирования
   * @param accept заголовок Accept для каждого кадра — чтобы получать кадры в родном сжатии
   */
  setStack(
    imageIds: string[],
    initialIndex: number,
    metadata: Record<string, unknown>,
    accept?: Record<string, string>,
  ): Promise<void>
  scrollTo(index: number): void
  setTool(tool: ToolName): void
  setVOI(width: number, center: number): void
  setInvert(inverted: boolean): void
  reset(): void
  onChange(listener: (state: ViewportState) => void): () => void
  onError(listener: (error: Error) => void): () => void
  destroy(): void
}

export type EngineFactory = () => ViewerEngine

/** Фабрика движка. По умолчанию — cornerstone, загружаемый лениво (он тяжёлый). */
export const EngineContext = createContext<EngineFactory>(() => {
  throw new Error('Движок вьюера не задан')
})
