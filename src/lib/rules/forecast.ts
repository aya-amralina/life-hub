import { WEEK_CATEGORIES } from '../constants'
import { addDaysISO, daysBetween, endOfMonthISO, weekStart, type ISODate } from '../dates'
import { toCents } from '../format'
import { accountBalanceAt, accountsStart, balanceView, goalAccountNow, groupDelta, groupOfAccount, type AccTx, type AccountLike } from './accounts'
import { debtSummary, envelopeSummary, forecastEnd, isFact, isInPlan, isWeekRow, signedCents, spentLifeInWeek, type DebtLike, type MonthRow } from './money'

/**
 * The forecast of «Деньги» (stage 2, decision 16.11.2026 and 18.11.2026): «Баланс» from the start by accounts to the
 * horizon in three scenarios, its lowest day, «Свободно до …», goals and the pace of the week. Only numbers and dates —
 * no reasons, no advice (SPEC §8). Variable spending is only group «Жизнь»; everything else comes from the plan and
 * the recurring rules (virtual occurrences are in `txs`).
 */

export type Scenario = 'plan' | 'tempo' | 'careful'
export const SCENARIOS: readonly Scenario[] = ['plan', 'tempo', 'careful']
/** Full weeks the tempo looks at, and how many of them need data. */
export const TEMPO_WEEKS = 4
export const TEMPO_MIN_WEEKS = 3
/** The pace of the week shows from Wednesday (day 3) to Saturday. */
export const WEEK_PACE_FROM_DAY = 3
/** A goal's pace needs this much history. */
export const GOAL_PACE_MIN_DAYS = 14
/** Days in an average month, for «в месяц». */
const MONTH_DAYS = 365.25 / 12

/** The limits of a week, summed over the six categories. */
export type WeekLimitSum = { monday: ISODate; limitCents: number }

const isWeekCategory = (c: string | null) => c !== null && (WEEK_CATEGORIES as readonly string[]).includes(c)

/**
 * What «Жизнь» cost in a Mon–Sun week (fact): the week's total («итог недели», rule 26) if there is one, else the
 * app's expenses with a weekly category, without envelopes. Null — no data that week.
 */
export function lifeWeekFact(txs: readonly AccTx[], monday: ISODate): number | null {
  const sunday = addDaysISO(monday, 6)
  const inWeek = txs.filter((t) => t.date >= monday && t.date <= sunday && t.kind === 'expense' && isFact(t))
  const totals = inWeek.filter((t) => t.entry_kind === 'week_total')
  if (totals.length) return totals.reduce((s, t) => s + toCents(t.amount_eur), 0)
  const quick = inWeek.filter((t) => !isWeekRow(t) && isWeekCategory(t.category) && t.envelope_id === null)
  return quick.length ? quick.reduce((s, t) => s + toCents(t.amount_eur), 0) : null
}

export type Tempo = { weeklyCents: number | null; weeks: { monday: ISODate; cents: number | null }[]; enough: boolean }

/** The tempo: the median of «Жизнь» over the last 4 full weeks before today's; fewer than 3 weeks with data — not enough. */
export function lifeTempo(txs: readonly AccTx[], today: ISODate): Tempo {
  const monday = weekStart(today)
  const weeks = Array.from({ length: TEMPO_WEEKS }, (_, i) => addDaysISO(monday, -7 * (i + 1))).map((m) => ({ monday: m, cents: lifeWeekFact(txs, m) }))
  const values = weeks.map((w) => w.cents).filter((c): c is number => c !== null).sort((a, b) => a - b)
  const n = values.length
  const weeklyCents = n === 0 ? null : n % 2 ? values[(n - 1) / 2]! : Math.round((values[n / 2 - 1]! + values[n / 2]!) / 2)
  return { weeklyCents, weeks, enough: n >= TEMPO_MIN_WEEKS }
}

/**
 * «Жизнь» by plan for a week: its budget row («бюджет недели», rule 26) if there is one, else the sum of its limits;
 * after the last week with limits — the average sum of the last 4 weeks with limits above zero (a week of zeros is a
 * plan of its own, not the usual pace).
 */
export function lifePlanWeeks(txs: readonly AccTx[], limits: readonly WeekLimitSum[]): (monday: ISODate) => number {
  const budget = new Map<ISODate, number>()
  for (const t of txs) {
    if (t.entry_kind !== 'week_budget' || t.cancelled_at || isFact(t)) continue
    const m = weekStart(t.date)
    budget.set(m, (budget.get(m) ?? 0) + toCents(t.amount_eur))
  }
  const byWeek = new Map(limits.map((l) => [l.monday, l.limitCents]))
  const last = limits.reduce<ISODate | null>((m, l) => (m === null || l.monday > m ? l.monday : m), null)
  const recent = [...limits].filter((l) => l.limitCents > 0).sort((a, b) => a.monday.localeCompare(b.monday)).slice(-4)
  const average = recent.length ? Math.round(recent.reduce((s, l) => s + l.limitCents, 0) / recent.length) : 0
  return (monday) => budget.get(monday) ?? (last !== null && monday <= last ? (byWeek.get(monday) ?? average) : average)
}

