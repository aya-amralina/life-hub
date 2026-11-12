import { addDaysISO, daysBetween, formatDayMonth, weekStart, type ISODate } from '../dates'
import { activityPoints, type ActivityLike, type ActivityTypeLike } from './activities'
import { activeHabits, habitsDone, minimumSet, stageForDate, type HabitLog, type StageLike } from './habits'
import { balanceAt, type TxLike } from './money'
import { weekCapacity, type WeekCapacityLike } from './study'

const round1 = (n: number) => Math.round(n * 10) / 10
const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((s, x) => s + x, 0) / xs.length) : null)

export type Period = 'day' | 'week' | 'month'
export type WellbeingLog = { date: ISODate; mood: number | null; energy: number | null; sleep_h: number | null }
export type WellbeingPoint = { key: ISODate; label: string; mood: number | null; energy: number | null; sleep: number | null }

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const monthLabel = (iso: ISODate) => MONTHS[Number(iso.slice(5, 7)) - 1]!

/** Buckets of a chart period: day — the last 14 days, week — the last 13 Mon–Sun weeks, month — the last 6 months (only days ≤ today). */
export function periodBuckets(today: ISODate, period: Period): { key: ISODate; label: string; days: ISODate[] }[] {
  if (period === 'day') {
    return Array.from({ length: 14 }, (_, i) => addDaysISO(today, i - 13)).map((d) => ({ key: d, label: formatDayMonth(d), days: [d] }))
  }
  if (period === 'week') {
    const last = weekStart(today)
    return Array.from({ length: 13 }, (_, i) => addDaysISO(last, (i - 12) * 7)).map((m) => ({
      key: m,
      label: formatDayMonth(m),
      days: Array.from({ length: 7 }, (_, d) => addDaysISO(m, d)).filter((d) => d <= today),
    }))
  }
  const months: ISODate[] = []
  let y = Number(today.slice(0, 4))
  let m = Number(today.slice(5, 7))
  for (let i = 0; i < 6; i++) {
    months.unshift(`${y}-${String(m).padStart(2, '0')}-01`)
    m -= 1
    if (m === 0) {
      m = 12
      y -= 1
    }
  }
  return months.map((first) => {
    const days: ISODate[] = []
    for (let d = first; d.slice(0, 7) === first.slice(0, 7) && d <= today; d = addDaysISO(d, 1)) days.push(d)
    return { key: first, label: monthLabel(first), days }
  })
}

/**
 * Wellbeing chart (SPEC §5): day — values per day (last 14 days), week — averages per Mon–Sun (last 13 weeks),
 * month — averages per month (last 6). Empty days/buckets are null — a gap in the line, never a zero.
 */
export function wellbeingSeries(logs: readonly WellbeingLog[], today: ISODate, period: Period): WellbeingPoint[] {
  const byDate = new Map(logs.map((l) => [l.date, l]))
  return periodBuckets(today, period).map(({ key, label, days }) => {
    const rows = days.map((d) => byDate.get(d)).filter((l): l is WellbeingLog => Boolean(l))
    const pick = (f: (l: WellbeingLog) => number | null) => avg(rows.map(f).filter((v): v is number => v !== null).map(Number))
    return { key, label, mood: pick((l) => l.mood), energy: pick((l) => l.energy), sleep: pick((l) => l.sleep_h) }
  })
}

export type CoffeeLog = { date: ISODate; coffee_cups: number | null; sleep_h: number | null }
export type CoffeePoint = { key: ISODate; label: string; cups: number | null; sleep: number | null }

/**
 * Coffee chart: cups per day (0 — a day without coffee, a real zero; null — not answered, a gap), averages per
 * week / month over the answered days only. Sleep alongside — to compare.
 */
export function coffeeSeries(logs: readonly CoffeeLog[], today: ISODate, period: Period): CoffeePoint[] {
  const byDate = new Map(logs.map((l) => [l.date, l]))
  return periodBuckets(today, period).map(({ key, label, days }) => {
    const rows = days.map((d) => byDate.get(d)).filter((l): l is CoffeeLog => Boolean(l))
    const pick = (f: (l: CoffeeLog) => number | null) => avg(rows.map(f).filter((v): v is number => v !== null).map(Number))
    return { key, label, cups: pick((l) => l.coffee_cups), sleep: pick((l) => l.sleep_h) }
  })
}

