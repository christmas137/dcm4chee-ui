/**
 * Что человек перетащил или выбрал: файлы, папки целиком (с вложенными), ZIP — как файл.
 * Папки при перетаскивании доступны только через File System Entry API; браузер отдаёт
 * их содержимое порциями, поэтому `readEntries` вызывается, пока не вернёт пустоту.
 */
import type { Picked } from './scan'

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

function readAll(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []
    const next = () => reader.readEntries((entries) => {
      if (!entries.length) return resolve(all)
      all.push(...entries)
      next()
    }, reject)
    next()
  })
}

async function walk(entry: FileSystemEntry, prefix: string): Promise<Picked[]> {
  const path = `${prefix}${entry.name}`
  if (entry.isFile) return [{ file: await fileOf(entry as FileSystemFileEntry), path }]
  if (!entry.isDirectory) return []
  const children = await readAll((entry as FileSystemDirectoryEntry).createReader())
  const nested = await Promise.all(children.map((child) => walk(child, `${path}/`)))
  return nested.flat()
}

export async function pickedFromDrop(data: DataTransfer): Promise<Picked[]> {
  const entries = [...(data.items ?? [])]
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry))
  if (entries.length) return (await Promise.all(entries.map((entry) => walk(entry, '')))).flat()
  return pickedFromList(data.files)
}

/** Из `<input type=file>`: у выбранной папки браузер кладёт путь в `webkitRelativePath`. */
export function pickedFromList(list: FileList | null): Picked[] {
  return [...(list ?? [])].map((file) => ({ file, path: file.webkitRelativePath || file.name }))
}
