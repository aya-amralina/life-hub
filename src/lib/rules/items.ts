import { CANCELLED_STATUSES, CLOSED_STATUSES, DONE_STATUSES } from '../constants'
import { addDaysISO, daysBetween, formatWeekdayDate, todayBerlin, type ISODate } from '../dates'
import { formatTime, plural } from '../format'

export type ItemLike = {
  id: string
  done_at: string | null
  status: string | null
  due_date: string | null
  ready_by: string | null
  due_time?: string | null
  starts_on?: string | null
  happens_on?: string | null
  happens_time?: string | null
  rollover_count?: number
}

/** An item is open until it has done_at or a closing status (Erledigt, Verworfen, готово, снято …). */
export function isItemOpen(item: Pick<ItemLike, 'done_at' | 'status'>): boolean {
  return item.done_at === null && !(item.status !== null && CLOSED_STATUSES.includes(item.status))
}

/** Cancelled («снято», Verworfen, «Отменено»): closed but not done, whatever done_at says. */
export function isItemCancelled(item: Pick<ItemLike, 'status'>): boolean {
  return item.status !== null && CANCELLED_STATUSES.includes(item.status)
}

/** Done = checked or a «done» status, and not cancelled. */
export function isItemDone(item: Pick<ItemLike, 'done_at' | 'status'>): boolean {
  if (isItemCancelled(item)) return false
  return item.done_at !== null || (item.status !== null && DONE_STATUSES.includes(item.status))
}

/** The date that drives urgency: «готово к» if set, otherwise the deadline. */
export function targetDate(item: Pick<ItemLike, 'due_date' | 'ready_by'>): ISODate | null {
  return item.ready_by ?? item.due_date
}

export type DeadlineKind = 'open' | 'day' | 'from' | 'deadline'

/**
 * Rule 15: the kind of deadline comes from the filled fields. `starts_on` wins over a deadline
 * («начать с 01.12, сдать до 15.12» is «с даты» with a deadline); a day-item has `happens_on`.
 */
export function deadlineKind(item: Pick<ItemLike, 'due_date' | 'starts_on' | 'happens_on'>): DeadlineKind {
  if (item.happens_on) return 'day'
  if (item.starts_on) return 'from'
  if (item.due_date) return 'deadline'
  return 'open'
}

/** Rule 16 «Скоро»: an item that starts later is hidden from active lists and from «Горит». */
export function isUpcoming(item: Pick<ItemLike, 'starts_on'>, today: ISODate): boolean {
  return item.starts_on != null && item.starts_on > today
}

export type Burning<T> = { item: T; date: ISODate; overdue: boolean }

export const BURNING_HORIZON_DAYS = 3

/**
 * Rule 11 «Горит»: open items of all spheres where coalesce(ready_by, due_date) ≤ today + 3,
 * overdue ones included (overdue = deadline already passed). Items that start later (rule 16) are left
 * out. Sorted by that date.
 */
export function burning<T extends ItemLike>(items: readonly T[], today: ISODate): Burning<T>[] {
  const horizon = addDaysISO(today, BURNING_HORIZON_DAYS)
  const result: Burning<T>[] = []
  for (const item of items) {
    if (!isItemOpen(item) || isUpcoming(item, today)) continue
    const date = targetDate(item)
    if (date === null || date > horizon) continue
    const overdue = item.due_date !== null && item.due_date < today
    result.push({ item, date, overdue })
  }
  return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** Rule 17 «Состоялось?»: open items whose day (happens_on) has passed. Oldest first. */
export function happenedQuestions<T extends ItemLike>(items: readonly T[], today: ISODate): T[] {
  return items
    .filter((i) => isItemOpen(i) && i.happens_on != null && i.happens_on < today)
    .sort((a, b) => (a.happens_on! < b.happens_on! ? -1 : a.happens_on! > b.happens_on! ? 1 : 0))
}

/** Open items planned for the day (happens_on = day), by time; all-day ones first. */
export function itemsOfDay<T extends ItemLike>(items: readonly T[], day: ISODate): T[] {
  return items
    .filter((i) => isItemOpen(i) && i.happens_on === day)
    .sort((a, b) => (a.happens_time ?? '').localeCompare(b.happens_time ?? ''))
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

export type ChipKind = 'clock' | 'from' | 'flag' | 'hot' | 'late' | 'moved' | 'stuck' | 'rigid' | 'ok' | 'alt'
export type Chip = { kind: ChipKind; text: string }

/** «сегодня», «завтра», «через 2 дня», «5 дней назад». */
export function countdown(date: ISODate, today: ISODate): string {
  const d = daysBetween(today, date)
  if (d === 0) return 'сегодня'
  if (d === 1) return 'завтра'
  if (d === -1) return 'вчера'
  if (d > 1) return `через ${d} ${plural(d, ['день', 'дня', 'дней'])}`
  return `${-d} ${plural(-d, ['день', 'дня', 'дней'])} назад`
}

const dayText = (date: ISODate, today: ISODate) => (date === today ? 'Сегодня' : formatWeekdayDate(date))

/**
 * The deadline chip of an item's meta line (design 06 «метки сроков»): neutral while calm, amber («горит»)
 * from 3 days before the target date, red only once the deadline passed — always with the date.
 * Open items and closed ones get no chip.
 */
export function deadlineChip(item: ItemLike, today: ISODate): Chip | null {
  if (!isItemOpen(item)) return null
  const kind = deadlineKind(item)
  if (kind === 'open') return null
  if (kind === 'day') {
    const time = item.happens_time ? ` · ${formatTime(item.happens_time)}` : ''
    return { kind: 'clock', text: `${dayText(item.happens_on!, today)}${time}` }
  }
  if (kind === 'from' && isUpcoming(item, today)) {
    const start = `с ${formatWeekdayDate(item.starts_on!)}`
    return { kind: 'from', text: item.due_date ? `${start} · до ${formatWeekdayDate(item.due_date)}` : start }
  }
  if (!item.due_date) return null // started «с даты» without a deadline: a normal item now
  if (item.due_date < today) return { kind: 'late', text: `Срок прошёл · ${formatWeekdayDate(item.due_date)}` }
  const time = item.due_time ? ` ${formatTime(item.due_time)}` : ''
  const target = targetDate(item)!
  if (target <= addDaysISO(today, BURNING_HORIZON_DAYS)) {
    return { kind: 'hot', text: `до ${dayText(item.due_date, today)}${time} · ${countdown(item.due_date, today)}` }
  }
  return { kind: 'flag', text: `до ${formatWeekdayDate(item.due_date)}${time}` }
}

/** Rule 22 threshold: moved twice = the item sits in its third week's plan. */
export const STUCK_ROLLOVERS = 2

export function isStuck(item: Pick<ItemLike, 'rollover_count'>): boolean {
  return (item.rollover_count ?? 0) >= STUCK_ROLLOVERS
}

/** History chips: «перенесено ×N», and «застряло · N нед» from the second rollover on. */
export function historyChips(item: ItemLike): Chip[] {
  const n = item.rollover_count ?? 0
  if (n === 0 || !isItemOpen(item)) return []
  const chips: Chip[] = [{ kind: 'moved', text: `перенесено ×${n}` }]
  if (isStuck(item)) chips.push({ kind: 'stuck', text: `застряло · ${n + 1} нед` })
  return chips
}
