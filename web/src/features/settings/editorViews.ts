/** Вкладки редакторов устройства и AE: частое — формой, всё — по схеме, и сырой JSON на крайний случай. */
export type EditorView = 'main' | 'all' | 'json'

export const EDITOR_VIEWS: { value: EditorView; label: string }[] = [
  { value: 'main', label: 'Основное' },
  { value: 'all', label: 'Все параметры' },
  { value: 'json', label: 'JSON' },
]
