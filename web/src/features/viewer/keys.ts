/** Горячие клавиши вьюера — как на рабочих станциях: одна буква на инструмент. */
import type { ToolName } from './engine'

export type ViewerCommand =
  | { type: 'tool'; tool: ToolName }
  | { type: 'scroll'; delta: number }
  | { type: 'jump'; to: 'first' | 'last' }
  | { type: 'invert' }
  | { type: 'reset' }
  | { type: 'preset'; key: string }
  | { type: 'close' }

const TOOLS: Record<string, ToolName> = { w: 'windowLevel', p: 'pan', z: 'zoom', l: 'length', a: 'angle' }

export function keyToCommand(key: string): ViewerCommand | undefined {
  const lower = key.length === 1 ? key.toLowerCase() : key
  if (lower in TOOLS) return { type: 'tool', tool: TOOLS[lower] }
  switch (key) {
    case 'ArrowDown': case 'ArrowRight': case 'j': return { type: 'scroll', delta: 1 }
    case 'ArrowUp': case 'ArrowLeft': case 'k': return { type: 'scroll', delta: -1 }
    case 'PageDown': return { type: 'scroll', delta: 10 }
    case 'PageUp': return { type: 'scroll', delta: -10 }
    case 'Home': return { type: 'jump', to: 'first' }
    case 'End': return { type: 'jump', to: 'last' }
    case 'i': case 'I': return { type: 'invert' }
    case 'r': case 'R': return { type: 'reset' }
    case 'Escape': return { type: 'close' }
  }
  if (/^[1-9]$/.test(key)) return { type: 'preset', key }
  return undefined
}