/** «Жизнь» spread over the days (a week's sum by days, what is left of the current week over its days from today). */
function lifeByDay(weekly: (m: ISODate) => number, spentThisWeek: number, today: ISODate) {
  const monday = weekStart(today)
  const leftDays = daysBetween(today, addDaysISO(monday, 6)) + 1
  return (d: ISODate) => {
    const m = weekStart(d)
    return m === monday ? Math.max(0, weekly(m) - spentThisWeek) / leftDays : weekly(m) / 7
  }
}

/** A day of the forecast, cents; `lifePlan` — «Жизнь» by plan from today through that day (for «Месяцы»). */
export type ForecastDay = { date: ISODate; plan: number; tempo: number | null; careful: number | null; lifePlan: number }
export type ScenarioResult = { endCents: number; pit: { date: ISODate; cents: number } }

/** The lowest day of a series; the earliest of equal ones. */
export function lowestPoint(days: readonly { date: ISODate; cents: number }[]): { date: ISODate; cents: number } {
  return days.reduce((low, d) => (d.cents < low.cents ? d : low), days[0]!)
}

/**
 * The forecast of «Баланс» from today to the horizon: the fact now plus planned operations waiting for an answer
 * (their day has come), then day by day the plan and the recurring rules as they change «Баланс» (a transfer to
 * «Подушка» is a minus, the deposit's pair «Депозит → Основной + вернуть» is zero), and «Жизнь» by scenario:
 * by plan (budget rows, limits, their average), by tempo (the median), careful (the larger of the two each week).
 * Week rows of the plan are replaced, never added to. Too few weeks for the tempo — «по темпу» and «осторожный» are null.
 * Before a start by accounts the common pot counts, as everywhere.
 */
export function forecast(i: { txs: readonly AccTx[]; accounts: readonly AccountLike[]; limits: readonly WeekLimitSum[]; today: ISODate; end?: ISODate }) {
  const { txs, accounts, today } = i
  const end = i.end ?? forecastEnd(today)
  const view = balanceView(txs, accounts, today)
  const groupOf = groupOfAccount(accounts)
  const delta = (t: AccTx) => (view.start ? groupDelta(t, groupOf, 'balance') : signedCents(t))
  const planned = (t: AccTx) => t.is_planned && t.confirmed_at === null && !t.cancelled_at && !isWeekRow(t) && t.kind !== 'opening' && (view.start === null || t.date > view.start)
  const nowCents = view.at(today, 'fact')
  const pendingCents = txs.filter((t) => planned(t) && t.date <= today).reduce((s, t) => s + delta(t), 0)
  const byDate = new Map<ISODate, number>()
  for (const t of txs) if (planned(t) && t.date > today && t.date <= end) byDate.set(t.date, (byDate.get(t.date) ?? 0) + delta(t))
  const tempo = lifeTempo(txs, today)
  const plan = lifePlanWeeks(txs, i.limits)
  const spent = spentLifeInWeek(txs, weekStart(today))
  const weekly: Record<Scenario, ((m: ISODate) => number) | null> = {
    plan,
    tempo: tempo.enough ? () => tempo.weeklyCents! : null,
    careful: tempo.enough ? (m) => Math.max(plan(m), tempo.weeklyCents!) : null,
  }
  const lifeDay = Object.fromEntries(SCENARIOS.map((s) => [s, weekly[s] ? lifeByDay(weekly[s], spent, today) : null])) as Record<Scenario, ((d: ISODate) => number) | null>
  const days: ForecastDay[] = []
  let base = nowCents + pendingCents
  const life: Record<Scenario, number> = { plan: 0, tempo: 0, careful: 0 }
  for (let d = today; d <= end; d = addDaysISO(d, 1)) {
    base += byDate.get(d) ?? 0
    const at = (s: Scenario) => {
      const f = lifeDay[s]
      if (!f) return null
      life[s] += f(d)
      return base - Math.round(life[s])
    }
    const planCents = at('plan')!
    days.push({ date: d, plan: planCents, tempo: at('tempo'), careful: at('careful'), lifePlan: Math.round(life.plan) })
  }
  const result = (s: Scenario): ScenarioResult | null => {
    if (!weekly[s]) return null
    const series = days.map((d) => ({ date: d.date, cents: d[s]! }))
    return { endCents: series[series.length - 1]!.cents, pit: lowestPoint(series) }
  }
  return {
    start: view.start,
    end,
    nowCents,
    pendingCents,
    tempo,
    planWeekly: plan,
    days,
    scenarios: { plan: result('plan'), tempo: result('tempo'), careful: result('careful') } as Record<Scenario, ScenarioResult | null>,
  }
}
export type Forecast = ReturnType<typeof forecast>

