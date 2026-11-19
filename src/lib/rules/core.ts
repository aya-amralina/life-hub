import { addDaysISO, daysBetween, formatDayMonth, weekStart, type ISODate } from '../dates'

/**
 * «Кор» — a daily core program (SPEC «Кор»). The program is data (core_programs.stages), these rules only read it:
 * the stage and week of the program, the offer to move to the next stage, the finger test days.
 */
export type CoreExercise = { key: string; name: string; dose: string; detail?: string }
export type CoreStage = { no: number; weeks: number | null; note?: string; exercises: CoreExercise[] }
export type CoreProgramLike = {
  start_date: ISODate
  stages: unknown
  test_every_days: number
  stage: number
  stage_since: ISODate
  offer_after: ISODate | null
}
/** `minimal` — the «Тяжёлый день» version: counts in the week, not in the move to the next stage (rule 39). */
export type CoreSessionLike = { date: ISODate; dome: boolean | null; done_at: string | null; minimal?: boolean }

/** Sessions in a row without the «домик» before the next stage is offered. */
export const DOME_FREE_SESSIONS = 7
/** «Ещё неделю»: the offer comes back after this many days. */
export const SNOOZE_DAYS = 7

const str = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/** Stages from the stored jsonb, sorted by number; malformed stages and exercises are dropped (an editor writes it later). */
export function parseStages(raw: unknown): CoreStage[] {
  if (!Array.isArray(raw)) return []
  const out: CoreStage[] = []
  for (const s of raw as Record<string, unknown>[]) {
    if (!s || typeof s !== 'object' || !Number.isInteger(s.no) || (s.no as number) < 1) continue
    const weeks = Number.isInteger(s.weeks) && (s.weeks as number) > 0 ? (s.weeks as number) : null
    const exercises = (Array.isArray(s.exercises) ? (s.exercises as Record<string, unknown>[]) : [])
      .filter((e) => e && str(e.key) && str(e.name))
      .map((e) => ({ key: e.key as string, name: e.name as string, dose: str(e.dose) ? e.dose : '', ...(str(e.detail) ? { detail: e.detail } : {}) }))
    out.push({ no: s.no as number, weeks, ...(str(s.note) ? { note: s.note } : {}), exercises })
  }
  return out.sort((a, b) => a.no - b.no)
}

/** The stage with this number (the current one by default); null when the program has no such stage. */
export function stageOf(program: Pick<CoreProgramLike, 'stages' | 'stage'>, no: number = program.stage): CoreStage | null {
  return parseStages(program.stages).find((s) => s.no === no) ?? null
}

/** Week of the program, 1 on the start day; null before the start. */
export function programWeek(start: ISODate, date: ISODate): number | null {
  const d = daysBetween(start, date)
  return d < 0 ? null : Math.floor(d / 7) + 1
}

export const isSessionDone = (s: Pick<CoreSessionLike, 'done_at'> | null | undefined): boolean => Boolean(s?.done_at)

/** The earliest day of the next stage: the minimum term of the current one, from the day it began. Null — no term. */
export function earliestNext(program: Pick<CoreProgramLike, 'stages' | 'stage' | 'stage_since'>): ISODate | null {
  const weeks = stageOf(program)?.weeks
  return weeks ? addDaysISO(program.stage_since, weeks * 7) : null
}

/** The last `n` finished full sessions up to the day, newest first (minimal ones do not count for the next stage). */
export function lastSessions<S extends CoreSessionLike>(sessions: readonly S[], today: ISODate, n = DOME_FREE_SESSIONS): S[] {
  return sessions
    .filter((s) => isSessionDone(s) && !s.minimal && s.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, n)
}

/** Of the last 7 finished sessions, how many were without the «домик» (an unanswered one does not count as without). */
export function domeFree(sessions: readonly CoreSessionLike[], today: ISODate): { free: number; of: number } {
  const last = lastSessions(sessions, today)
  return { free: last.filter((s) => s.dome === false).length, of: last.length }
}

export type NextStage =
  | { kind: 'last' } // no next stage
  | { kind: 'empty'; next: CoreStage } // the next stage has no exercises yet
  | { kind: 'wait'; next: CoreStage; from: ISODate } // the minimum term has not passed
  | { kind: 'dome'; next: CoreStage; free: number; of: number } // the term passed, the last 7 sessions are not all without the «домик»
  | { kind: 'later'; next: CoreStage; after: ISODate } // «Ещё неделю»
  | { kind: 'offer'; next: CoreStage } // «Переходим на этап N?»

/**
 * The move to the next stage: the minimum term of the current stage has passed AND the last 7 finished sessions
 * were all without the «домик». The app only offers — the user switches. «Ещё неделю» hides the offer for 7 days.
 * A next stage without exercises is not offered.
 */
