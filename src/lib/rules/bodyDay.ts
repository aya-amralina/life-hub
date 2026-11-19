import { addDaysISO, weekStart, type ISODate } from '../dates'
import { backToBack, nextInQueue, weekTarget, type QueueLike } from './workouts'

/**
 * «Тело → Сегодня» (step 3): the day in three blocks by the habit's time of day, the week line in the header, the next
 * strength session of the queue.
 */
export type Block = 'morning' | 'day' | 'evening'

/** Утро / День / Вечер by `habits.time_of_day`; «любое» goes to the day. */
export function blockOf(timeOfDay: string | null | undefined): Block {
  return timeOfDay === 'morning' ? 'morning' : timeOfDay === 'evening' ? 'evening' : 'day'
}

export const BLOCK_TITLE: Record<Block, string> = { morning: 'Утро', day: 'День', evening: 'Вечер' }

/** A block folds into «Утро ✓» when everything in it is done (an empty block never folds). */
export function blockFolded(done: number, total: number): boolean {
  return total > 0 && done >= total
}

/** Distinct days with strength sets in the Mon–Sun week of the day. */
export function strengthDays(dates: readonly ISODate[], date: ISODate): ISODate[] {
  const monday = weekStart(date)
  const sunday = addDaysISO(monday, 6)
  return [...new Set(dates.filter((d) => d >= monday && d <= sunday))].sort()
}

/** «Силовые 1 из 2, кор 3 из 7» — the strength target from the queue; parts without a target are left out. */
export function weekLine(strength: { done: number; target: number }, core: { done: number; of: number } | null): string {
  const parts = [strength.target > 0 ? `Силовые ${strength.done} из ${strength.target}` : null, core && core.of > 0 ? `кор ${core.done} из ${core.of}` : null].filter(Boolean)
  const s = parts.join(', ')
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}

export type StrengthCard<Q> =
  | { kind: 'next'; slot: Q; afterYesterday: boolean } // the next in the queue; a soft note if yesterday had one
  | { kind: 'done' } // a session today
  | null // the week is full, or «Не сегодня» hid it for today

/**
 * The card of the next strength session: a session today — «done»; hidden by «Не сегодня» today — nothing (it stays
 * the next one tomorrow); the week full — nothing; otherwise the next place of the queue.
 */
export function strengthCard<Q extends QueueLike>(queue: readonly Q[], dates: readonly ISODate[], date: ISODate, skippedOn: ISODate | null): StrengthCard<Q> {
  if (dates.includes(date)) return { kind: 'done' }
  if (skippedOn === date) return null
  const slot = nextInQueue(queue, dates, date)
  return slot ? { kind: 'next', slot, afterYesterday: backToBack(dates, date) } : null
}

/** The strength part of the week line. */
export function strengthWeek(queue: readonly QueueLike[], dates: readonly ISODate[], date: ISODate) {
  return { done: strengthDays(dates, date).length, target: weekTarget(queue, date) }
}

/** «Низ A» / «Верх B» — a short title of a template. */
export function templateTitle(t: { focus: string; code: string }): string {
  return `${t.focus === 'upper' ? 'Верх' : 'Низ'} ${t.code}`
}