export type ReserveEnvelope = { id: string; name: string; type: string; archived: boolean; account_id: string | null; planned_eur: number | null }
export type ReserveDebt = DebtLike & { who: string; account_id: string | null }

/**
 * «Свободно до {дата}»: the next planned income into «Баланс» (none up to the horizon — the horizon); the days before it.
 * = the fact now − what leaves «Баланс» by plan in those days (planned waiting for an answer included) + planned
 * transfers into «Баланс» − «Жизнь» by plan in those days (what is left of this week, the share of a partial week) −
 * what is set aside on «Баланс»: envelopes (what is left of them) and debts to pay back on its accounts — goals live on
 * «Подушка». A planned expense of such an envelope or debt is inside its reserve, never twice: the reserve is the larger
 * of what is left and what is planned from it in those days. Below zero — as is.
 */
export function freeUntil(i: {
  txs: readonly AccTx[]
  accounts: readonly AccountLike[]
  limits: readonly WeekLimitSum[]
  envelopes: readonly ReserveEnvelope[]
  debts: readonly ReserveDebt[]
  today: ISODate
  end?: ISODate
}) {
  const { txs, accounts, today } = i
  const end = i.end ?? forecastEnd(today)
  const view = balanceView(txs, accounts, today)
  const groupOf = groupOfAccount(accounts)
  const delta = (t: AccTx) => (view.start ? groupDelta(t, groupOf, 'balance') : signedCents(t))
  const planned = (t: AccTx) => t.is_planned && t.confirmed_at === null && !t.cancelled_at && !isWeekRow(t) && t.kind !== 'opening' && (view.start === null || t.date > view.start)
  const until = txs.filter((t) => planned(t) && t.kind === 'income' && t.date > today && t.date <= end && delta(t) > 0).reduce<ISODate | null>((m, t) => (m === null || t.date < m ? t.date : m), null)
  const windowEnd = until ? addDaysISO(until, -1) : end
  const inWindow = txs.filter((t) => planned(t) && t.date <= windowEnd)
  // what is set aside on «Баланс» (an envelope or a debt without an account counts as «Баланс»)
  const onBalance = (accountId: string | null) => groupOf(accountId) === 'balance'
  const envelopes = i.envelopes.filter((e) => !e.archived && e.type === 'envelope' && onBalance(e.account_id))
  const debts = i.debts.filter((d) => d.direction === 'i_owe' && d.status === 'open' && onBalance(d.account_id))
  const reserved = new Set<AccTx>()
  let reservedCents = 0
  for (const e of envelopes) {
    const rows = inWindow.filter((t) => t.kind === 'expense' && t.envelope_id === e.id)
    rows.forEach((t) => reserved.add(t))
    reservedCents += Math.max(envelopeSummary(e, txs).leftCents, rows.reduce((s, t) => s + toCents(t.amount_eur), 0))
  }
  for (const d of debts) {
    const rows = inWindow.filter((t) => t.kind === 'expense' && (t as AccTx & { debt_id?: string | null }).debt_id === d.id)
    rows.forEach((t) => reserved.add(t))
    reservedCents += Math.max(debtSummary(d, txs).leftCents, rows.reduce((s, t) => s + toCents(t.amount_eur), 0))
  }
  const covered = (t: AccTx) => reserved.has(t)
  const outCents = inWindow.filter((t) => !covered(t) && delta(t) < 0).reduce((s, t) => s - delta(t), 0)
  const inCents = inWindow.filter((t) => t.kind === 'transfer' && delta(t) > 0).reduce((s, t) => s + delta(t), 0)
  const plan = lifePlanWeeks(txs, i.limits)
  const lifeDay = lifeByDay(plan, spentLifeInWeek(txs, weekStart(today)), today)
  let life = 0
  for (let d = today; d <= windowEnd; d = addDaysISO(d, 1)) life += lifeDay(d)
  const lifeCents = Math.round(life)
  const nowCents = view.at(today, 'fact')
  return { until, windowEnd, cents: nowCents - outCents + inCents - lifeCents - reservedCents, parts: { nowCents, outCents, inCents, lifeCents, reservedCents } }
}

