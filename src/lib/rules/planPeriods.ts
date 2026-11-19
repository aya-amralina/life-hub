import { addDaysISO, addMonthsISO, daysBetween, weekStart, type ISODate } from '../dates'
import { groupDelta, groupOfAccount, type AccTx, type AccountLike } from './accounts'
import { lifePlanWeeks, type WeekLimitSum } from './forecast'
import { periodStart, type Month } from './periods'
import { isPlannedOperation, itemReserve, type PlannedItem, type PlanTx } from './plan'

/**
 * The screen «План» (docs/money-redesign.md, phase 3): today's period and the next ones, each with what comes in and what
 * leaves «Баланс», and what is left to live on:
 *
 *   поступления − регулярные − запланированные траты − в копилки − возврат долгов = на жизнь
 *
 * Only money of «Баланс» counts (an item on «Депозит» or «Поездки» is listed, but its money is already there). An item
 * set aside early is paid from today's money and not from its period's. «На жизнь» below zero — «не сходится на X».
 * Today's period is told by «Свободно до …» instead (its money is the balance now, not the income).
 */

export type PeriodLine = {
  month: Month
  start: ISODate
  /** the last day: the day before the next period's start */
  end: ISODate
  current: boolean
  incomeCents: number
  recurringCents: number
  spendCents: number
  toGoalCents: number
  debtCents: number
  /** income − everything that leaves; null for today's period */
  lifeCents: number | null
  /** «на жизнь» spread over the period's weeks */
  perWeekCents: number | null
  /** the week limit by plan (rule 34), the average over the period's weeks */
  limitWeekCents: number | null
  /** > 0 — «не сходится на X» */
  shortCents: number
  /** open items of the period, by date (items without a date last) */
  recurring: PlannedItem[]
  items: PlannedItem[]
  /** items listed here whose money is not taken from this period's «Баланс» (another account, set aside early) */
  apart: Set<string>
}

const isOpen = (i: PlannedItem) => i.status !== 'done'

/** Sort: items with a date by date, then the rest by title. */
function byDate(a: PlannedItem, b: PlannedItem): number {
  if (a.date && b.date) return a.date.localeCompare(b.date) || a.title.localeCompare(b.title)
  if (a.date) return -1
  if (b.date) return 1
  return a.title.localeCompare(b.title)
}

/**
 * Today's period and `count − 1` next ones. `txs` — the plan with recurring occurrences, `limits` — the week limits
 * (for «в неделю» against the limit), `start` — the start by accounts.
 */
export function planPeriods(i: {
  items: readonly PlannedItem[]
  txs: readonly (AccTx & PlanTx)[]
  accounts: readonly AccountLike[]
  limits: readonly WeekLimitSum[]
  start: ISODate | null
  today: ISODate
  paydays: readonly ISODate[]
  currentMonth: Month
  count?: number
}): PeriodLine[] {
  const groupOf = groupOfAccount(i.accounts)
  const onBalance = (id: string | null) => groupOf(id) === 'balance'
  const planWeek = lifePlanWeeks(i.txs, i.limits)
  const months = Array.from({ length: i.count ?? 3 }, (_, k) => addMonthsISO(`${i.currentMonth}-01`, k).slice(0, 7))
  return months.map((month, k) => {
    const current = k === 0
    const start = current ? i.today : periodStart(month, i.paydays)
    const end = addDaysISO(periodStart(addMonthsISO(`${month}-01`, 1).slice(0, 7), i.paydays), -1)
    // today's period also holds what is still open from the periods before it
    const open = i.items.filter((it) => it.month !== null && (current ? it.month <= month : it.month === month) && isOpen(it))
    const apart = new Set(open.filter((it) => !onBalance(it.accountId) || (!current && it.reservedEarly)).map((it) => it.key))
    const inPeriod = i.txs.filter((t) => isPlannedOperation(t, i.start) && t.date >= start && t.date <= end)
    let recurringCents = 0
    let spendCents = 0
    let toGoalCents = 0
    let debtCents = 0
    for (const it of open) {
      // an item apart: its money is elsewhere, but what its operations take from «Баланс» in the period still leaves
      // (the tenant's deposit: «Депозит → Основной», then the expense from Основной)
      const cents = apart.has(it.key)
        ? itemReserve(it, inPeriod).covers.reduce((sum, t) => sum + Math.max(0, -groupDelta(t, groupOf, 'balance')), 0)
        : it.source === 'operation'
          ? it.leftCents
          : itemReserve(it, inPeriod).cents
      if (cents === 0) continue
      if (it.recurringId) recurringCents += cents
      else if (it.kind === 'to_goal') toGoalCents += cents
      else if (it.kind === 'debt') debtCents += cents
      else spendCents += cents
    }
    // what comes into «Баланс»: planned income and transfers into it from other groups
    const incomeCents = inPeriod
      .filter((t) => t.kind === 'income' || t.kind === 'transfer')
      .map((t) => groupDelta(t, groupOf, 'balance'))
      .filter((c) => c > 0)
      .reduce((s, c) => s + c, 0)
    const days = daysBetween(start, end) + 1
    const mondays: ISODate[] = []
    for (let m = weekStart(start); m <= end; m = addDaysISO(m, 7)) mondays.push(m)
    const limitWeekCents = mondays.length ? Math.round(mondays.reduce((s, m) => s + planWeek(m), 0) / mondays.length) : null
    const lifeCents = current ? null : incomeCents - recurringCents - spendCents - toGoalCents - debtCents
    return {
      month,
      start,
      end,
      current,
      incomeCents,
      recurringCents,
      spendCents,
      toGoalCents,
      debtCents,
      lifeCents,
      perWeekCents: lifeCents === null || days <= 0 ? null : Math.round((lifeCents * 7) / days),
      limitWeekCents,
      shortCents: lifeCents !== null && lifeCents < 0 ? -lifeCents : 0,
      recurring: open.filter((it) => it.recurringId).sort(byDate),
      items: open.filter((it) => !it.recurringId).sort(byDate),
      apart,
    }
  })
}

/** «Когда-нибудь»: open items without a period. */
export function somedayItems(items: readonly PlannedItem[]): PlannedItem[] {
  return items.filter((it) => it.month === null && isOpen(it)).sort((a, b) => a.title.localeCompare(b.title))
}

/** «Готово»: closed items (spent out, an archived envelope, a closed debt), the latest first by date. */
export function doneItems(items: readonly PlannedItem[]): PlannedItem[] {
  return items.filter((it) => !isOpen(it) && it.source !== 'operation').sort((a, b) => (b.month ?? '').localeCompare(a.month ?? '') || a.title.localeCompare(b.title))
}
