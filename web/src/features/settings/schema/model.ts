/**
 * Схемы конфигурации dcm4chee — те же JSON, по которым штатный UI строит свои формы.
 *
 * Каждая схема описывает один вид объекта конфигурации (устройство, AE, хранилище, правило…):
 * поля, их типы, значения по умолчанию, допустимые варианты и «формат» — подсказку, на что
 * поле ссылается (AE-титл, ID хранилища, очередь, длительность…). Вложенные объекты
 * подключаются `$ref` на другую схему: расширение (`dcmDevice` → `dcmArchiveDevice`)
 * или список дочерних записей (`dcmStorage[]`, `dcmExportRule[]`).
 *
 * Схемы лежат в `./dcm4chee/` как есть, обновляются скриптом `web/scripts/update-schemas.sh`.
 */

export interface ItemSchema {
  type?: string
  enum?: (string | number)[]
  format?: string
  $ref?: string
}

export interface PropSchema {
  title: string
  description: string
  type?: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object'
  format?: string
  enum?: (string | number)[]
  default?: unknown
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  pattern?: string
  maxLength?: number
  items?: ItemSchema
  $ref?: string
  /** Подпись дочерней записи в списке: `{cn}`, `{dicomHostname}:{dicomPort}`. */
  titleKey?: string
  order?: number
  /** Где на этот идентификатор ссылаются (JSONPath) — для переименования. */
  use?: string[]
}

export interface ObjectSchema {
  title: string
  description: string
  type: 'object'
  required?: string[]
  properties: Record<string, PropSchema>
  groups?: Record<string, string[]>
}

const files = import.meta.glob<ObjectSchema>('./dcm4chee/*.schema.json', { eager: true, import: 'default' })

const byName = new Map<string, ObjectSchema>(
  Object.entries(files).map(([path, schema]) => [path.slice(path.lastIndexOf('/') + 1), schema]),
)

export function hasSchema(ref: string): boolean {
  return byName.has(ref)
}

export function getSchema(ref: string): ObjectSchema {
  const schema = byName.get(ref)
  if (!schema) throw new Error(`Нет схемы ${ref}`)
  return schema
}

export interface EnumOption {
  value: string | number
  /** Пояснение из схемы: в штатных схемах оно приклеено к значению через `|`. */
  description?: string
}

export function enumOptions(values: (string | number)[] | undefined): EnumOption[] {
  return (values ?? []).map((raw) => {
    if (typeof raw !== 'string') return { value: raw }
    const bar = raw.indexOf('|')
    return bar < 0 ? { value: raw } : { value: raw.slice(0, bar), description: raw.slice(bar + 1) }
  })
}

/**
 * Что за поле и чем его править. Решение принимается один раз по схеме,
 * дальше форма просто рисует нужный виджет.
 */
export type FieldKind =
  | { kind: 'boolean' }
  | { kind: 'number'; integer: boolean }
  | { kind: 'text'; format?: string }
  | { kind: 'enum'; options: EnumOption[] }
  | { kind: 'texts'; format?: string }
  | { kind: 'enums'; options: EnumOption[] }
  /** Вложенный объект-расширение: его поля показываются в той же форме своей группой. */
  | { kind: 'object'; ref: string }
  /** Список дочерних записей со своей схемой: открывается отдельным уровнем. */
  | { kind: 'list'; ref: string; titleKey?: string }

export function fieldKind(prop: PropSchema): FieldKind {
  if (prop.$ref) return { kind: 'object', ref: prop.$ref }
  if (prop.type === 'array') {
    const items = prop.items ?? {}
    if (items.$ref) return { kind: 'list', ref: items.$ref, titleKey: prop.titleKey }
    if (items.enum) return { kind: 'enums', options: enumOptions(items.enum) }
    return { kind: 'texts', format: prop.format ?? items.format }
  }
  if (prop.enum) return { kind: 'enum', options: enumOptions(prop.enum) }
  if (prop.type === 'boolean') return { kind: 'boolean' }
  if (prop.type === 'integer' || prop.type === 'number') return { kind: 'number', integer: prop.type === 'integer' }
  return { kind: 'text', format: prop.format }
}

