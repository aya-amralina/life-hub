import { addDaysISO, daysBetween, parseISODate, todayBerlin, weekStart, type ISODate } from '../dates'
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
  time_of_day?: string
  minimum_note?: string | null
} & Partial<FreqLike>
/** Frequency (stored since 0021, applied since step 3): daily · weekdays · every other day from starts_on · N a week. */
export type FreqLike = { freq: string; freq_weekdays: number[] | null; freq_per_week: number | null; starts_on: ISODate }
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

/**
 * Rule 13: the minimum set of the day — active daily habits marked «в минимуме» (none marked — all of them); with
 * programs — also the programs «в минимуме» («Кор» in its minimal version).
 */
export function minimumOn<H extends HabitLike>(habits: readonly H[], plans: readonly PlanLike[], date: ISODate, withPrograms = false): H[] {
  const daily = activeOn(habits, plans, date)
  const set = daily.filter((h) => h.in_minimum)
  const programs = withPrograms ? activeOn(habits, plans, date, 'program').filter((h) => h.in_minimum) : []
  return [...(set.length ? set : daily), ...programs]
}

/** ISO weekday: 1 = Пн … 7 = Вс. */
export const isoWeekday = (date: ISODate) => ((parseISODate(date).getDay() + 6) % 7) + 1

/**
 * Due on the day by its frequency: daily — always; weekdays — on those days; every other day — on even days from
 * starts_on (back in time too); N a week — until N marks this week (`weekDone`, the day itself not counted) or when
 * marked that day.
 */
export function isDueOn(h: Partial<FreqLike>, date: ISODate, weekDone = 0, doneToday = false): boolean {
  switch (h.freq ?? 'daily') {
    case 'weekdays':
      return (h.freq_weekdays ?? []).includes(isoWeekday(date))
    case 'every_other_day':
      return h.starts_on ? ((daysBetween(h.starts_on, date) % 2) + 2) % 2 === 0 : true
    case 'per_week':
      return doneToday || weekDone < (h.freq_per_week ?? 7)
    default:
      return true
  }
}

/** Marks of a habit this week before the day (for «N раз в неделю»). */
export function weekDoneBefore(marks: readonly MarkLike[], habitId: string, date: ISODate): number {
  const monday = weekStart(date)
  return new Set(marks.filter((m) => m.done && m.habit_id === habitId && m.date >= monday && m.date < date).map((m) => m.date)).size
}

/** What the screen shows on the day: active by the plan AND due by the frequency (`marks` should hold the week). */
export function dueOn<H extends HabitLike>(habits: readonly H[], plans: readonly PlanLike[], date: ISODate, kind: HabitKind, marks: readonly MarkLike[]): H[] {
  const today = dayMarks(marks, date, false)
  return activeOn(habits, plans, date, kind).filter((h) => isDueOn(h, date, weekDoneBefore(marks, h.id, date), today.done.has(h.id)))
}

/** Habits shown for the day: in «минимум» only the minimum set, otherwise all active daily habits. */
export function visibleOn<H extends HabitLike>(habits: readonly H[], plans: readonly PlanLike[], date: ISODate, minimumMode: boolean): H[] {
  return minimumMode ? minimumOn(habits, plans, date) : activeOn(habits, plans, date)
}

/**
 * What counts on a day: daily habits due by their frequency (and programs, for the calendar) with the minimum set.
 * A habit «N раз в неделю» counts only on a day it is marked — it is never a miss.
 */
export function daySet(habits: readonly HabitLike[], plans: readonly PlanLike[], date: ISODate, withPrograms = false, marked?: ReadonlySet<string>): DaySet {
  const due = (h: HabitLike) => (h.freq === 'per_week' ? Boolean(marked?.has(h.id)) : isDueOn(h, date))
  const active = [...activeOn(habits, plans, date), ...(withPrograms ? activeOn(habits, plans, date, 'program') : [])].filter(due)
  return { active: active.map((h) => h.id), minimum: minimumOn(habits, plans, date, withPrograms).filter(due).map((h) => h.id) }
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
