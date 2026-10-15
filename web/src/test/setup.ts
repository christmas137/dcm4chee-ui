/**
 * Окружение для компонентных тестов: jsdom + то, чего в нём нет, а браузер даёт даром.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Node 25 объявляет собственный глобальный localStorage (без файла он нерабочий) и тем
// перекрывает jsdom-овский. Ставим простое хранилище в памяти — приложению больше и не нужно.
class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, String(value)) }
}
for (const name of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(globalThis, name, { configurable: true, value: new MemoryStorage() })
  Object.defineProperty(window, name, { configurable: true, value: globalThis[name] })
}

// Тема смотрит на prefers-color-scheme.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Виртуализованный список меряет контейнер. В jsdom у всех элементов нулевой размер,
// и список рисовал бы пустоту — даём ему «экран» 1200×1000.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver

const rect = { x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 1000, width: 1200, height: 1000, toJSON: () => ({}) }
Element.prototype.getBoundingClientRect = function () {
  return rect as DOMRect
}
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 1000 })
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 1200 })
Element.prototype.scrollTo = function () {}
window.scrollTo = () => {} // восстановление прокрутки роутером
Element.prototype.scrollIntoView = function () {}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})
