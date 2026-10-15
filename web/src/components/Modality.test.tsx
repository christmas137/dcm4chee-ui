import { describe, expect, it } from 'vitest'
import { modalityColor } from './Modality'

describe('цвет модальности', () => {
  it('рентген-семейство делит один цвет', () => {
    expect(modalityColor('CR')).toBe(modalityColor('DX'))
    expect(modalityColor('CR')).toBe('var(--color-mod-xr)')
  })

  it('регистр не важен, неизвестное — нейтральным', () => {
    expect(modalityColor('ct')).toBe('var(--color-mod-ct)')
    expect(modalityColor('SR')).toBe('var(--color-mod-doc)')
    expect(modalityColor('ZZ')).toBe('var(--color-mod-doc)')
  })
})
