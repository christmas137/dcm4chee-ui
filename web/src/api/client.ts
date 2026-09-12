/** HTTP-слой к REST API архива. Один вход для всех запросов: ошибки, заголовки, авторизация. */

export const ARCHIVE_BASE: string = import.meta.env.VITE_ARC_URL ?? '/dcm4chee-arc'

export type ParamValue = string | number | boolean | undefined | null
export type Params = Record<string, ParamValue | ParamValue[]>

export class ApiError extends Error {
  readonly status: number
  readonly url: string
  readonly body: string

  constructor(status: number, url: string, body: string) {
    super(`HTTP ${status} ${url}${body ? ` — ${body.slice(0, 300)}` : ''}`)
    this.name = 'ApiError'
    this.status = status
    this.url = url
    this.body = body
  }
}

/**
 * Bearer-токен для secure-инстанса (Keycloak). Пока стенд без авторизации,
 * но точка расширения нужна здесь, а не в каждом запросе.
 */
let authToken: string | null = null
export function setAuthToken(token: string | null): void {
  authToken = token
}

export function buildQuery(params: Params = {}): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const list = Array.isArray(value) ? value : [value]
    for (const item of list) {
      if (item === undefined || item === null || item === '') continue
      sp.append(key, String(item))
    }
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

export function url(path: string, params?: Params): string {
  return `${ARCHIVE_BASE}${path}${buildQuery(params)}`
}

export interface ApiResponse<T> {
  data: T
  /** Архив кладёт в `Warning` причину неполного ответа (например, недоступный внешний AE). */
  warning?: string
}

export async function apiFetch(
  path: string,
  { params, ...init }: RequestInit & { params?: Params } = {},
): Promise<Response> {
  const headers = new Headers(init.headers)
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`)

  const target = url(path, params)
  const res = await fetch(target, { ...init, headers })
  if (!res.ok) {
    throw new ApiError(res.status, target, await res.text().catch(() => ''))
  }
  return res
}

/**
 * GET, возвращающий JSON. QIDO-RS отвечает `204 No Content` на пустой результат —
 * отдаём в этом случае `[]`, иначе каждый вызывающий будет городить свою проверку.
 */
export async function getJsonFull<T>(path: string, params?: Params): Promise<ApiResponse<T>> {
  const res = await apiFetch(path, { params, headers: { Accept: 'application/dicom+json, application/json' } })
  const warning = res.headers.get('Warning') ?? undefined
  if (res.status === 204) return { data: [] as unknown as T, warning }
  return { data: (await res.json()) as T, warning }
}

export async function getJson<T>(path: string, params?: Params): Promise<T> {
  return (await getJsonFull<T>(path, params)).data
}