/** The last 7 days (today included): cups in total, answered days, days without coffee. */
export function coffeeWeek(logs: readonly CoffeeLog[], today: ISODate): { cups: number; answered: number; without: number } {
  const from = addDaysISO(today, -6)
  const days = logs.filter((l) => l.date >= from && l.date <= today && l.coffee_cups !== null)
  return {
    cups: days.reduce((s, l) => s + Number(l.coffee_cups), 0),
    answered: days.length,
    without: days.filter((l) => Number(l.coffee_cups) === 0).length,
  }
}

export type Band = { from: string; to: string; label: string }

/** «Показать приём»: intake periods as bands over the chart's buckets (no conclusions — only the overlay). */
export function intakeBands(
  intake: readonly { name: string; start_date: ISODate; end_date: ISODate | null }[],
  points: readonly { key: ISODate }[],
  today: ISODate,
): Band[] {
  if (!points.length) return []
  const keys = points.map((p) => p.key)
  const out: Band[] = []
  for (const i of intake) {
    const end = i.end_date ?? today
    const inside = keys.filter((k, idx) => {
      const next = keys[idx + 1] ?? addDaysISO(k, 1)
      return k <= end && next > i.start_date
    })
    if (inside.length) out.push({ from: inside[0]!, to: inside[inside.length - 1]!, label: i.name })
  }
  return out
}

export type GridCell = { key: ISODate; level: number | null; tip: string; current?: boolean; label?: string }

/**
 * Habit calendar like GitHub: 13 weeks × 7 days, column per week. Level = habits counted that day (rule 13/14:
 * a complete minimum day counts fully); future days are null.
 */
export function habitCalendar(logs: readonly Partial<HabitLog>[], stages: readonly StageLike[], today: ISODate): GridCell[] {
  const first = addDaysISO(weekStart(today), -12 * 7)
  const byDate = new Map(logs.map((l) => [l.date, l]))
  const cells: GridCell[] = []
  for (let i = 0; i < 13 * 7; i++) {
    const d = addDaysISO(first, i)
    if (d > today) {
      cells.push({ key: d, level: null, tip: `${formatDayMonth(d)} · впереди` })
      continue
    }
    const stage = stages.length ? stageForDate(stages, d) : null
    const active = activeHabits(stage)
    const done = habitsDone(byDate.get(d), active, minimumSet(stage))
    cells.push({
      key: d,
      level: done,
      current: d === today,
      tip: `${formatDayMonth(d)} · ${done} из ${active.length}${done === 0 ? ' · пропуск — это сигнал, а не провал' : ''}`,
    })
  }
  return cells
}

/** Activity score per week (rule 25) for the last 8 weeks, with the stage target of that week. */
export function activityWeeks(
  activities: readonly ActivityLike[],
  types: readonly ActivityTypeLike[],
  stages: readonly (StageLike & { targets?: unknown })[],
  today: ISODate,
  target: (stage: { targets?: unknown } | null) => number | null,
) {
  const last = weekStart(today)
  return Array.from({ length: 8 }, (_, i) => addDaysISO(last, (i - 7) * 7)).map((monday) => {
    const sunday = addDaysISO(monday, 6)
    const points = round1(
      activities
        .filter((a) => a.date >= monday && a.date <= sunday)
        .reduce((s, a) => s + activityPoints(a.minutes, types.find((t) => t.id === a.type_id)?.points_per_10min ?? 0), 0),
    )
    const stage = stages.length ? stageForDate(stages, monday > today ? today : monday) : null
    return { key: monday, label: formatDayMonth(monday), points, target: target(stage) }
  })
}

/** Reps growth: total reps per training day for one exercise. */
export function repsSeries(sets: readonly { date: ISODate; exercise: string; reps: number[] }[], exercise: string) {
  const byDate = new Map<ISODate, number>()
  for (const s of sets) if (s.exercise === exercise) byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.reps.reduce((a, b) => a + b, 0))
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, reps]) => ({ key, label: formatDayMonth(key), reps }))
}

export type HeatWeek = WeekCapacityLike & { study_week: string | null }

/**
 * Study heat map Н00–Н25 (rule 7, correction П2): level from the week's own capacity — ≤ base «ок» (1),
 * ≤ max «нужен Do/Sa ½» (2), more «перегруз» (3); a week without hours «не спланирована» (null).
 */
