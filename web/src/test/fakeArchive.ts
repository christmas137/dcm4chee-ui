/**
 * Фейковый dcm4chee для компонентных тестов.
 *
 * Подменяет `fetch`: отвечает на запросы приложения по заданным маршрутам и записывает каждый
 * запрос — метод, путь, параметры, тело. Главная проверка в тестах — не «что нарисовалось»,
 * а «какой запрос ушёл в архив»: ровно это потом делает настоящий сервер.
 */
import { vi } from 'vitest'

const PREFIX = '/dcm4chee-arc'

export interface RecordedRequest {
  method: string
  /** Путь без `/dcm4chee-arc` и без query: `/aets/DCM4CHEE/rs/studies`. */
  path: string
  params: URLSearchParams
  /** Тело запроса, разобранное из JSON, если это JSON. */
  body?: unknown
}

type HandlerResult = Response | unknown
type Handler = (request: RecordedRequest) => HandlerResult | Promise<HandlerResult>

interface Route {
  method: string
  pattern: string | RegExp
  handler: Handler
}

export function json(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
}

export function noContent(): Response {
  return new Response(null, { status: 204 })
}

export class FakeArchive {
  readonly requests: RecordedRequest[] = []
  readonly unmatched: RecordedRequest[] = []
  private readonly routes: Route[] = []

  /**
   * Маршрут: строка — точное совпадение пути, RegExp — по шаблону.
   * Обработчик возвращает `Response`, либо данные (уйдут как JSON 200), либо `undefined` (204).
   * Более поздние маршруты перекрывают более ранние — удобно переопределять в отдельном тесте.
   */
  on(method: string, pattern: string | RegExp, handler: Handler): this
  on(method: string, pattern: string | RegExp, data: unknown): this
  on(method: string, pattern: string | RegExp, handler: unknown): this {
    const fn: Handler = typeof handler === 'function' ? (handler as Handler) : () => handler
    this.routes.unshift({ method: method.toUpperCase(), pattern, handler: fn })
    return this
  }

  /** Запросы с данным методом и путём (строка — точно, RegExp — по шаблону). */
  calls(method: string, pattern: string | RegExp): RecordedRequest[] {
    return this.requests.filter((request) =>
      request.method === method.toUpperCase() && matches(pattern, request.path))
  }

  readonly fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const target = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://test')
    const method = (init.method ?? 'GET').toUpperCase()
    const path = target.pathname.startsWith(PREFIX) ? target.pathname.slice(PREFIX.length) : target.pathname
    let body: unknown
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = init.body
      }
    }
    const request: RecordedRequest = { method, path, params: target.searchParams, body }
    this.requests.push(request)

    const route = this.routes.find((item) => item.method === method && matches(item.pattern, path))
    if (!route) {
      this.unmatched.push(request)
      return new Response(`нет фейкового маршрута для ${method} ${path}`, { status: 404 })
    }
    const result = await route.handler(request)
    if (result instanceof Response) return result
    if (result === undefined) return noContent()
    return json(result)
  })

  install(): this {
    vi.stubGlobal('fetch', this.fetch)
    return this
  }
}

function matches(pattern: string | RegExp, path: string): boolean {
  return typeof pattern === 'string' ? pattern === path : pattern.test(path)
}
