/**
 * Русские названия и описания полей конфигурации.
 *
 * Перевод хранится по английскому тексту схемы, а не по имени поля: одно и то же поле
 * в разных схемах описано по-разному («для устройства» / «переопределяет для AE»), а при
 * обновлении схем изменённый текст честно останется английским, пока его не переведут.
 */
import ru from './ru.json'

const titles: Record<string, string> = ru.titles
const descriptions: Record<string, string> = ru.descriptions
const options: Record<string, string> = ru.options

export function trTitle(en: string): string {
  return titles[en] ?? en
}

export function trDescription(en: string): string {
  return descriptions[en] ?? en
}

/** Пояснение к варианту значения (`NEVER|Never overwrite…` → русский текст после `|`). */
export function trOption(en: string): string {
  return options[en] ?? en
}

export function hasTitle(en: string): boolean {
  return en in titles
}

export function hasDescription(en: string): boolean {
  return en in descriptions
}

export function hasOption(en: string): boolean {
  return en in options
}