export type GoalPace = { perMonthCents: number; closesOn: ISODate } | 'none' | 'not_growing'

/**
 * A goal with a due date: what is left, how much a month to make it (less than a month to go — only what is left),
 * and when it closes at the current pace. Now — the account's balance when the goal is alone on it, else its latest
 * share. The pace: alone on its account — the account since the start by accounts; a share — its first and latest
 * rows of «Остатки»; at least 14 days of history, else «none»; not growing — «not_growing». Reached or no target — null.
 */
export function goalForecast(
  goal: { id: string; type: string; archived: boolean; account_id: string | null; goal_eur: number | string | null; goal_date: ISODate | null },
  i: {
    goals: readonly { id: string; type: string; archived: boolean; account_id: string | null }[]
    accounts: readonly AccountLike[]
    txs: readonly AccTx[]
    balances: readonly { date: ISODate; envelope_id: string | null; amount_eur: number | string }[]
    today: ISODate
  },
) {
  if (goal.goal_eur === null) return null
  const targetCents = toCents(goal.goal_eur)
  const own = goalAccountNow(goal, i.goals, i.accounts, i.txs, i.today)
  const shares = i.balances.filter((b) => b.envelope_id === goal.id && b.date <= i.today).sort((a, b) => a.date.localeCompare(b.date))
  const nowCents = own ? own.cents : shares.length ? toCents(shares[shares.length - 1]!.amount_eur) : 0
  const leftCents = targetCents - nowCents
  if (leftCents <= 0) return null
  const due = goal.goal_date
  const daysLeft = due && due > i.today ? daysBetween(i.today, due) : null
  const perMonthCents = daysLeft !== null && daysLeft >= MONTH_DAYS ? Math.round(leftCents / (daysLeft / MONTH_DAYS)) : null
  // the pace: the change per day over at least two weeks
  let from: { date: ISODate; cents: number } | null = null
  const start = accountsStart(i.txs)
  if (own && start) from = { date: start, cents: accountBalanceAt(i.txs, own.account.id, start) ?? 0 }
  else if (!own && shares.length >= 2) from = { date: shares[0]!.date, cents: toCents(shares[0]!.amount_eur) }
  const to = own ? i.today : shares.length ? shares[shares.length - 1]!.date : null
  let pace: GoalPace = 'none'
  if (from && to && daysBetween(from.date, to) >= GOAL_PACE_MIN_DAYS) {
    const perDay = (nowCents - from.cents) / daysBetween(from.date, to)
    pace = perDay <= 0 ? 'not_growing' : { perMonthCents: Math.round(perDay * MONTH_DAYS), closesOn: addDaysISO(to, Math.ceil(leftCents / perDay)) }
  }
  return { nowCents, targetCents, leftCents, due, perMonthCents, pace }
}

/**
 * The pace of the week: «при таком темпе к воскресенью ≈ X € из лимита Y €» — linear by the days gone (Monday = 1,
 * today included). From Wednesday to Saturday, with limits and something spent; otherwise null.
 */
export function weekPace(spentCents: number, limitCents: number, monday: ISODate, today: ISODate): { projectedCents: number; limitCents: number } | null {
  const day = daysBetween(monday, today) + 1
  if (day < WEEK_PACE_FROM_DAY || day > 6 || limitCents <= 0 || spentCents <= 0) return null
  return { projectedCents: Math.round((spentCents * 7) / day), limitCents }
}

/**
 * «Месяцы» with the forecast (decision 18.11.2026): from today's month on, «На конец» is the scenario «по плану» on the
 * month's last day (the horizon at most), and «Расход» has «Жизнь» by plan for the days from today instead of the week
 * budget rows of the plan. Months before today — as they were.
 */
export function forecastMonths(rows: readonly MonthRow[], f: Forecast, txs: readonly AccTx[]): MonthRow[] {
  const first = f.days[0]!.date
  const dayOf = new Map(f.days.map((d) => [d.date, d]))
  return rows.map((r) => {
    const last = endOfMonthISO(`${r.month}-01`)
    if (last < first) return r
    const upTo = last < f.end ? last : f.end
    const end = dayOf.get(upTo)
    if (!end) return r
    // «Жизнь» by plan through the day before the month (0 when the month holds today)
    const before = dayOf.get(addDaysISO(`${r.month}-01`, -1))?.lifePlan ?? 0
    const budgets = txs
      .filter((t) => t.entry_kind === 'week_budget' && isInPlan(t) && !isFact(t) && t.date.startsWith(r.month))
      .reduce((s, t) => s + toCents(t.amount_eur), 0)
    return { ...r, endCents: end.plan, expenseCents: r.expenseCents - budgets + end.lifePlan - before }
  })
}
