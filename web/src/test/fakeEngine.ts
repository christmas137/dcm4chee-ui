/**
 * Фейковый движок вьюера: вместо WebGL записывает команды и ведёт простое состояние
 * (срез, окно, инверсия) — ровно то, что настоящий движок сообщает интерфейсу.
 */
import type { ToolName, ViewerEngine, ViewportState } from '../features/viewer/engine'

export interface StackCall {
  imageIds: string[]
  initialIndex: number
  metadata: Record<string, unknown>
  accept?: Record<string, string>
}

export class FakeEngine implements ViewerEngine {
  readonly calls: Array<{ method: string; args: unknown[] }> = []
  stack: StackCall | null = null
  mounted = false
  destroyed = false
  state: ViewportState = { index: 0, total: 0, windowWidth: 400, windowCenter: 40, zoom: 1, inverted: false }
  private changeListeners = new Set<(state: ViewportState) => void>()
  private errorListeners = new Set<(error: Error) => void>()

  private record(method: string, ...args: unknown[]) {
    this.calls.push({ method, args })
  }

  private emit(patch: Partial<ViewportState> = {}) {
    this.state = { ...this.state, ...patch }
    this.changeListeners.forEach((listener) => listener(this.state))
  }

  /** Сколько раз вызывался метод и с какими аргументами. */
  callsOf(method: string): unknown[][] {
    return this.calls.filter((call) => call.method === method).map((call) => call.args)
  }

  async mount(element: HTMLDivElement) {
    this.record('mount', element)
    this.mounted = true
  }

  async setStack(imageIds: string[], initialIndex: number, metadata: Record<string, unknown>, accept?: Record<string, string>) {
    this.record('setStack', imageIds, initialIndex)
    this.stack = { imageIds, initialIndex, metadata, accept }
    this.emit({ index: Math.min(Math.max(0, initialIndex), imageIds.length - 1), total: imageIds.length })
  }

  scrollTo(index: number) {
    this.record('scrollTo', index)
    this.emit({ index: Math.min(Math.max(0, index), this.state.total - 1) })
  }

  setTool(tool: ToolName) {
    this.record('setTool', tool)
  }

  setVOI(width: number, center: number) {
    this.record('setVOI', width, center)
    this.emit({ windowWidth: width, windowCenter: center })
  }

  setInvert(inverted: boolean) {
    this.record('setInvert', inverted)
    this.emit({ inverted })
  }

  reset() {
    this.record('reset')
    this.emit({ windowWidth: 400, windowCenter: 40, zoom: 1, inverted: false })
  }

  /** Тестовый хелпер: движок «не смог раскодировать». */
  fail(message: string) {
    this.errorListeners.forEach((listener) => listener(new Error(message)))
  }

  onChange(listener: (state: ViewportState) => void) {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  onError(listener: (error: Error) => void) {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  destroy() {
    this.record('destroy')
    this.destroyed = true
  }
}

export function fakeEngines() {
  const engines: FakeEngine[] = []
  return {
    engines,
    factory: () => {
      const engine = new FakeEngine()
      engines.push(engine)
      return engine
    },
    /** Последний созданный движок — текущая серия. */
    get current(): FakeEngine {
      return engines[engines.length - 1]
    },
  }
}
