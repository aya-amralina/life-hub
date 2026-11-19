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
