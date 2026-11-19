import { addDaysISO, weekStart, type ISODate } from '../dates'

/**
 * Strength templates and the week queue are data (workout_templates, workout_queue — migration 0021). An exercise has
 * steps by the «Кор» stage, each with a home and a gym variant; the cardio is the last item of every template.
 */
export type Place = 'home' | 'gym'
export type ExerciseVariant = { from_core_stage: number; home: string; gym: string }
export type Exercise = { key: string; name: string; sets: number | null; reps: string; kind?: 'cardio'; detail?: string; variants: ExerciseVariant[] }
export type TemplateLike = { id: string; code: string; name: string; focus: string; exercises: unknown; archived_at: string | null }
export type QueueLike = { starts_on: ISODate; position: number; template_id: string }

const str = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/** Exercises from the stored jsonb; malformed ones are dropped. */
export function parseExercises(raw: unknown): Exercise[] {
  if (!Array.isArray(raw)) return []
  return (raw as Record<string, unknown>[])
    .filter((e) => e && str(e.key) && str(e.name))
    .map((e) => ({
      key: e.key as string,
      name: e.name as string,
      sets: Number.isInteger(e.sets) ? (e.sets as number) : null,
      reps: str(e.reps) ? e.reps : '',
      ...(e.kind === 'cardio' ? { kind: 'cardio' as const } : {}),
      ...(str(e.detail) ? { detail: e.detail } : {}),
      variants: (Array.isArray(e.variants) ? (e.variants as Record<string, unknown>[]) : [])
        .filter((v) => v && Number.isInteger(v.from_core_stage))
        .map((v) => ({ from_core_stage: v.from_core_stage as number, home: str(v.home) ? v.home : '', gym: str(v.gym) ? v.gym : '' }))
        .sort((a, b) => a.from_core_stage - b.from_core_stage),
    }))
}

/** The variant for the «Кор» stage and the place: the last step with from_core_stage ≤ the stage. */
export function exerciseVariant(exercise: Exercise, coreStage: number, place: Place): string | null {
  const step = exercise.variants.filter((v) => v.from_core_stage <= coreStage).at(-1)
  return step ? step[place] || null : null
}

/** The queue in force on the day: the rows of the latest starts_on ≤ the day, by position. */
export function queueOn<Q extends QueueLike>(queue: readonly Q[], date: ISODate): Q[] {
  const starts = [...new Set(queue.map((q) => q.starts_on))].filter((s) => s <= date).sort()
  const from = starts.at(-1)
  return from ? queue.filter((q) => q.starts_on === from).sort((a, b) => a.position - b.position) : []
}

/** The week target: as many strength sessions as the queue holds. */
export function weekTarget(queue: readonly QueueLike[], date: ISODate): number {
  return queueOn(queue, date).length
}

/**
 * Next in the queue: no fixed weekdays — the week's done sessions take the first places in order, the next free place
 * is next; the week full — null. `done` — dates of finished strength sessions (one a day counts once).
 */
export function nextInQueue<Q extends QueueLike>(queue: readonly Q[], done: readonly ISODate[], date: ISODate): Q | null {
  const monday = weekStart(date)
  const sunday = addDaysISO(monday, 6)
  const count = new Set(done.filter((d) => d >= monday && d <= sunday)).size
  return queueOn(queue, date)[count] ?? null
}

/** A soft warning: strength two days in a row (yesterday had one). */
export function backToBack(done: readonly ISODate[], date: ISODate): boolean {
  return done.includes(addDaysISO(date, -1))
}

/** Codes of the journal («A», «B») — the templates in use. */
export function templateCodes(templates: readonly TemplateLike[]): string[] {
  return templates.filter((t) => !t.archived_at).map((t) => t.code)
}

/** The top of a reps range: «8–12 на ногу» → 12, «15» → 15, «15–20 мин» → 20; none — null. */
export function rangeTop(reps: string): number | null {
  const m = /(\d+)(?:\s*[–-]\s*(\d+))?/.exec(reps)
  return m ? Number(m[2] ?? m[1]) : null
}

/** The bottom of the range («8–12» → 8) — the reps a first session starts from. */
export function rangeBottom(reps: string): number | null {
  const m = /(\d+)/.exec(reps)
  return m ? Number(m[1]) : null
}

export type SetRowLike = {
  date: ISODate
  session_id: string | null
  exercise_key: string | null
  reps: number[]
  loads: string[] | null
  load?: string | null
  sets_done: boolean[] | null
}
export type SessionLike = { id: string; date: ISODate; dome: boolean | null; done_at: string | null; place?: string }

/** Earlier finished sessions of an exercise, newest first (the day itself left out), at most `n`. */
export function lastTimes<R extends SetRowLike>(rows: readonly R[], sessions: readonly SessionLike[], key: string, before: ISODate, n = 3): R[] {
  const done = new Set(sessions.filter((s) => s.done_at).map((s) => s.id))
  return rows
    .filter((r) => r.exercise_key === key && r.session_id && done.has(r.session_id) && r.date < before)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, n)
}

/** Sets of the screen: the values of last time (3 sets), or the bottom of the range and no load the first time. */
export function prefill(last: SetRowLike | undefined, exercise: Pick<Exercise, 'reps' | 'sets'>): { reps: (number | null)[]; loads: string[] } {
  const n = exercise.sets ?? 3
  const start = rangeBottom(exercise.reps)
  return {
    reps: Array.from({ length: n }, (_, i) => last?.reps[i] ?? last?.reps.at(-1) ?? start),
    loads: Array.from({ length: n }, (_, i) => last?.loads?.[i] ?? last?.loads?.at(-1) ?? last?.load ?? ''),
  }
}

/**
 * «Пора усложнить»: last time every set was ticked at the top of the range and there was no «домик» (an unanswered
 * «домик» does not count as none).
 */
export function readyToProgress(last: SetRowLike | undefined, session: SessionLike | undefined, exercise: Pick<Exercise, 'reps' | 'sets' | 'kind'>): boolean {
  if (!last || !session || exercise.kind === 'cardio' || session.dome !== false) return false
  const top = rangeTop(exercise.reps)
  const n = exercise.sets ?? last.reps.length
  if (top === null || last.reps.length < n) return false
  const ticked = last.sets_done ?? last.reps.map(() => true)
  return last.reps.slice(0, n).every((r, i) => ticked[i] === true && r >= top)
}

/** Days with a strength session that counts: finished sessions and days of the old journal (rows without a session). */
export function strengthDates(sessions: readonly SessionLike[], rows: readonly Pick<SetRowLike, 'date' | 'session_id'>[]): ISODate[] {
  return [...new Set([...sessions.filter((s) => s.done_at).map((s) => s.date), ...rows.filter((r) => !r.session_id).map((r) => r.date)])].sort()
}

/** The place of a new session: the last session's choice, home the first time. */
export function lastPlace(sessions: readonly SessionLike[]): Place {
  const last = [...sessions].sort((a, b) => b.date.localeCompare(a.date))[0]
  return last?.place === 'gym' ? 'gym' : 'home'
}

/** «19.11: 10 · 10 · 8 · рюкзак» — one earlier time of an exercise. */
export function timeLine(r: SetRowLike, formatDay: (d: ISODate) => string): string {
  const loads = [...new Set((r.loads ?? [r.load ?? '']).filter(Boolean))]
  return [`${formatDay(r.date)}: ${r.reps.join(' · ')}`, loads.join(' / ')].filter(Boolean).join(' · ')
}
