import type { Sphere } from '../constants'
import { addDaysISO, weekStart, type ISODate } from '../dates'
import { isItemOpen } from './items'

export type CalendarFilter = Sphere | 'intake'
export const DEFAULT_FILTERS: readonly CalendarFilter[] = ['money', 'work', 'study', 'body', 'personal']

export type CalendarEvent = {
  date: ISODate
  sphere: Sphere
  kind: 'due' | 'day' | 'start' | 'money'
  title: string
  time: string | null
  itemId?: string
  amountCents?: number
  done: boolean
}

export type CalendarItem = {
  id: string
  sphere: string
  title: string
  status: string | null
  done_at: string | null
  due_date: string | null
  due_time: string | null
  starts_on?: string | null
  happens_on?: string | null
  happens_time?: string | null
}

export type CalendarTx = { id: string; date: ISODate; title: string; amount_eur: number; kind: string; is_planned: boolean; cancelled_at?: string | null }

const asSphere = (s: string): Sphere => (['money', 'work', 'study', 'body', 'personal'].includes(s) ? (s as Sphere) : 'personal')
const t5 = (t: string | null | undefined) => (t ? t.slice(0, 5) : null)

/**
 * Calendar events (SPEC §5 «Календарь»): items with a deadline, a day or a start («начало»), planned money
 * operations (not cancelled). Cancelled items are left out; done ones stay, marked. Sorted by date and time.
 */
export function calendarEvents(items: readonly CalendarItem[], txs: readonly CalendarTx[], filters: readonly CalendarFilter[]): CalendarEvent[] {
  const on = new Set(filters)
  const out: CalendarEvent[] = []
  for (const i of items) {
    const sphere = asSphere(i.sphere)
    if (!on.has(sphere)) continue
    const done = !isItemOpen(i)
    if (done && i.status && ['снято', 'Отменено', 'Verworfen'].includes(i.status)) continue
    const base = { sphere, title: i.title, itemId: i.id, done }
    if (i.happens_on) out.push({ ...base, date: i.happens_on, kind: 'day', time: t5(i.happens_time) })
    if (i.starts_on) out.push({ ...base, date: i.starts_on, kind: 'start', time: null })
    if (i.due_date) out.push({ ...base, date: i.due_date, kind: 'due', time: t5(i.due_time) })
  }
  if (on.has('money')) {
    for (const t of txs) {
      if (!t.is_planned || t.cancelled_at || t.kind === 'opening') continue
      const sign = t.kind === 'income' ? 1 : t.kind === 'expense' ? -1 : 0
      out.push({ date: t.date, sphere: 'money', kind: 'money', title: t.title, time: null, amountCents: Math.round(Number(t.amount_eur) * 100) * sign, done: false })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title))
}

export type CalendarBand = { from: ISODate; to: ISODate; label: string; kind: 'place' | 'stage' | 'intake' }

/**
 * Bands over the days: places of weeks (consecutive weeks with the same place merge), glow-up stages, intake
 * periods (only with the «Приём» filter, off by default).
 */
export function calendarBands(
  weeks: readonly { start_date: ISODate; place_mode: string | null }[],
  stages: readonly { name: string; start_date: ISODate; end_date: ISODate; sphere: string }[],
  intake: readonly { name: string; start_date: ISODate; end_date: ISODate | null }[],
  filters: readonly CalendarFilter[],
  today: ISODate,
): CalendarBand[] {
  const out: CalendarBand[] = []
  let cur: CalendarBand | null = null
  for (const w of [...weeks].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
    const place = w.place_mode?.trim()
    const end = addDaysISO(w.start_date, 6)
    if (place && cur && cur.label === place && addDaysISO(cur.to, 1) === w.start_date) cur.to = end
    else if (place) out.push((cur = { from: w.start_date, to: end, label: place, kind: 'place' }))
    else cur = null
  }
  if (filters.includes('body')) for (const s of stages) if (s.sphere === 'body') out.push({ from: s.start_date, to: s.end_date, label: s.name, kind: 'stage' })
  if (filters.includes('intake')) for (const i of intake) out.push({ from: i.start_date, to: i.end_date ?? today, label: i.name, kind: 'intake' })
  return out
}

/** Month grid Mon–Sun: rows of 7 ISO dates covering the month (leading/trailing days of other months included). */
export function monthGrid(month: string): ISODate[][] {
  const first = `${month}-01`
  const rows: ISODate[][] = []
  for (let d = weekStart(first); d.slice(0, 7) <= month || rows.length === 0; d = addDaysISO(d, 7)) {
    if (d.slice(0, 7) > month) break
    rows.push(Array.from({ length: 7 }, (_, i) => addDaysISO(d, i)))
  }
  return rows
}

/** Bands that touch a day (for a month cell or a week row). */
export function bandsOn(bands: readonly CalendarBand[], day: ISODate): CalendarBand[] {
  return bands.filter((b) => b.from <= day && day <= b.to)
}

/** Filters from localStorage (unknown values dropped); the default — all spheres, intake off. */
export function parseFilters(raw: string | null): CalendarFilter[] {
  try {
    const v = JSON.parse(raw ?? '')
    if (Array.isArray(v)) {
      const ok = v.filter((x): x is CalendarFilter => [...DEFAULT_FILTERS, 'intake'].includes(x))
      if (ok.length) return ok
    }
  } catch {
    // fall through to the default
  }
  return [...DEFAULT_FILTERS]
}
