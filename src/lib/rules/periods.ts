import { addDaysISO, addMonthsISO, type ISODate } from '../dates'
import { isInPlan, type TxLike } from './money'

/** What a rule needs of accounts (accounts.ts imports this file, so no import back). */
type AccountGroupLike = { id: string; grp: string }

/**
 * Periods of money (docs/money-redesign.md, phase 1; decision 19.11.2026). A period runs from one day of money to
 * the next. The day of money is an occurrence of the salary: the largest active monthly income rule into «Баланс»
 * (by its planned date; a stored row of the occurrence on another day moves it — 27.11 for 28.11). Other income
 * (Landeshauptkasse 30.11) is income inside the period. A period is named by the month most of it covers: the day of
 * money plus 15 days (27.11–27.12 = «Декабрь»). Without a salary rule a month's period starts on its 1st.
 *
 * An envelope is paid from the money of a period (`pay_month`, the 1st of the month; null — set aside at once, as
 * before). Until its period starts it sets nothing aside, unless «Отложить сейчас» (`reserved_early`).
 */

/** 'YYYY-MM' */
export type Month = string

/** Days after the day of money that decide the month a period is named by. */
export const PERIOD_NAME_SHIFT = 15

export type PaydayRule = { id: string; kind: string; freq: string; interval_n: number; active: boolean; amount_eur: number | string; account_id?: string | null; anchor_date: ISODate }

/** The rule that sets the day of money: the largest active monthly income rule into «Баланс»; the earliest of equal ones. */
export function paydayRule<R extends PaydayRule>(rules: readonly R[], accounts: readonly AccountGroupLike[]): R | null {
  // a rule without an account counts as «Баланс», as everywhere
  const onBalance = (id: string | null | undefined) => !id || (accounts.find((a) => a.id === id)?.grp ?? 'balance') === 'balance'
  const fits = rules.filter((r) => r.active && r.kind === 'income' && r.freq === 'monthly' && r.interval_n === 1 && onBalance(r.account_id))
  return fits.reduce<R | null>((best, r) => {
    if (best === null) return r
    const d = Number(r.amount_eur) - Number(best.amount_eur)
    return d > 0 || (d === 0 && r.anchor_date < best.anchor_date) ? r : best
  }, null)
}

/**
 * Days of money: the dates of the salary rule's occurrences in the plan (virtual ones and stored rows that answer
 * them, out of the plan ones not), ascending, without repeats.
 */
export function paydays(rules: readonly PaydayRule[], txs: readonly (Pick<TxLike, 'date' | 'kind' | 'cancelled_at'> & { recurring_id?: string | null })[], accounts: readonly AccountGroupLike[]): ISODate[] {
  const rule = paydayRule(rules, accounts)
  if (!rule) return []
  const dates = txs.filter((t) => t.recurring_id === rule.id && t.kind === 'income' && isInPlan(t)).map((t) => t.date)
  return [...new Set(dates)].sort()
}

/** The month a period starting on this day of money is named by. */
export function periodMonthOf(payday: ISODate): Month {
  return addDaysISO(payday, PERIOD_NAME_SHIFT).slice(0, 7)
}

/** The first day of a month's period: its day of money, or the 1st of the month when there is none. */
export function periodStart(month: Month, days: readonly ISODate[]): ISODate {
  return days.find((d) => periodMonthOf(d) === month) ?? `${month}-01`
}

/** The next day of money after today, or null. */
export function nextPayday(today: ISODate, days: readonly ISODate[]): ISODate | null {
  return days.find((d) => d > today) ?? null
}

/**
 * Today's period: named by the latest day of money up to today; none known — the month before the next day of
 * money's period; no days of money at all — the calendar month.
 */
export function currentPeriodMonth(today: ISODate, days: readonly ISODate[]): Month {
  const past = days.filter((d) => d <= today)
  if (past.length) return periodMonthOf(past[past.length - 1]!)
  const next = nextPayday(today, days)
  if (next) return addMonthsISO(`${periodMonthOf(next)}-01`, -1).slice(0, 7)
  return today.slice(0, 7)
}

/** Today's period and the next ones: `count` months from today's. */
export function periodMonths(today: ISODate, days: readonly ISODate[], count = 4): Month[] {
  const first = `${currentPeriodMonth(today, days)}-01`
  return Array.from({ length: count }, (_, i) => addMonthsISO(first, i).slice(0, 7))
}

const MONTH_NAME = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

/** «Декабрь»; a year away or more (or in the past beyond last month) — «Январь 2028». */
export function periodName(month: Month, today: ISODate): string {
  const index = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1
  const name = MONTH_NAME[index(month) % 12]!
  const away = index(month) - index(today)
  return away >= -1 && away <= 10 ? name : `${name} ${month.slice(0, 4)}`
}

/**
 * The status of an envelope (computed, never stored):
 * - «Готово» — in the archive, or something was spent and nothing is left;
 * - «Запланировано» — its period has not started and it was not set aside early: sets nothing aside;
 * - «Идёт» — spending has started: what is left is set aside;
 * - «Отложено» — its period has started (or «Отложить сейчас»): all of it is set aside.
 */
export type EnvelopeStatus = 'planned' | 'reserved' | 'running' | 'done'

export const ENVELOPE_STATUS_LABEL: Record<EnvelopeStatus, string> = { planned: 'Запланировано', reserved: 'Отложено', running: 'Идёт', done: 'Готово' }

export type EnvelopePeriod = { archived: boolean; pay_month?: ISODate | null; reserved_early?: boolean | null }

export function envelopeStatus(e: EnvelopePeriod, s: { spentCents: number; leftCents: number }, today: ISODate, days: readonly ISODate[]): EnvelopeStatus {
  if (e.archived || (s.spentCents > 0 && s.leftCents === 0)) return 'done'
  if (e.pay_month && !e.reserved_early && today < periodStart(e.pay_month.slice(0, 7), days)) return 'planned'
  return s.spentCents > 0 ? 'running' : 'reserved'
}

/** Whether an envelope sets its money aside today: its period has started, or it was set aside early. */
export function reservesNow(e: EnvelopePeriod, today: ISODate, days: readonly ISODate[]): boolean {
  return !(e.pay_month && !e.reserved_early && today < periodStart(e.pay_month.slice(0, 7), days))
}
