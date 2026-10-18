/**
 * Длительности и периоды в настройках архива.
 *
 * `dcmDuration` — ISO-8601 длительность `PnDTnHnMn.nS` (интервалы опроса, задержки, таймауты);
 * `dcmPeriod` — период `PnYnMnWnD` (сроки хранения, периодичность проверок).
 * В форме показываем рядом с полем, что это значит по-человечески: «PT1H30M» → «1 ч 30 мин».
 */

const DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i
const PERIOD = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/i

function join(parts: [string | undefined, string][]): string {
  return parts
    .filter((part): part is [string, string] => part[0] !== undefined && Number(part[0]) !== 0)
    .map(([count, unit]) => `${count.replace('.', ',')} ${unit}`)
    .join(' ')
}

/** «PT1H30M» → «1 ч 30 мин»; `null` — строка не разбирается как длительность. */
export function describeDuration(value: string): string | null {
  const text = value.trim()
  const match = DURATION.exec(text)
  if (!match || text === 'P' || /T$/i.test(text)) return null
  const [, days, hours, minutes, seconds] = match
  return join([[days, 'дн'], [hours, 'ч'], [minutes, 'мин'], [seconds, 'с']]) || '0'
}

/** «P1Y6M» → «1 г 6 мес»; `null` — строка не разбирается как период. */
export function describePeriod(value: string): string | null {
  const text = value.trim()
  const match = PERIOD.exec(text)
  if (!match || text === 'P') return null
  const [, years, months, weeks, days] = match
  return join([[years, 'г'], [months, 'мес'], [weeks, 'нед'], [days, 'дн']]) || '0'
}
