/**
 * Работа со значениями конфигурации по пути. Пути смешанные: ключи объектов и индексы списков
 * (`['dicomNetworkAE', 0, 'dcmNetworkAE']`). Исходные объекты не меняются — всегда копия.
 *
 * «Не задано» в dcm4chee означает «действует значение по умолчанию», поэтому пустое значение
 * не записывается пустой строкой, а убирает ключ: архив удалит атрибут из LDAP.
 */
import type { Path } from './model'

type Container = Record<string, unknown> | unknown[]

export function getIn(root: unknown, path: Path): unknown {
  let node = root
  for (const key of path) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string | number, unknown>)[key]
  }
  return node
}

export function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

/** Копия `root`, где по пути лежит `value`; пустое значение удаляет ключ. */
export function setIn<T>(root: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T
  const [head, ...rest] = path
  const source: Container = Array.isArray(root)
    ? root
    : root && typeof root === 'object' ? (root as Record<string, unknown>) : typeof head === 'number' ? [] : {}
  const current = (source as Record<string | number, unknown>)[head]
  const next = rest.length ? setIn(current, rest, value) : value

  if (Array.isArray(source)) {
    const copy = [...source]
    copy[head as number] = next
    return copy as T
  }
  const copy: Record<string, unknown> = { ...source }
  if (rest.length === 0 && isEmptyValue(next)) delete copy[head]
  else copy[head] = next
  return copy as T
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (isEmptyValue(a) && isEmptyValue(b)) return true
  return JSON.stringify(a) === JSON.stringify(b)
}
