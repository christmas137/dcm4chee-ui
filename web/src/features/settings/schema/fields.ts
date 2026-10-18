/** Чистая логика формы: группы, поиск, отметки «задано/изменено», проблемы заполнения. */
import { trDescription, trTitle } from './i18n'
import { getSchema } from './model'
import type { FieldInfo, Path } from './model'
import { THEMES, themeOf } from './themes'
import { getIn, isEmptyValue, sameValue } from './values'

/** Расширения архива, чьи поля раскладываются по темам, а не одной группой. */
const THEMED = new Set(['archiveDevice.schema.json', 'archiveNetworkAE.schema.json', 'archiveHL7Application.schema.json'])

export interface Group {
  id: string
  label: string
  order: number
}

/**
 * Группа поля: собственные поля объекта — «Основное», поля расширения — по названию расширения,
 * поля расширений архива — по темам («Приём объектов», «Выдача»…).
 */
export function groupOf(field: FieldInfo): Group {
  const depth = field.via.length * 100
  if (THEMED.has(field.schema)) {
    const theme = themeOf(field.key)
    const index = THEMES.findIndex((item) => item.id === theme)
    // Внутри формы AE поля архива идут после своих — с пометкой, чьи они.
    const prefix = depth ? `${trTitle(getSchema(field.schema).title)} · ` : ''
    return { id: `${field.schema}#${theme}`, label: `${prefix}${THEMES[index].label}`, order: depth + 1 + index }
  }
  if (depth === 0) return { id: 'main', label: 'Основное', order: 0 }
  return { id: field.schema, label: trTitle(getSchema(field.schema).title), order: depth }
}

export function fieldTitle(field: FieldInfo): string {
  return trTitle(field.prop.title)
}

/** Поиск по всему, что человек может помнить: русское и английское название, ключ, описание. */
export function matchesQuery(field: FieldInfo, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = [
    field.key, field.prop.title, trTitle(field.prop.title), trDescription(field.prop.description),
  ].join('\n').toLowerCase()
  return needle.split(/\s+/).every((word) => haystack.includes(word))
}

export type FieldState = 'default' | 'set' | 'changed'

export function fieldState(field: FieldInfo, root: unknown, original: unknown, base: Path = []): FieldState {
  const path = [...base, ...field.path]
  const value = getIn(root, path)
  if (original !== undefined && !sameValue(value, getIn(original, path))) return 'changed'
  return isEmptyValue(value) ? 'default' : 'set'
}

/** Обязательное поле без значения и без умолчания — архив такую запись не примет. */
export function fieldProblem(field: FieldInfo, value: unknown): string | null {
  if (field.required && isEmptyValue(value) && field.prop.default === undefined && field.kind.kind !== 'boolean') {
    return 'обязательное поле'
  }
  return null
}

/** Незаполненные обязательные поля записи — для пометки в списках. */
export function missingRequired(fields: FieldInfo[], item: unknown): FieldInfo[] {
  return fields.filter((field) => fieldProblem(field, getIn(item, field.path)) !== null)
}

/** Форматы, значения которых — идентификаторы: их пишем моноширинным. */
const MONO_FORMATS = new Set([
  'dcmTag', 'dcmAETitle', 'dcmArchiveAETitle', 'dcmTransferSyntax', 'dcmSOPClass', 'dcmDuration', 'dcmPeriod',
  'dcmSchedule', 'dcmStorageID', 'dcmQueueName', 'dcmExporterID', 'dicomDeviceName', 'dcmCharset', 'hl7Charset',
])

export function isMonoFormat(format: string | undefined): boolean {
  return Boolean(format && MONO_FORMATS.has(format))
}
