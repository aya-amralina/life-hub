import type { ISODate } from '../dates'
import { formatHours, toCents } from '../format'
import { isFact, isWeekRow, type TxLike } from './money'

/** The evening starts at 18:00 Berlin: «Вечер» opens and moves up on «Сегодня», mood can be marked. */
export const EVENING_FROM = 18
export function isEvening(hour: number): boolean {
  return hour >= EVENING_FROM
}

export type EveningLog = { energy: number | null; mood: number | null; slump: boolean | null; coffee_cups: number | null }

/** «Вечер»: how many of its four questions are answered. */
export function eveningAnswered(log: EveningLog | null | undefined): { answered: number; total: number } {
  const values = log ? [log.energy, log.mood, log.slump, log.coffee_cups] : []
  return { answered: values.filter((v) => v !== null && v !== undefined).length, total: 4 }
}

/** The latest answer before the day («как вчера»: sleep, coffee) — looks back over the given logs; null if none. */
export function lastBefore<L extends { date: ISODate }, V>(logs: readonly L[], date: ISODate, pick: (l: L) => V | null | undefined): V | null {
  let best: L | null = null
  for (const l of logs) {
    if (l.date >= date || pick(l) == null) continue
    if (!best || l.date > best.date) best = l
  }
  return best ? (pick(best) as V) : null
}

export const SLEEP_MIN = 0
export const SLEEP_MAX = 16
export const SLEEP_DEFAULT = 7.5

/** Sleep stepper: half-hour steps within 0 … 16 h; from nothing it starts at the last night's value (else 7,5). */
export function stepSleep(current: number | null, dir: 1 | -1, last: number | null): number {
  if (current === null) return last ?? SLEEP_DEFAULT
  return Math.min(SLEEP_MAX, Math.max(SLEEP_MIN, Math.round((current + dir * 0.5) * 2) / 2))
}

/** «Сегодня потрачено»: fact expenses of the day (week rows are not a purchase). Cents. */
export function spentOn(txs: readonly TxLike[], date: ISODate): number {
  return txs.filter((t) => t.kind === 'expense' && !isWeekRow(t) && isFact(t) && t.date === date).reduce((s, t) => s + toCents(t.amount_eur), 0)
}

/** The week's study plan in plain words (for «Сегодня»; the numbers of rule 7 stay on «Учёба»). */
export function loadPhrase(load: { hours: number; base: number; max: number; status: 'ok' | 'tight' | 'over' }): string {
  if (load.status === 'ok') return `План ${formatHours(load.hours)} из ${formatHours(load.base)} возможных — спокойная неделя`
  if (load.status === 'tight') return `План ${formatHours(load.hours)} — больше базы ${formatHours(load.base)}, нужен Do/Sa ½`
  return `План ${formatHours(load.hours)} — перегруз, максимум ${formatHours(load.max)}`
}
