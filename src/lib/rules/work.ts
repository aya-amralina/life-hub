import { WORK_ACTIVE, WORK_STALLED, WORK_STATUSES, type WorkStatus } from '../constants'
import { daysBetween, todayBerlin, type ISODate } from '../dates'

export type WorkItemLike = { id: string; status: string | null; waiting_on: string | null; people: string[]; updated_at: string }

export const STATUS_ALT_DAYS = 14

/** Rule 9 «Status alt»: not Erledigt/Verworfen and updated_at older than 14 days → age in days, else null. */
export function statusAltDays(item: Pick<WorkItemLike, 'status' | 'updated_at'>, today: ISODate): number | null {
  if (item.status === 'Erledigt' || item.status === 'Verworfen') return null
  const age = daysBetween(todayBerlin(new Date(item.updated_at)), today)
  return age > STATUS_ALT_DAYS ? age : null
}

const WAITING: readonly string[] = ['Wartet auf Antwort', 'Blockiert']

function mentions(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, 'iu').test(text)
}

export type Nachhaken = { name: string; count: number; days: number }

/**
 * Rule 10 «Bei wem nachhaken»: per person, items in Wartet auf Antwort / Blockiert whose waiting_on
 * mentions the name. `days` = how long the oldest of them has been waiting (since last update).
 * Names come from `people`; before import, from the items' Beteiligte.
 */
export function nachhaken(items: readonly WorkItemLike[], names: readonly string[], today: ISODate): Nachhaken[] {
  const pool = names.length ? names : [...new Set(items.flatMap((i) => i.people))]
  const result: Nachhaken[] = []
  for (const name of pool) {
    const waiting = items.filter((i) => i.status !== null && WAITING.includes(i.status) && i.waiting_on && mentions(i.waiting_on, name))
    if (!waiting.length) continue
    const days = Math.max(...waiting.map((i) => daysBetween(todayBerlin(new Date(i.updated_at)), today)))
    result.push({ name, count: waiting.length, days })
  }
  return result.sort((a, b) => b.count - a.count || b.days - a.days || a.name.localeCompare(b.name))
}

/** Board on the phone: statuses in fixed order, only non-empty groups. */
export function groupByStatus<T extends Pick<WorkItemLike, 'status'>>(items: readonly T[]) {
  return WORK_STATUSES.map((status) => ({ status, items: items.filter((i) => (i.status ?? 'Offen') === status) })).filter(
    (g) => g.items.length > 0,
  )
}

export const isWorkActive = (s: string | null) => WORK_ACTIVE.includes((s ?? 'Offen') as WorkStatus)
export const isWorkStalled = (s: string | null) => s !== null && WORK_STALLED.includes(s as WorkStatus)
