import { useEffect, useState } from 'react'
import { fallbackDictionary, loadTagDictionary } from './tagNames'
import type { TagDictionary } from './tagNames'

/** Словарь тегов подгружается лениво; до загрузки теги показываются как `(gggg,eeee)`. */
export function useTagDictionary(): TagDictionary {
  const [dictionary, setDictionary] = useState<TagDictionary>(fallbackDictionary)
  useEffect(() => {
    let alive = true
    void loadTagDictionary().then((loaded) => {
      if (alive) setDictionary(loaded)
    })
    return () => {
      alive = false
    }
  }, [])
  return dictionary
}
