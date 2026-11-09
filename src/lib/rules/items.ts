import { CLOSED_STATUSES } from '../constants'
import { addDaysISO, todayBerlin, type ISODate } from '../dates'

export type ItemLike = {
  id: string
  done_at: string | null
  status: string | null
  due_date: string | null
  ready_by: string | null
}

/** An item is open until it has done_at or a closing status (Erledigt, Verworfen, готово). */
export function isItemOpen(item: Pick<ItemLike, 'done_at' | 'status'>): boolean {
  return item.done_at === null && !(item.status !== null && CLOSED_STATUSES.includes(item.status))
}

/** The date that drives urgency: «готово к» if set, otherwise the deadline. */
export function targetDate(item: Pick<ItemLike, 'due_date' | 'ready_by'>): ISODate | null {
  return item.ready_by ?? item.due_date
}

export type Burning<T> = { item: T; date: ISODate; overdue: boolean }

export const BURNING_HORIZON_DAYS = 3

/**
 * Rule 11 «Горит»: open items of all spheres where coalesce(ready_by, due_date) ≤ today + 3,
 * overdue ones included (overdue = deadline already passed). Sorted by that date, then title-stable.
 */
export function burning<T extends ItemLike>(items: readonly T[], today: ISODate): Burning<T>[] {
  const horizon = addDaysISO(today, BURNING_HORIZON_DAYS)
  const result: Burning<T>[] = []
  for (const item of items) {
    if (!isItemOpen(item)) continue
    const date = targetDate(item)
    if (date === null || date > horizon) continue
    const overdue = item.due_date !== null && item.due_date < today
    result.push({ item, date, overdue })
  }
  return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** Items closed (done_at) on the given Berlin day — shown checked so a mis-tap can be undone. */
export function completedOn<T extends ItemLike>(items: readonly T[], day: ISODate): T[] {
  return items.filter((i) => i.done_at !== null && todayBerlin(new Date(i.done_at)) === day)
}

/** Earliest upcoming target date among open items after the burning horizon (for the empty state). */
export function nextTargetAfterHorizon(items: readonly ItemLike[], today: ISODate): ISODate | null {
  const horizon = addDaysISO(today, BURNING_HORIZON_DAYS)
  let next: ISODate | null = null
  for (const item of items) {
    const date = targetDate(item)
    if (!isItemOpen(item) || date === null || date <= horizon) continue
    if (next === null || date < next) next = date
  }
  return next
}