export type Path = (string | number)[]

export interface FieldInfo {
  /** Путь от корня редактируемого объекта: `['dcmNetworkAE', 'dcmArchiveNetworkAE', 'dcmOverwritePolicy']`. */
  path: Path
  key: string
  prop: PropSchema
  kind: FieldKind
  /** Схема, где объявлено поле, — для перевода описаний и поиска. */
  schema: string
  /** Цепочка вложенных расширений, через которые поле достигнуто (схемы). */
  via: string[]
  required: boolean
}

/**
 * Все поля объекта, включая поля вложенных расширений: AE показывает в одной форме
 * и свои поля, и `dcmNetworkAE`, и `dcmArchiveNetworkAE`. Списки дочерних записей
 * возвращаются отдельно — они открываются своим уровнем.
 * `skip` — схемы расширений, которые здесь не разворачивать (у них свой экран).
 */
export function collectFields(
  ref: string,
  { skip = [] as string[], base = [] as Path, via = [] as string[] } = {},
): { fields: FieldInfo[]; lists: FieldInfo[] } {
  const schema = getSchema(ref)
  const required = new Set(schema.required ?? [])
  const fields: FieldInfo[] = []
  const lists: FieldInfo[] = []
  const nested: FieldInfo[] = []
  for (const [key, prop] of orderedProps(schema)) {
    const kind = fieldKind(prop)
    const info: FieldInfo = { path: [...base, key], key, prop, kind, schema: ref, via, required: required.has(key) }
    if (kind.kind === 'list') lists.push(info)
    else if (kind.kind === 'object') nested.push(info)
    else fields.push(info)
  }
  // Расширения — после собственных полей: сначала то, что про сам объект, потом специфика dcm4chee.
  for (const info of nested) {
    if (info.kind.kind !== 'object' || skip.includes(info.kind.ref) || !hasSchema(info.kind.ref)) continue
    const inner = collectFields(info.kind.ref, { skip, base: info.path, via: [...via, info.kind.ref] })
    fields.push(...inner.fields)
    lists.push(...inner.lists)
  }
  return { fields, lists }
}

/**
 * Ключи значения, которых нет в схеме: поле из более новой версии архива или ручная правка.
 * Форма их не знает, но прятать нельзя — показываем отдельным блоком.
 */
export function unknownKeys(ref: string, value: unknown, { skip = [] as string[], base = [] as Path } = {}): Path[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const { properties } = getSchema(ref)
  const result: Path[] = []
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    const prop = properties[key]
    if (!prop) {
      result.push([...base, key])
    } else if (prop.$ref && hasSchema(prop.$ref) && !skip.includes(prop.$ref)) {
      result.push(...unknownKeys(prop.$ref, inner, { skip, base: [...base, key] }))
    }
  }
  return result
}

/** Порядок полей: явный `order`, затем как в схеме — авторы схем кладут важное выше. */
function orderedProps(schema: ObjectSchema): [string, PropSchema][] {
  const entries = Object.entries(schema.properties)
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry[1].order ?? Infinity) - (b.entry[1].order ?? Infinity) || a.index - b.index)
    .map(({ entry }) => entry)
}

/** Подпись записи по `titleKey` схемы: `{dicomHostname}:{dicomPort} {cn}`. */
export function formatTitleKey(template: string | undefined, item: Record<string, unknown>): string {
  if (!template) return ''
  return template
    .replace(/\{([^}]+)\}/g, (_, key: string) => {
      const value = item[key]
      if (value === undefined || value === null) return ''
      return Array.isArray(value) ? value.join(', ') : String(value)
    })
    .replace(/\(\s*\)/g, '')
    .replace(/^[\s:]+|[\s:]+$/g, '')
    .trim()
}

/** Подпись записи: по шаблону схемы, иначе первое осмысленное поле. */
export function itemTitle(item: Record<string, unknown>, titleKey: string | undefined): string {
  const byTemplate = formatTitleKey(titleKey, item)
  if (byTemplate) return byTemplate
  for (const key of ['cn', 'dicomDescription', 'dcmURI']) {
    if (typeof item[key] === 'string' && item[key]) return item[key]
  }
  return '(без названия)'
}
