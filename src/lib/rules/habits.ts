import { addDaysISO, daysBetween, type ISODate } from '../dates'

/** Daily habits = boolean columns of daily_logs («Счёт дня (из 3)»). */
export const HABIT_KEYS = ['morning', 'outside', 'water'] as const
export type HabitKey = (typeof HABIT_KEYS)[number]

export type StageLike = {
  name: string
  sphere: string
  start_date: ISODate
  end_date: ISODate
  habits: string[]
  minimum_habits?: string[]
  targets?: unknown
}

/** Minimum set when no stage defines one (stage 1 default and before import): water + 10 minutes outside. */
export const DEFAULT_MINIMUM: readonly HabitKey[] = ['water', 'outside']
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

/** Rule 13: the stage's minimum set (only known habit keys); the default before import. */
export function minimumSet(stage: Pick<StageLike, 'minimum_habits'> | null): HabitKey[] {
  const keys = stage?.minimum_habits?.filter((k): k is HabitKey => (HABIT_KEYS as readonly string[]).includes(k))
  const set: readonly string[] = keys?.length ? keys : DEFAULT_MINIMUM
  return HABIT_KEYS.filter((k) => set.includes(k))
}

/** Habits shown for the day: in «минимум» only the minimum set, otherwise the stage's habits. */
export function visibleHabits(stage: Pick<StageLike, 'habits' | 'minimum_habits'> | null, minimumMode: boolean): HabitKey[] {
  return minimumMode ? minimumSet(stage) : activeHabits(stage)
}

/**
 * Marked habits of a day, out of `active`. Rule 13: in «минимум» the day counts fully (all active habits)
 * once the whole minimum set is marked; until then only the marked habits of the set count.
 */
export function habitsDone(
  log: Partial<HabitLog> | null | undefined,
  active: readonly HabitKey[],
  minimum: readonly HabitKey[] = DEFAULT_MINIMUM,
): number {
  if (!log) return 0
  if (log.minimum_mode) {
    const marked = minimum.filter((k) => log[k] === true).length
    return marked === minimum.length ? active.length : marked
  }
  return active.filter((k) => log[k] === true).length
}

/** Rule 13: the minimum day is counted once the whole set is marked. */
export function minimumDone(log: Partial<HabitLog> | null | undefined, minimum: readonly HabitKey[]): boolean {
  return Boolean(log?.minimum_mode) && minimum.every((k) => log?.[k] === true)
}

/**
 * Rule 14: marked habits / (active habits × elapsed days of the week). Elapsed days run from Monday
 * through today (today included); a finished week counts all 7. Active habits are taken per day,
 * because a new stage can start mid-week; minimum days count by rule 13. No streaks, nothing resets. Returns 0…1, or null if nothing
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
    const stage = stages.length ? stageForDate(stages, day) : null
    const active = activeHabits(stage)
    possible += active.length
    done += habitsDone(
      logs.find((l) => l.date === day),
      active,
      minimumSet(stage),
    )
  }
  return possible === 0 ? null : done / possible
}
