import { addDaysISO, daysBetween, type ISODate } from '../dates'
import { isIntakeActive } from './intake'
import { isItemCancelled, isItemDone, isItemOpen, targetDate, type ItemLike } from './items'

/**
 * «Тело → Здоровье» (step 5): intake in one list, tasks and visits in groups, repeats as one line, doctors as chains of
 * steps. Every event stays its own item; series only change how they are shown.
 */

// ───────────────────────────── intake ─────────────────────────────
export type IntakeRow = { id: string; name: string; kind: string; start_date: ISODate; end_date: ISODate | null; course_until?: ISODate | null }

const KIND_ORDER: Record<string, number> = { лекарство: 0, другое: 1, витамин: 2 }

/** One list without headers: medicines → other → vitamins, then by name. Only what is taken now. */
export function intakeList<T extends IntakeRow>(list: readonly T[], today: ISODate): T[] {
  return list.filter((i) => isIntakeActive(i, today)).sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.name.localeCompare(b.name))
}

/** Finished (ended before today), newest end first — the folded archive. */
export function intakeArchive<T extends IntakeRow>(list: readonly T[], today: ISODate): T[] {
  return list.filter((i) => i.end_date !== null && i.end_date < today).sort((a, b) => b.end_date!.localeCompare(a.end_date!))
}

/** «курс до» within 7 days (today included) — a reminder on «Сегодня». */
export const COURSE_WARN_DAYS = 7
export function courseEnding<T extends IntakeRow>(list: readonly T[], today: ISODate): T[] {
  return list.filter((i) => isIntakeActive(i, today) && i.course_until && daysBetween(today, i.course_until) >= 0 && daysBetween(today, i.course_until) <= COURSE_WARN_DAYS)
}

export const TIME_LABEL: Record<string, string> = { morning: 'утро', evening: 'вечер' }

// ───────────────────────────── tasks and visits ─────────────────────────────
export type HealthItem = ItemLike & { id: string; title: string; series_id?: string | null; step?: string | null }
export type SeriesLike = { id: string; kind: string; title: string; cadence: string | null; sort_order: number; archived_at: string | null }

/** The groups of plain tasks: an event passed — «Ждёт ответа»; a target passed — «Просрочено»; the next 2 weeks; later. */
export type TaskGroups<T> = { waiting: T[]; overdue: T[]; soon: T[]; later: T[] }
export const SOON_DAYS = 14

const dateOf = (i: HealthItem): ISODate | null => i.happens_on ?? targetDate(i) ?? i.starts_on ?? null

export function taskGroups<T extends HealthItem>(items: readonly T[], today: ISODate): TaskGroups<T> {
  const out: TaskGroups<T> = { waiting: [], overdue: [], soon: [], later: [] }
  const until = addDaysISO(today, SOON_DAYS - 1)
  for (const i of items) {
    if (!isItemOpen(i)) continue
    if (i.happens_on && i.happens_on < today) out.waiting.push(i) // any event that passed — series ones too
    else if (i.series_id) continue // the rest of a series lives in its line / card
    else {
      const target = targetDate(i)
      if (target && target < today) out.overdue.push(i)
      else {
        const d = dateOf(i)
        if (d && d <= until) out.soon.push(i)
        else out.later.push(i)
      }
    }
  }
  const byDate = (a: T, b: T) => (dateOf(a) ?? '9999').localeCompare(dateOf(b) ?? '9999')
  for (const k of Object.keys(out) as (keyof TaskGroups<T>)[]) out[k].sort(byDate)
  return out
}

/** A repeat in one line: the next dates (open, today or later) and the past ones (done or passed). */
export function repeatLine<T extends HealthItem>(series: SeriesLike, items: readonly T[], today: ISODate) {
  const own = items.filter((i) => i.series_id === series.id && !isItemCancelled(i))
  const next = own.filter((i) => isItemOpen(i) && (dateOf(i) ?? '9999') >= today).sort((a, b) => dateOf(a)!.localeCompare(dateOf(b)!))
  const past = own.filter((i) => isItemDone(i) || (dateOf(i) ?? '9999') < today).sort((a, b) => (dateOf(b) ?? '').localeCompare(dateOf(a) ?? ''))
  return { next, past }
}

export const STEP_ORDER = ['записаться', 'сделать', 'визит', 'анализы', 'результаты'] as const
export type StepState = 'done' | 'current' | 'later' | 'cancelled'

/**
 * A chain of steps (a doctor, body comp): steps in order — by date where there is one, else by the step's place; the
 * first open step is the current one. A cancelled step stays in the history, faded.
 */
export function chainSteps<T extends HealthItem>(series: SeriesLike, items: readonly T[]): { item: T; state: StepState }[] {
  const own = items.filter((i) => i.series_id === series.id)
  const rank = (i: T) => STEP_ORDER.indexOf((i.step ?? 'сделать') as (typeof STEP_ORDER)[number])
  // body comp repeats «записаться → сделать» twice: dates order it; a doctor's undated visit goes by its step
  const sorted = [...own].sort((a, b) => {
    const da = dateOf(a)
    const db = dateOf(b)
    if (da && db && da !== db) return da.localeCompare(db)
    return rank(a) - rank(b)
  })
  let current = false
  return sorted.map((item) => {
    if (isItemCancelled(item)) return { item, state: 'cancelled' as const }
    if (!isItemOpen(item)) return { item, state: 'done' as const }
    if (!current) {
      current = true
      return { item, state: 'current' as const }
    }
    return { item, state: 'later' as const }
  })
}

/** «Замеры» of the day: an open occurrence of a repeat series on the date. */
export function seriesItemOn<T extends HealthItem>(series: readonly SeriesLike[], items: readonly T[], title: string, date: ISODate): T | null {
  const s = series.find((x) => x.title === title && x.kind === 'repeat')
  return (s && items.find((i) => i.series_id === s.id && i.happens_on === date && isItemOpen(i))) || null
}
