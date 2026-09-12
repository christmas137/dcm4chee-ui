/**
 * Человекообразные имена DICOM-тегов. Словарь берём из dcmjs (8004 тега), но он весит 1.3 МБ,
 * поэтому грузим динамически — только там, где реально показываем метаданные.
 */
import { tagToGroupElement } from './dicom'

export interface TagDictionary {
  name(tag: string): string
  vr(tag: string): string | undefined
}

/** Пока словарь не загружен — показываем тег как `(gggg,eeee)`, а не пустоту. */
export const fallbackDictionary: TagDictionary = {
  name: tagToGroupElement,
  vr: () => undefined,
}

let pending: Promise<TagDictionary> | null = null

export function loadTagDictionary(): Promise<TagDictionary> {
  pending ??= import('dcmjs/dictionary').then(({ dictionary }) => ({
    name: (tag: string) => dictionary[tagToGroupElement(tag)]?.name ?? tagToGroupElement(tag),
    vr: (tag: string) => dictionary[tagToGroupElement(tag)]?.vr,
  }))
  return pending
}
