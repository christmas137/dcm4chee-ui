import { describe, expect, it } from 'vitest'
import { formatVoi, presetsFor } from './voi'

describe('пресеты окна', () => {
  it('для КТ — стандартные окна с клавишами 1–5', () => {
    expect(presetsFor('CT').map((p) => [p.label, p.width, p.center, p.key])).toEqual([
      ['Мягкие ткани', 400, 40, '1'],
      ['Лёгкие', 1500, -600, '2'],
      ['Кости', 2000, 300, '3'],
      ['Мозг', 80, 40, '4'],
      ['Печень', 150, 60, '5'],
    ])
  })

  it('для остальных модальностей шкала не абсолютная — пресетов нет', () => {
    expect(presetsFor('MR')).toEqual([])
    expect(presetsFor(undefined)).toEqual([])
  })

  it('подпись окна округляется', () => {
    expect(formatVoi(400.4, 39.6)).toBe('Окно 400   Уровень 40')
    expect(formatVoi(undefined, 40)).toBe('')
  })
})
