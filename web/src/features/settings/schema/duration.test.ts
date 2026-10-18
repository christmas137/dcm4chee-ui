import { describe, expect, it } from 'vitest'
import { describeDuration, describePeriod } from './duration'

describe('длительность ISO-8601', () => {
  it.each([
    ['PT1H', '1 ч'],
    ['PT1H30M', '1 ч 30 мин'],
    ['PT30S', '30 с'],
    ['PT0.5S', '0,5 с'],
    ['P1D', '1 дн'],
    ['P2DT3H', '2 дн 3 ч'],
    ['pt5m', '5 мин'],
    ['PT0S', '0'],
  ])('%s → %s', (value, human) => {
    expect(describeDuration(value)).toBe(human)
  })

  it.each(['', 'P', 'PT', '1H', 'PT1X', 'P1Y', 'час'])('«%s» — не длительность', (value) => {
    expect(describeDuration(value)).toBeNull()
  })
})

describe('период ISO-8601', () => {
  it.each([
    ['P1Y', '1 г'],
    ['P6M', '6 мес'],
    ['P2W', '2 нед'],
    ['P1Y6M', '1 г 6 мес'],
    ['P30D', '30 дн'],
  ])('%s → %s', (value, human) => {
    expect(describePeriod(value)).toBe(human)
  })

  it.each(['', 'P', 'PT1H', '1Y'])('«%s» — не период', (value) => {
    expect(describePeriod(value)).toBeNull()
  })
})