export function nextStage(program: CoreProgramLike, sessions: readonly CoreSessionLike[], today: ISODate): NextStage {
  const next = stageOf(program, program.stage + 1)
  if (!next) return { kind: 'last' }
  if (next.exercises.length === 0) return { kind: 'empty', next }
  const from = earliestNext(program)
  if (from && today < from) return { kind: 'wait', next, from }
  const { free, of } = domeFree(sessions, today)
  if (of < DOME_FREE_SESSIONS || free < DOME_FREE_SESSIONS) return { kind: 'dome', next, free, of }
  if (program.offer_after && today < program.offer_after) return { kind: 'later', next, after: program.offer_after }
  return { kind: 'offer', next }
}

/** «Перейти»: the next stage starts today; a snoozed offer is forgotten. */
export function switchPatch(next: CoreStage, today: ISODate) {
  return { stage: next.no, stage_since: today, offer_after: null }
}

/** «Ещё неделю». */
export function snoozePatch(today: ISODate) {
  return { offer_after: addDaysISO(today, SNOOZE_DAYS) }
}

/** Finger test: every `test_every_days` from the start (17.12, 14.01, …), never on the start day itself. */
export function isTestDay(program: Pick<CoreProgramLike, 'start_date' | 'test_every_days'>, date: ISODate): boolean {
  const d = daysBetween(program.start_date, date)
  return d > 0 && d % program.test_every_days === 0
}

/** The next finger test on or after the day. */
export function nextTestDay(program: Pick<CoreProgramLike, 'start_date' | 'test_every_days'>, from: ISODate): ISODate {
  const every = program.test_every_days
  const k = Math.max(1, Math.ceil(daysBetween(program.start_date, from) / every))
  return addDaysISO(program.start_date, k * every)
}

/** Finished sessions in the Mon–Sun week of the day (from the program start). */
export function weekSessions(sessions: readonly CoreSessionLike[], date: ISODate): number {
  const monday = weekStart(date)
  const sunday = addDaysISO(monday, 6)
  return sessions.filter((s) => isSessionDone(s) && s.date >= monday && s.date <= sunday).length
}

/** Days of the week the program runs (for «0 из 7»): all seven, fewer in the start week. */
export function weekDaysActive(start: ISODate, date: ISODate): number {
  const monday = weekStart(date)
  if (start <= monday) return 7
  return Math.max(0, 7 - daysBetween(monday, start))
}

/** Tick / untick an exercise of the session. */
export function toggleExercise(done: readonly string[], key: string): string[] {
  return done.includes(key) ? done.filter((k) => k !== key) : [...done, key]
}

/** Days with a finished session — for the habit calendar. */
export function sessionDays(sessions: readonly CoreSessionLike[]): Set<ISODate> {
  return new Set(sessions.filter(isSessionDone).map((s) => s.date))
}

/** «Усилие на выдохе. Вставать через бок. Не тужиться.» */
export function rulesLine(rules: readonly string[]): string {
  return rules
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => (/[.!?…]$/.test(r) ? r : `${r}.`))
    .join(' ')
}

/** «Этап 1, неделя 1 · 10 мин» — the week of the program. */
export function coreLine(program: { stage: number; start_date: ISODate; minutes: number }, today: ISODate): string {
  return `Этап ${program.stage}, неделя ${programWeek(program.start_date, today) ?? 1} · ${program.minutes} мин`
}

/** The way to the next stage in words: «Этап 2 не раньше 10.12 и только без домика.»; null — nothing to say. */
export function nextStagePhrase(next: NextStage): string | null {
  switch (next.kind) {
    case 'wait':
      return `Этап ${next.next.no} не раньше ${formatDayMonth(next.from)} и только без домика.`
    case 'dome':
      return `Этап ${next.next.no} — после 7 сессий подряд без домика. Сейчас без домика ${next.free} из ${next.of}.`
    case 'later':
      return `Этап ${next.next.no} — напомню ${formatDayMonth(next.after)}.`
    case 'empty':
      return `Этап ${next.next.no}: упражнения добавятся позже.${next.next.note ? ` ${next.next.note}` : ''}`
    default:
      return null
  }
}

/** «1,5 пальца», «2 пальца», «5 пальцев». */
export function fingersText(n: number): string {
  const s = String(n).replace('.', ',')
  if (!Number.isInteger(n)) return `${s} пальца`
  const m10 = n % 10
  const m100 = n % 100
  const word = m10 === 1 && m100 !== 11 ? 'палец' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'пальца' : 'пальцев'
  return `${s} ${word}`
}
