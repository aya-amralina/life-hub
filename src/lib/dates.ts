import { addDays, differenceInCalendarDays, format, startOfWeek } from 'date-fns'
import { ru } from 'date-fns/locale'

/** ISO calendar date 'YYYY-MM-DD'. All app dates are plain dates in Europe/Berlin. */
export type ISODate = string

export const TIME_ZONE = 'Europe/Berlin'

const berlinDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const berlinHourFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  hourCycle: 'h23',
})

/** Today's date in Berlin, regardless of the device time zone. */
export function todayBerlin(now: Date = new Date()): ISODate {
  return berlinDateFormat.format(now)
}

/** Current hour (0–23) in Berlin. */
export function hourBerlin(now: Date = new Date()): number {
  return Number(berlinHourFormat.format(now))
}

/** Parse 'YYYY-MM-DD' into a local-midnight Date for date-fns arithmetic. */
export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) throw new Error(`Invalid ISO date: ${iso}`)
  return new Date(y, m - 1, d)
}

export function toISODate(date: Date): ISODate {
  return format(date, 'yyyy-MM-dd')
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  return toISODate(addDays(parseISODate(iso), days))
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return differenceInCalendarDays(parseISODate(to), parseISODate(from))
}

/** Monday of the week (Mon–Sun) containing the date. */
export function weekStart(iso: ISODate): ISODate {
  return toISODate(startOfWeek(parseISODate(iso), { weekStartsOn: 1 }))
}

export function weekEnd(iso: ISODate): ISODate {
  return addDaysISO(weekStart(iso), 6)
}

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const

/** 'Пн' … 'Вс' */
export function weekdayShort(iso: ISODate): string {
  return WEEKDAYS[parseISODate(iso).getDay()]!
}

/** '7.11', '10.12' — day without leading zero, two-digit month. */
export function formatDayMonth(iso: ISODate): string {
  return format(parseISODate(iso), 'd.MM')
}

/** '9 ноября' */
export function formatLongDate(iso: ISODate): string {
  return format(parseISODate(iso), 'd MMMM', { locale: ru })
}

/** Meta-line label: 'сегодня', 'завтра', 'вчера' or 'чт, 12.11'. */
export function formatRelativeDay(iso: ISODate, today: ISODate): string {
  const diff = daysBetween(today, iso)
  if (diff === 0) return 'сегодня'
  if (diff === 1) return 'завтра'
  if (diff === -1) return 'вчера'
  return `${weekdayShort(iso).toLowerCase()}, ${formatDayMonth(iso)}`
}

const berlinTimeFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })

/** '18:40' for a timestamp, in Berlin time. */
export function formatTimeBerlin(timestamp: string | Date): string {
  return berlinTimeFormat.format(new Date(timestamp))
}