export function studyHeatmap(
  items: readonly { sphere: string; week_id: string | null; hours_est: number | null; status: string | null; done_at: string | null }[],
  weeks: readonly HeatWeek[],
  today: ISODate,
): (GridCell & { hours: number })[] {
  const LABEL = ['', 'ок', 'нужен Do/Sa ½', 'перегруз']
  return weeks
    .filter((w) => w.study_week && /^Н\d{2}$/.test(w.study_week))
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .map((w) => {
      const hours = round1(
        items
          .filter((i) => i.sphere === 'study' && i.week_id === w.id && !(i.status === 'снято'))
          .reduce((s, i) => s + (Number(i.hours_est) || 0), 0),
      )
      const cap = weekCapacity(w)
      const level = hours === 0 ? null : hours <= cap.base ? 1 : hours <= cap.max ? 2 : 3
      const current = w.start_date <= today && today <= addDaysISO(w.start_date, 6)
      const when = current ? ' · сейчас' : addDaysISO(w.start_date, 6) < today ? ' · прошла' : ''
      const place = w.place_mode ? ` · ${w.place_mode}` : ''
      const tip =
        level === null
          ? `${w.study_week} · ещё не спланирована`
          : `${w.study_week} · ${String(hours).replace('.', ',')} ч из ${String(cap.base).replace('.', ',')} · ${LABEL[level]}${when}${place}`
      return { key: w.start_date, label: w.study_week!.slice(1), level, tip, current, hours }
    })
}

/** Erfolge per month (bars), from the first month with a record to the current one. */
export function erfolgeByMonth(dates: readonly ISODate[], today: ISODate) {
  if (!dates.length) return []
  const first = [...dates].sort()[0]!.slice(0, 7)
  const out: { key: string; label: string; count: number }[] = []
  for (let m = `${first}-01`; m.slice(0, 7) <= today.slice(0, 7); ) {
    const ym = m.slice(0, 7)
    out.push({ key: ym, label: monthLabel(m), count: dates.filter((d) => d.startsWith(ym)).length })
    const [y, mo] = ym.split('-').map(Number)
    m = mo === 12 ? `${y! + 1}-01-01` : `${y}-${String(mo! + 1).padStart(2, '0')}-01`
  }
  return out
}

/** «Мало данных»: Erfolge need a month of records for the chart (design 3e). */
export function enoughForMonths(dates: readonly ISODate[], today: ISODate): boolean {
  return dates.length > 0 && daysBetween([...dates].sort()[0]!, today) >= 28
}

/**
 * Balance line to 31.12 (design 3k): every `step` days the plan (rule 1/26, planned operations included) and the
 * fact up to today (confirmed only; null after today — the line stops at «сейчас»).
 */
export function balanceLine(txs: readonly TxLike[], from: ISODate, to: ISODate, today: ISODate, step = 3) {
  const out: { key: ISODate; label: string; plan: number; fact: number | null }[] = []
  for (let d = from; d <= to; d = addDaysISO(d, step)) {
    out.push({ key: d, label: formatDayMonth(d), plan: balanceAt(txs, d, 'plan', today) / 100, fact: d <= today ? balanceAt(txs, d, 'fact', today) / 100 : null })
  }
  if (out[out.length - 1]?.key !== to) out.push({ key: to, label: formatDayMonth(to), plan: balanceAt(txs, to, 'plan', today) / 100, fact: null })
  // the «сейчас» point sits exactly on today
  if (today >= from && today <= to && !out.some((p) => p.key === today)) {
    out.push({ key: today, label: formatDayMonth(today), plan: balanceAt(txs, today, 'plan', today) / 100, fact: balanceAt(txs, today, 'fact', today) / 100 })
    out.sort((a, b) => a.key.localeCompare(b.key))
  }
  return out
}

/** Work board by status: counts per status group in board order (open ones only, plus Erledigt of the week). */
export function statusCounts(items: readonly { status: string | null; done_at: string | null; type: string | null }[], statuses: readonly string[]) {
  return statuses.map((s) => ({ key: s, label: s, count: items.filter((i) => (i.status ?? 'Offen') === s && i.type !== 'Erfolg').length })).filter((x) => x.count > 0)
}

