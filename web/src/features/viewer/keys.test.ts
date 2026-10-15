import { describe, expect, it } from 'vitest'
import { keyToCommand } from './keys'

describe('горячие клавиши вьюера', () => {
  it.each([
    ['w', { type: 'tool', tool: 'windowLevel' }],
    ['W', { type: 'tool', tool: 'windowLevel' }],
    ['p', { type: 'tool', tool: 'pan' }],
    ['z', { type: 'tool', tool: 'zoom' }],
    ['l', { type: 'tool', tool: 'length' }],
    ['a', { type: 'tool', tool: 'angle' }],
    ['ArrowDown', { type: 'scroll', delta: 1 }],
    ['k', { type: 'scroll', delta: -1 }],
    ['PageDown', { type: 'scroll', delta: 10 }],
    ['Home', { type: 'jump', to: 'first' }],
    ['End', { type: 'jump', to: 'last' }],
    ['i', { type: 'invert' }],
    ['r', { type: 'reset' }],
    ['3', { type: 'preset', key: '3' }],
    ['Escape', { type: 'close' }],
  ])('%s', (key, command) => {
    expect(keyToCommand(key)).toEqual(command)
  })

  it('прочие клавиши не перехватываются', () => {
    expect(keyToCommand('q')).toBeUndefined()
    expect(keyToCommand('0')).toBeUndefined()
    expect(keyToCommand('Enter')).toBeUndefined()
  })
})
