import { addDaysISO, daysBetween, todayBerlin, type ISODate } from '../dates'
import { joinRu } from '../format'

/**
 * Habits are data (table `habits`, migration 0021): daily habits, care and programs («Кор») in one list. A habit is
 * active on a day inside one of its periods (`habit_plan`) and before its archive day. Marks are one row per habit
 * and day (`habit_marks`); a program is marked by its finished session. Archived habits keep their past.
 */
export type HabitKind = 'habit' | 'care' | 'program'
export type HabitLike = {
  id: string
  kind: string
  name: string
  group_name?: string | null
  in_minimum: boolean
  sort_order: number
  archived_at: string | null
  phrase?: string | null
  icon?: string | null
  program_id?: string | null
}
export type PlanLike = { habit_id: string; from_date: ISODate | null; to_date: ISODate | null }
export type MarkLike = { habit_id: string; date: ISODate; done: boolean }

/** A day as the rules see it: «минимум» on or off and the habits marked done. */
export type DayMarks = { minimum_mode: boolean; done: ReadonlySet<string> }
/** What counts on a day: the active habits and the minimum set (ids). */
export type DaySet = { active: readonly string[]; minimum: readonly string[] }

/** The Berlin day of the archive moment: from that day on the habit is not active. */
const archiveDay = (at: string) => todayBerlin(new Date(at))

/** Rule 12: active on the day — inside a period of the plan and not archived by then. */
export function isActiveOn(habit: Pick<HabitLike, 'id' | 'archived_at'>, plans: readonly PlanLike[], date: ISODate): boolean {
  if (habit.archived_at && date >= archiveDay(habit.archived_at)) return false
  return plans.some((p) => p.habit_id === habit.id && (p.from_date === null || p.from_date <= date) && (p.to_date === null || date <= p.to_date))
}

const byOrder = (a: HabitLike, b: HabitLike) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)

/** Active habits of a kind on the day, in their order. */
export function activeOn<H extends HabitLike>(habits: readonly H[], plans: readonly PlanLike[], date: ISODate, kind: HabitKind = 'habit'): H[] {
  return habits.filter((h) => h.kind === kind && isActiveOn(h, plans, date)).sort(byOrder)
}

/** Rule 13: the minimum set of the day — active daily habits marked «в минимуме»; none marked — all of them. */
export function minimumOn<H extends HabitLike>(habits: readonly H[], plans: readonly PlanLike[], date: ISODate): H[] {
  const daily = activeOn(habits, plans, date)
  const set = daily.filter((h) => h.in_minimum)
  return set.length ? set : daily
}

/** Habits shown for the day: in «минимум» only the minimum set, otherwise all active daily habits. */
export function visibleOn<H extends HabitLike>(habits: readonly H[], plans: readonly PlanLike[], date: ISODate, minimumMode: boolean): H[] {
  return minimumMode ? minimumOn(habits, plans, date) : activeOn(habits, plans, date)
}

/** What counts on a day: daily habits (and programs, for the calendar) with the minimum set. */
export function daySet(habits: readonly HabitLike[], plans: readonly PlanLike[], date: ISODate, withPrograms = false): DaySet {
  const active = [...activeOn(habits, plans, date), ...(withPrograms ? activeOn(habits, plans, date, 'program') : [])]
  return { active: active.map((h) => h.id), minimum: minimumOn(habits, plans, date).map((h) => h.id) }
}

/** Marks of one day as a set (a later «done = false» unmarks); `extra` — more done ids (finished program sessions). */
export function dayMarks(marks: readonly MarkLike[], date: ISODate, minimumMode: boolean, extra: readonly string[] = []): DayMarks {
  const done = new Set(extra)
  for (const m of marks) {
    if (m.date !== date) continue
    if (m.done) done.add(m.habit_id)
    else done.delete(m.habit_id)
  }
  return { minimum_mode: minimumMode, done }
}

/**
 * Marked habits of a day, out of `active`. Rule 13: in «минимум» the day counts fully (all active habits) once the
 * whole minimum set is marked; until then only the marked habits of the set count.
 */
export function habitsDone(day: DayMarks | null | undefined, active: readonly string[], minimum: readonly string[]): number {
  if (!day) return 0
  if (day.minimum_mode) {
    const marked = minimum.filter((id) => day.done.has(id)).length
    return marked === minimum.length ? active.length : marked
  }
  return active.filter((id) => day.done.has(id)).length
}

/** Rule 13: the minimum day is counted once the whole set is marked. */
export function minimumDone(day: DayMarks | null | undefined, minimum: readonly string[]): boolean {
  return Boolean(day?.minimum_mode) && minimum.every((id) => day!.done.has(id))
}

/**
 * Rule 14: marked habits / (active habits × elapsed days of the week). Elapsed days run from Monday through today
 * (today included); a finished week counts all 7. Active habits are taken per day (a habit can start mid-week);
 * minimum days count by rule 13. No streaks, nothing resets. Returns 0…1, or null if nothing is active yet.
 */
export function weekHabitShare(
  day: (date: ISODate) => DayMarks | null,
  set: (date: ISODate) => DaySet,
  weekStart: ISODate,
  today: ISODate,
): number | null {
  const elapsed = Math.min(7, daysBetween(weekStart, today) + 1)
  if (elapsed <= 0) return null
  let done = 0
  let possible = 0
  for (let i = 0; i < elapsed; i++) {
    const d = addDaysISO(weekStart, i)
    const { active, minimum } = set(d)
    possible += active.length
    done += habitsDone(day(d), active, minimum)
  }
  return possible === 0 ? null : done / possible
}

/** «вода и 10 минут на улице» — the minimum set in words (rule 13: the card names it). */
export function minimumPhrase(set: readonly Pick<HabitLike, 'name' | 'phrase'>[]): string {
  return joinRu(set.map((h) => h.phrase?.trim() || h.name.toLowerCase()))
}

/** Rule 12 for the stage names: the glow-up stage of the date (its name, period and week targets). */
export type StageLike = { name: string; sphere: string; start_date: ISODate; end_date: ISODate; targets?: unknown }
export function stageForDate<T extends StageLike>(stages: readonly T[], date: ISODate): T | null {
  return stages.find((s) => s.sphere === 'body' && s.start_date <= date && date <= s.end_date) ?? null
}
