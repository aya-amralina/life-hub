import { WEEK_CATEGORIES, type WeekCategory } from '../constants'
import { addDaysISO, addMonthsISO, daysBetween, weekStart, type ISODate } from '../dates'
import { toCents } from '../format'
import { balanceView, groupDelta, groupOfAccount, type AccTx, type AccountLike } from './accounts'
import { lifePlanCents, type WeekLimitSum } from './forecast'
import { periodMonthOf, type Month } from './periods'
import { isPlannedOperation, itemReserve, plannedItems, type PlanDebt, type PlanEnvelope, type PlanTx } from './plan'
import { planPeriods, type PeriodLine } from './planPeriods'

/**
 * «День денег» (docs/money-redesign.md, phase 6; decisions 20.11.2026). The salary came: what it covers in the new
 * period and what is left to live on, and the week limit that comes out of it.
 *
 *   пришло + ещё придёт в периоде + осталось с прошлого периода
 *   − регулярные − траты периода − в копилки − долги = на жизнь  →  в неделю
 *
 * «Осталось с прошлого периода» — what is on «Баланс» now, minus what the old period still holds (its open items that
 * set money aside, items set aside early, planned operations before the new period) and «Жизнь» by plan up to it. The
 * salary is counted with the amount and the day it really came; that day starts the new period (rule 35а).
 * Confirming writes the salary and the limits of the period's weeks after this one, split by categories in the shares
 * of the latest limits.
 */

export type PaydayInput = {
  envelopes: readonly PlanEnvelope[]
  debts: readonly PlanDebt[]
  txs: readonly (AccTx & PlanTx)[]
  accounts: readonly AccountLike[]
  limits: readonly WeekLimitSum[]
  today: ISODate
  paydays: readonly ISODate[]
  /** the salary's occurrence (virtual or stored), not answered yet */
  salary: AccTx & PlanTx & { id: string }
  /** what came, cents (default — the plan's amount) */
  incomeCents: number
  /** the day it came (default — the plan's day; earlier or later when it really came so) */
  arrived: ISODate
}

export type PaydayPlan = {
  month: Month
  start: ISODate
  end: ISODate
  incomeCents: number
  /** other income into «Баланс» planned in the period (Landeshauptkasse) */
  moreIncomeCents: number
  leftoverCents: number
  recurringCents: number
  spendCents: number
  toGoalCents: number
  debtCents: number
  lifeCents: number
  /** days of the period from the later of today and its start */
  days: number
  perWeekCents: number
  /** the Mondays whose limits the confirmation writes: the weeks of the period after the current one */
  mondays: ISODate[]
  /** the new period's line of «План» (its items for the list) */
  line: PeriodLine
}

export function paydayPlan(i: PaydayInput): PaydayPlan {
  const { today } = i
  // the salary as it really came: its amount and day; the day of money moves with it
  const txs = i.txs.map((t) => (t === i.salary ? { ...t, date: i.arrived, amount_eur: i.incomeCents / 100 } : t))
  const paydays = [...new Set(i.paydays.map((d) => (d === i.salary.date ? i.arrived : d)))].sort()
  const month = periodMonthOf(i.arrived)
  const view = balanceView(txs, i.accounts, today)
  const groupOf = groupOfAccount(i.accounts)
  const items = plannedItems({ envelopes: i.envelopes, debts: i.debts, txs, accounts: i.accounts, start: view.start, today, paydays })
  const before = addMonthsISO(`${month}-01`, -1).slice(0, 7)
  const [, line] = planPeriods({ items, txs, accounts: i.accounts, limits: i.limits, start: view.start, today, paydays, currentMonth: before, count: 2 })
  const start = line!.start
  const end = line!.end
  const onBalance = (id: string | null) => groupOf(id) === 'balance'

  // what the old period still holds: before the new period starts
  const old = txs.filter((t) => isPlannedOperation(t, view.start) && t.date < start)
  let heldCents = 0
  const covered = new Set<AccTx>()
  for (const it of items) {
    if (it.counts !== 'reserve' || !onBalance(it.accountId)) continue
    // the new period's own items are counted in its lines, not here (unless set aside early)
    if (it.month === month && !it.reservedEarly) continue
    const r = itemReserve(it, old)
    r.covers.forEach((t) => covered.add(t))
    heldCents += r.cents
  }
  const delta = (t: AccTx) => groupDelta(t, groupOf, 'balance')
  const outBefore = old.filter((t) => !covered.has(t) && t !== i.salary && delta(t) < 0).reduce((s, t) => s - delta(t), 0)
  const inBefore = old.filter((t) => t.kind === 'transfer' && delta(t) > 0).reduce((s, t) => s + delta(t), 0)
  const lifeBefore = start > today ? lifePlanCents(txs, i.limits, today, today, addDaysISO(start, -1)) : 0
  const leftoverCents = view.at(today, 'fact') - heldCents - outBefore + inBefore - lifeBefore

  const salaryIn = start <= i.arrived && i.arrived <= end ? i.incomeCents : 0
  const moreIncomeCents = line!.incomeCents - salaryIn
  const lifeCents = i.incomeCents + moreIncomeCents + leftoverCents - line!.recurringCents - line!.spendCents - line!.toGoalCents - line!.debtCents
  const from = start > today ? start : today
  const days = Math.max(1, daysBetween(from, end) + 1)
  const mondays: ISODate[] = []
  for (let m = addDaysISO(weekStart(today), 7); m <= end; m = addDaysISO(m, 7)) mondays.push(m)
  return {
    month,
    start,
    end,
    incomeCents: i.incomeCents,
    moreIncomeCents,
    leftoverCents,
    recurringCents: line!.recurringCents,
    spendCents: line!.spendCents,
    toGoalCents: line!.toGoalCents,
    debtCents: line!.debtCents,
    lifeCents,
    days,
    // whole euros, down: a limit of 94 €, not 94,37 €
    perWeekCents: lifeCents <= 0 ? 0 : Math.floor((lifeCents * 7) / days / 100) * 100,
    mondays,
    line: line!,
  }
}

/**
 * A week's total split by categories in the shares of `base` (the latest week's limits), whole euros: each share
 * rounded down, what is left of the total goes to the largest category. Without a base — null (nothing to split by).
 */
export function splitWeekLimit(totalCents: number, base: Partial<Record<WeekCategory, number>>): Record<WeekCategory, number> | null {
  const cats = WEEK_CATEGORIES.filter((c) => (base[c] ?? 0) > 0)
  const sum = cats.reduce((s, c) => s + base[c]!, 0)
  if (!cats.length || sum <= 0) return null
  const euros = Math.floor(totalCents / 100)
  const out = Object.fromEntries(WEEK_CATEGORIES.map((c) => [c, 0])) as Record<WeekCategory, number>
  let given = 0
  for (const c of cats) {
    const e = Math.floor((euros * base[c]!) / sum)
    out[c] = e * 100
    given += e
  }
  const largest = cats.reduce((a, b) => (base[b]! > base[a]! ? b : a))
  out[largest] += (euros - given) * 100
  return out
}

/** The categories of a week's limit rows, cents. */
export function limitsByCategory(rows: readonly { category: string; limit_eur: number | string }[]): Partial<Record<WeekCategory, number>> {
  const out: Partial<Record<WeekCategory, number>> = {}
  for (const r of rows) if ((WEEK_CATEGORIES as readonly string[]).includes(r.category)) out[r.category as WeekCategory] = toCents(r.limit_eur)
  return out
}
