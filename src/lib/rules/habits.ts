import { addDaysISO, daysBetween, type ISODate } from '../dates'

/** Daily habits = boolean columns of daily_logs («Счёт дня (из 3)»). */
export const HABIT_KEYS = ['morning', 'outside', 'water'] as const
export type HabitKey = (typeof HABIT_KEYS)[number]

export type StageLike = { name: string; sphere: string; start_date: ISODate; end_date: ISODate; habits: string[] }
export type HabitLog = { date: ISODate; minimum_mode: boolean } & Record<HabitKey, boolean>

/** Rule 12: the glow-up stage is picked by date (body sphere). */
export function stageForDate<T extends StageLike>(stages: readonly T[], date: ISODate): T | null {
  return stages.find((s) => s.sphere === 'body' && s.start_date <= date && date <= s.end_date) ?? null
}

/**
 * Habits of the stage; habits that have not started yet are hidden.
 * Without any stage (before import) all three daily habits are active.
 */
export function activeHabits(stage: Pick<StageLike, 'habits'> | null): HabitKey[] {
  if (!stage) return [...HABIT_KEYS]
  return HABIT_KEYS.filter((k) => stage.habits.includes(k))
}

/** Marked habits of a day. Rule 13: «минимум» counts the day as fully done. */
export function habitsDone(log: Partial<HabitLog> | null | undefined, active: readonly HabitKey[]): number {
  if (!log) return 0
  if (log.minimum_mode) return active.length
  return active.filter((k) => log[k] === true).length
}

/**
 * Rule 14: marked habits / (active habits × elapsed days of the week). Elapsed days run from Monday
 * through today (today included); a finished week counts all 7. Active habits are taken per day,
 * because a new stage can start mid-week. No streaks, nothing resets. Returns 0…1, or null if nothing
 * is active yet.
 */
export function weekHabitShare(
  logs: readonly Partial<HabitLog>[],
  stages: readonly StageLike[],
  weekStart: ISODate,
  today: ISODate,
): number | null {
  const elapsed = Math.min(7, daysBetween(weekStart, today) + 1)
  if (elapsed <= 0) return null
  let done = 0
  let possible = 0
  for (let i = 0; i < elapsed; i++) {
    const day = addDaysISO(weekStart, i)
    const active = activeHabits(stages.length ? stageForDate(stages, day) : null)
    possible += active.length
    done += habitsDone(
      logs.find((l) => l.date === day),
      active,
    )
  }
  return possible === 0 ? null : done / possible
}
