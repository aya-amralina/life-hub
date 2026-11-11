import { ERFOLG_TYPE, WORK_ACTIVE, WORK_STALLED, WORK_STATUSES, type WorkStatus } from '../constants'
import { addDaysISO, daysBetween, todayBerlin, type ISODate } from '../dates'
import { isItemOpen, isUpcoming, type ItemLike } from './items'

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

export type BoardItem = WorkItemLike & ItemLike & { type: string | null; area: string | null; outcome?: string | null }
export type BoardGroupKey = 'In Arbeit' | 'Im Review' | 'Offen' | 'soon' | 'stalled' | 'Erledigt'
export type BoardGroup<T> = { key: BoardGroupKey; items: T[] }

/** Erfolg = a recorded success (type «Erfolg») or a done task with «что это дало» filled in. */
export function isErfolg(i: Pick<BoardItem, 'type' | 'status' | 'done_at' | 'outcome'>): boolean {
  if (i.type === ERFOLG_TYPE) return true
  return (i.status === 'Erledigt' || i.done_at !== null) && Boolean(i.outcome?.trim())
}

/**
 * Board on the phone (design 3b): In Arbeit · Im Review · Offen · «Скоро» (starts later, rule 16) ·
 * «Стоит» (Wartet auf Antwort, Blockiert, Geparkt) · Erledigt of the last 7 days. Verworfen and older
 * Erledigt live in «Архив»; recorded Erfolge are not tasks and stay off the board. Empty groups are dropped.
 */
export function boardGroups<T extends BoardItem>(items: readonly T[], today: ISODate): BoardGroup<T>[] {
  const weekAgo = addDaysISO(today, -6)
  const tasks = items.filter((i) => i.type !== ERFOLG_TYPE)
  const open = tasks.filter((i) => isItemOpen(i))
  const now = open.filter((i) => !isUpcoming(i, today))
  const groups: BoardGroup<T>[] = [
    { key: 'In Arbeit', items: now.filter((i) => i.status === 'In Arbeit') },
    { key: 'Im Review', items: now.filter((i) => i.status === 'Im Review') },
    { key: 'Offen', items: now.filter((i) => (i.status ?? 'Offen') === 'Offen') },
    { key: 'soon', items: open.filter((i) => isUpcoming(i, today)).sort((a, b) => a.starts_on!.localeCompare(b.starts_on!)) },
    { key: 'stalled', items: now.filter((i) => isWorkStalled(i.status)) },
    {
      key: 'Erledigt',
      items: tasks
        .filter((i) => i.status === 'Erledigt' && i.done_at !== null && todayBerlin(new Date(i.done_at)) >= weekAgo)
        .sort((a, b) => b.done_at!.localeCompare(a.done_at!)),
    },
  ]
  return groups.filter((g) => g.items.length > 0)
}

/** Friday review: open tasks one by one, least recently updated first. */
export function fridayQueue<T extends BoardItem>(items: readonly T[]): T[] {
  return items.filter((i) => i.type !== ERFOLG_TYPE && isItemOpen(i)).sort((a, b) => a.updated_at.localeCompare(b.updated_at))
}
