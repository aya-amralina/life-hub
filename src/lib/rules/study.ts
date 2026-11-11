import { addDaysISO, daysBetween, parseISODate, weekStart, type ISODate } from '../dates'
import { isItemDone, isItemOpen, type ItemLike } from './items'

export const CAPACITY_DEFAULT = { base: 27, max: 36 } as const
export const CAPACITY_HALF = { base: 13.5, max: 18 } as const

export type WeekCapacityLike = {
  id: string
  start_date: ISODate
  place_mode: string | null
  capacity_base_h: number | null
  capacity_max_h: number | null
}

/** Capacity of the week: explicit values, else ½-mode 13,5 / 18, else 27 / 36. */
export function weekCapacity(week: WeekCapacityLike | null | undefined): { base: number; max: number } {
  const half = week?.place_mode?.includes('½') ?? false
  const fallback = half ? CAPACITY_HALF : CAPACITY_DEFAULT
  return { base: week?.capacity_base_h ?? fallback.base, max: week?.capacity_max_h ?? fallback.max }
}

export type StudyItemLike = ItemLike & { sphere: string; week_id: string | null; hours_est: number | null }

/** Study items of the week: by week_id, or (no week_id) by deadline within Mon–Sun. */
export function studyItemsOfWeek<T extends StudyItemLike>(items: readonly T[], weekStart: ISODate, weekId: string | null): T[] {
  const weekEnd = addDaysISO(weekStart, 6)
  return items.filter((i) => {
    if (i.sphere !== 'study') return false
    if (i.week_id !== null) return i.week_id === weekId
    return i.due_date !== null && i.due_date >= weekStart && i.due_date <= weekEnd
  })
}

export type LoadStatus = 'ok' | 'tight' | 'over'
export const LOAD_LABEL: Record<LoadStatus, string> = { ok: 'ок', tight: 'нужен Do/Sa ½', over: 'перегруз' }

/** Items taken off («снято») leave the week's plan and its load. */
export function plannedItems<T extends StudyItemLike>(items: readonly T[]): T[] {
  return items.filter((i) => isItemOpen(i) || isItemDone(i))
}

/** Rule 7: Σ hours_est of the week's study items vs capacity: ≤ base «ок», ≤ max «нужен Do/Sa ½», > max «перегруз». */
export function weekLoad(items: readonly Pick<StudyItemLike, 'hours_est'>[], capacity: { base: number; max: number }) {
  const hours = Math.round(items.reduce((s, i) => s + (Number(i.hours_est) || 0), 0) * 100) / 100
  const status: LoadStatus = hours <= capacity.base ? 'ok' : hours <= capacity.max ? 'tight' : 'over'
  return { hours, ...capacity, status }
}

/** Hours already closed this week (done items; «снято» does not count as done). */
export function hoursDone(items: readonly StudyItemLike[]): number {
  return Math.round(items.filter((i) => isItemDone(i)).reduce((s, i) => s + (Number(i.hours_est) || 0), 0) * 100) / 100
}

/**
 * Rule 6 «Готово к» = deadline − 2 days; if that lands on Monday or Sunday, move to the previous Saturday.
 * Example: deadline Wed 28.10 → Mon 26.10 → Sat 24.10.
 */
export function readyBy(due: ISODate): ISODate {
  const d = addDaysISO(due, -2)
  const dow = parseISODate(d).getDay() // 0 Sun … 6 Sat
  if (dow === 1) return addDaysISO(d, -2)
  if (dow === 0) return addDaysISO(d, -1)
  return d
}

/** Nearest open test (type «Тест») from today, with a countdown in days. */
export function nextTest<T extends StudyItemLike & { type: string | null }>(items: readonly T[], today: ISODate) {
  let best: T | null = null
  for (const i of items) {
    if (i.sphere !== 'study' || i.type !== 'Тест' || !isItemOpen(i) || i.due_date === null || i.due_date < today) continue
    if (best === null || i.due_date < best.due_date!) best = i
  }
  return best ? { item: best, days: daysBetween(today, best.due_date!) } : null
}

/** Rule 19: fixed = has an official deadline, unless set on the card (`is_fixed`). */
export function isFixed(item: { is_fixed?: boolean | null; due_date: string | null }): boolean {
  return item.is_fixed ?? item.due_date !== null
}

export type RolloverItem = StudyItemLike & { is_fixed?: boolean | null; rollover_count?: number; sort_order?: number }
export type WeekRef = { id: string; start_date: ISODate }

/** Monday of the item's week: from week_id, else from the deadline; null for items without a week. */
export function itemWeekStart(item: Pick<StudyItemLike, 'week_id' | 'due_date'>, weeks: readonly WeekRef[]): ISODate | null {
  if (item.week_id !== null) return weeks.find((w) => w.id === item.week_id)?.start_date ?? null
  return item.due_date ? weekStart(item.due_date) : null
}

/** Open flexible study items of weeks before `monday`, in rollover order (week, «готово к», sort_order). */
export function rolloverCandidates<T extends RolloverItem>(items: readonly T[], weeks: readonly WeekRef[], monday: ISODate): T[] {
  const withWeek = items.flatMap((i) => {
    if (i.sphere !== 'study' || !isItemOpen(i) || isFixed(i)) return []
    const start = itemWeekStart(i, weeks)
    return start !== null && start < monday ? [{ i, start }] : []
  })
  return withWeek
    .sort(
      (a, b) =>
        a.start.localeCompare(b.start) ||
        (a.i.ready_by ?? '9999').localeCompare(b.i.ready_by ?? '9999') ||
        (a.i.sort_order ?? 0) - (b.i.sort_order ?? 0) ||
        a.i.id.localeCompare(b.i.id),
    )
    .map((x) => x.i)
}

export type RolloverPlan<T> = { moves: { item: T; rollover_count: number }[]; waiting: T[] }

/**
 * Rule 20 «автоперенос гибких»: open flexible items of past weeks move into the current week
 * (rollover_count + 1), one by one in rollover order, as long as the week stays within its maximum.
 * The rest stay where they are — rule 21 «Ждут решения». Idempotent: moved items are in the current
 * week and are no longer candidates; a second run with the same data plans nothing new.
 */
export function planRollover<T extends RolloverItem>(
  items: readonly T[],
  weeks: readonly WeekRef[],
  current: { monday: ISODate; weekId: string | null; capacity: { base: number; max: number } },
): RolloverPlan<T> {
  let load = weekLoad(plannedItems(studyItemsOfWeek(items, current.monday, current.weekId)), current.capacity).hours
  const plan: RolloverPlan<T> = { moves: [], waiting: [] }
  for (const item of rolloverCandidates(items, weeks, current.monday)) {
    const h = Number(item.hours_est) || 0
    if (load + h <= current.capacity.max + 1e-9) {
      load = Math.round((load + h) * 100) / 100
      plan.moves.push({ item, rollover_count: (item.rollover_count ?? 0) + 1 })
    } else {
      plan.waiting.push(item)
    }
  }
  return plan
}
