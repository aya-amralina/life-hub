import { addDaysISO, parseISODate, weekStart, type ISODate } from '../dates'
import { isItemOpen } from './items'

export const REVIEW_STEPS = ['money', 'body', 'study', 'work', 'ahead'] as const
export type ReviewStep = (typeof REVIEW_STEPS)[number]
export const STEP_LABEL: Record<ReviewStep, string> = { money: 'Деньги', body: 'Тело', study: 'Учёба', work: 'Работа', ahead: 'Вперёд' }

/**
 * The week the Sunday review closes: on Saturday and Sunday — this week; on other days — the week that just
 * ended (the review can be done late on Monday or later).
 */
export function reviewWeek(today: ISODate): ISODate {
  const dow = parseISODate(today).getDay() // 0 Sun … 6 Sat
  return dow === 0 || dow === 6 ? weekStart(today) : addDaysISO(weekStart(today), -7)
}

/** The review card on «Сегодня»: from Saturday until the week's review is completed (shown through Monday). */
export function reviewDue(today: ISODate, completedForWeek: boolean): boolean {
  const dow = parseISODate(today).getDay()
  return !completedForWeek && (dow === 0 || dow === 6 || dow === 1)
}

export type SplitSource = { id: string; title: string; sphere: string; area: string | null; type: string | null; hours_est: number | null; week_id: string | null }

/**
 * «Разбить» for a stuck item (rule 22): two steps with half the hours each in the same week, the original is
 * taken off («снято»). Steps start fresh (rollover_count 0).
 */
export function splitItem(item: SplitSource) {
  const half = item.hours_est ? Math.round((Number(item.hours_est) / 2) * 2) / 2 : null
  const part = (n: number) => ({
    sphere: item.sphere,
    title: `${item.title} · шаг ${n}`,
    area: item.area,
    type: item.type,
    hours_est: half,
    week_id: item.week_id,
    status: 'открыто',
    rollover_count: 0,
  })
  return { create: [part(1), part(2)], close: { id: item.id, patch: { status: 'снято' } } }
}

export type AgendaItem = { id: string; sphere: string; title: string; status: string | null; done_at: string | null; due_date: string | null; happens_on?: string | null; starts_on?: string | null }

/** «Неделя вперёд»: open items with a deadline, a day or a start within next Mon–Sun, by date. */
export function nextWeekAgenda<T extends AgendaItem>(items: readonly T[], monday: ISODate): { item: T; date: ISODate; kind: 'due' | 'day' | 'start' }[] {
  const sunday = addDaysISO(monday, 6)
  const out: { item: T; date: ISODate; kind: 'due' | 'day' | 'start' }[] = []
  for (const i of items) {
    if (!isItemOpen(i)) continue
    const inside = (d: string | null | undefined) => d != null && d >= monday && d <= sunday
    if (inside(i.happens_on)) out.push({ item: i, date: i.happens_on!, kind: 'day' })
    else if (inside(i.due_date)) out.push({ item: i, date: i.due_date!, kind: 'due' })
    else if (inside(i.starts_on)) out.push({ item: i, date: i.starts_on!, kind: 'start' })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
