/**
 * Перевод схем. Падение «нет перевода» после `update-schemas.sh` — штатное: в новой версии
 * архива появились поля, их нужно перевести (файл ru.json, ключ — английский текст схемы).
 */
import { describe, expect, it } from 'vitest'
import ru from './ru.json'
import { enumOptions, getSchema } from './model'

const files = import.meta.glob<{ default: unknown }>('./dcm4chee/*.schema.json', { eager: true })
const names = Object.keys(files).map((path) => path.slice(path.lastIndexOf('/') + 1))

function allTexts() {
  const titles = new Set<string>()
  const descriptions = new Set<string>()
  const options = new Set<string>()
  for (const name of names) {
    const schema = getSchema(name)
    titles.add(schema.title)
    descriptions.add(schema.description)
    for (const prop of Object.values(schema.properties)) {
      titles.add(prop.title)
      descriptions.add(prop.description)
      for (const option of enumOptions(prop.enum ?? prop.items?.enum)) {
        if (option.description) options.add(option.description)
      }
    }
  }
  return { titles, descriptions, options }
}

describe('перевод схем', () => {
  const texts = allTexts()
  const dict = ru as Record<'titles' | 'descriptions' | 'options', Record<string, string>>

  it.each(['titles', 'descriptions', 'options'] as const)('у каждого текста схемы есть перевод: %s', (kind) => {
    const missing = [...texts[kind]].filter((text) => text && !(text in dict[kind]))
    expect(missing).toEqual([])
  })

  it('перевод сохраняет теги DICOM, плейсхолдеры, форматы и ссылки', () => {
    const patterns = [
      /\([0-9A-Fx]{4},[0-9A-Fx]{4}\)/g, // (0010,0020)
      /\{[0-9A-F]{8}[^}]*\}/g, // {0020000D,hash}
      /\$\{[^}]+\}/g, // ${jboss.server.data.dir}
      /href="[^"]+"/g,
    ]
    const broken: string[] = []
    for (const [en, translated] of Object.entries(dict.descriptions)) {
      for (const pattern of patterns) {
        const before = [...new Set(en.match(pattern) ?? [])].sort()
        const after = [...new Set(translated.match(pattern) ?? [])].sort()
        if (before.join() !== after.join()) broken.push(`${pattern}: ${en.slice(0, 60)}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('в переводе нет лишних строк от старых версий схем', () => {
    const stale = (['titles', 'descriptions', 'options'] as const)
      .flatMap((kind) => Object.keys(dict[kind]).filter((text) => !texts[kind].has(text)))
    expect(stale).toEqual([])
  })
})
