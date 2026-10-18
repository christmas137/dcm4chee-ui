/** Время событий для людей: недавнее — относительно, сегодняшнее — часами, остальное — датой. */

const pad = (n: number) => String(n).padStart(2, '0')

export function formatMoment(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000)
  if (seconds >= 0 && seconds < 45) return 'только что'
  if (seconds >= 0 && seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} мин назад`
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) return `сегодня ${clock}`
  const sameYear = date.getFullYear() === now.getFullYear()
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}${sameYear ? '' : `.${date.getFullYear()}`} ${clock}`
}

/** Полная дата и время — для подсказки и подробностей. */
export function formatFull(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** Начало периода «за последние N дней» (включая сегодня) в формате DICOM DA. */
export function daysAgoDA(days: number, now: Date = new Date()): string {
  const date = new Date(now)
  date.setDate(date.getDate() - days)
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}
