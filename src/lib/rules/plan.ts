import type { ISODate } from '../dates'
import { toCents } from '../format'
import { debtSummary, envelopeSummary, isWeekRow, type DebtLike, type TxLike } from './money'
import { currentPeriodMonth, envelopeStatus, periodStart, type EnvelopePeriod, type EnvelopeStatus, type Month } from './periods'

/**
 * The plan as one model (docs/money-redesign.md, phase 2; decision 20.11.2026): everything that will leave later is a
 * planned item — an envelope, a wish, a debt to pay back, a loan to return to a goal, a planned operation (a stored one
 * or an occurrence of a recurring rule). The items are computed from the tables where the data lives, like the virtual
 * occurrences of recurring rules: nothing is stored twice, every source row gives exactly one item, and the screens and
 * rules («Свободно до …», «Счета», «Конверты») read the items.
 *
 * How an item takes part in «свободно» (`counts`):
 * - `reserve` — its money is set aside today: what is left of it (planned expenses linked to it are inside);
 * - `by_date` — a planned operation: it leaves on its date, as the plan always counted it;
 * - `none` — not yet: an envelope or a loan return of a period that has not started, a wish («Когда-нибудь»).
 */

export type PlanKind = 'spend' | 'debt' | 'to_goal'
export type PlanSource = 'envelope' | 'wish' | 'debt' | 'operation'
export type PlanCounts = 'reserve' | 'by_date' | 'none'

export type PlannedItem = {
  /** `${source}:${sourceId}` — unique in the plan */
  key: string
  source: PlanSource
  sourceId: string
  kind: PlanKind
  title: string
  amountCents: number
  spentCents: number
  leftCents: number
  /** the date it is paid (debt — its due date, operation — its date); null — sometime in its period */
  date: ISODate | null
  /** the period it is paid from; null — «Когда-нибудь» */
  month: Month | null
  accountId: string | null
  reservedEarly: boolean
  /** to_goal — the goal (envelope of type «цель») the money goes back to, when known */
  goalId: string | null
  /** an occurrence of a recurring rule (virtual or answered) */
  recurringId: string | null
  status: EnvelopeStatus
  counts: PlanCounts
}

export type PlanEnvelope = EnvelopePeriod & { id: string; name: string; type: string; archived: boolean; account_id: string | null; planned_eur: number | null }
export type PlanDebt = DebtLike & { who: string; account_id: string | null }
export type PlanWish = { id: string; title: string; price_eur: number | string | null; decision: string | null }
export type PlanTx = TxLike & {
  id?: string
  title?: string | null
  account_id?: string | null
  to_account_id?: string | null
  debt_id?: string | null
  recurring_id?: string | null
}

/** The period a date belongs to: the latest day of money up to it (`currentPeriodMonth` for that day). */
export function periodOfDate(date: ISODate, paydays: readonly ISODate[]): Month {
  return currentPeriodMonth(date, paydays)
}

/**
 * A planned operation of the plan, as «Свободно до …» and the forecast see it: not answered, not cancelled, not a week
 * row or a start balance, after the start by accounts.
 */
export function isPlannedOperation(t: PlanTx, start: ISODate | null): boolean {
  return t.is_planned && t.confirmed_at === null && !t.cancelled_at && !isWeekRow(t) && t.kind !== 'opening' && (start === null || t.date > start)
}

/**
 * The planned items. `accounts` — groups of accounts (a row without one counts as «Баланс»), `start` — the start by
 * accounts (operations up to it are history). Operations linked to an envelope or a debt are inside that item; income
 * and transfers that do not leave «Баланс» for «Подушка» are not spending and are not items.
 */
export function plannedItems(i: {
  envelopes: readonly PlanEnvelope[]
  debts: readonly PlanDebt[]
  wishes?: readonly PlanWish[]
  txs: readonly PlanTx[]
  accounts: readonly { id: string; grp: string }[]
  start: ISODate | null
  today: ISODate
  paydays: readonly ISODate[]
}): PlannedItem[] {
  const { today, paydays } = i
  const current = currentPeriodMonth(today, paydays)
  const started = (m: Month) => periodStart(m, paydays) <= today
  const grp = (id: string | null | undefined) => (id ? (i.accounts.find((a) => a.id === id)?.grp ?? 'balance') : 'balance')
  const items: PlannedItem[] = []

  for (const e of i.envelopes) {
    if (e.type !== 'envelope') continue
    const s = envelopeSummary(e, i.txs)
    const status = envelopeStatus(e, s, today, paydays)
    items.push({
      key: `envelope:${e.id}`,
      source: 'envelope',
      sourceId: e.id,
      kind: 'spend',
      title: e.name,
      amountCents: s.plannedCents,
      spentCents: s.spentCents,
      leftCents: s.leftCents,
      date: null,
      month: e.pay_month ? e.pay_month.slice(0, 7) : current,
      accountId: e.account_id,
      reservedEarly: !!e.reserved_early,
      goalId: null,
      recurringId: null,
      status,
      counts: status === 'reserved' || status === 'running' ? 'reserve' : 'none',
    })
  }

  for (const d of i.debts) {
    if (d.direction !== 'i_owe' && d.direction !== 'from_pot') continue
    const s = debtSummary(d, i.txs)
    const month = d.due_date ? periodOfDate(d.due_date, paydays) : current
    const closed = d.status !== 'open' || s.leftCents === 0
    // a debt «я должна» is set aside until it is paid back (decision 20.11.2026); a loan from a goal — from its period on
    const now = d.direction === 'i_owe' || started(month)
    const status: EnvelopeStatus = closed ? 'done' : !now ? 'planned' : s.repaidCents > 0 ? 'running' : 'reserved'
    items.push({
      key: `debt:${d.id}`,
      source: 'debt',
      sourceId: d.id,
      kind: d.direction === 'i_owe' ? 'debt' : 'to_goal',
      title: d.who,
      amountCents: s.amountCents,
      spentCents: s.repaidCents,
      leftCents: s.leftCents,
      date: d.due_date,
      month,
      accountId: d.account_id,
      reservedEarly: false,
      goalId: d.direction === 'from_pot' ? d.pot_id : null,
      recurringId: null,
      status,
      counts: status === 'reserved' || status === 'running' ? 'reserve' : 'none',
    })
  }

  for (const w of i.wishes ?? []) {
    if (w.decision === 'skip') continue
    const cents = w.price_eur === null ? 0 : toCents(w.price_eur)
    items.push({
      key: `wish:${w.id}`,
      source: 'wish',
      sourceId: w.id,
      kind: 'spend',
      title: w.title,
      amountCents: cents,
      spentCents: 0,
      leftCents: cents,
      date: null,
      month: null,
      accountId: null,
      reservedEarly: false,
      goalId: null,
      recurringId: null,
      status: 'planned',
      counts: 'none',
    })
  }

  for (const t of i.txs) {
    if (!t.id || !isPlannedOperation(t, i.start) || t.envelope_id || t.debt_id) continue
    const toGoal = t.kind === 'transfer' && grp(t.account_id) === 'balance' && grp(t.to_account_id) === 'cushion'
    if (t.kind !== 'expense' && !toGoal) continue
    const cents = toCents(t.amount_eur)
    const month = periodOfDate(t.date, paydays)
    items.push({
      key: `operation:${t.id}`,
      source: 'operation',
      sourceId: t.id,
      kind: toGoal ? 'to_goal' : 'spend',
      title: t.title ?? '',
      amountCents: cents,
      spentCents: 0,
      leftCents: cents,
      date: t.date,
      month,
      accountId: t.account_id ?? null,
      reservedEarly: false,
      goalId: null,
      recurringId: t.recurring_id ?? null,
      status: started(month) ? 'reserved' : 'planned',
      counts: 'by_date',
    })
  }
  return items
}

/**
 * What an item sets aside within «Свободно до …» (window to `windowEnd`): the larger of what is left of it and its planned
 * operations in the window (they are inside its reserve, never twice). Returns the cents and the operations it covers.
 */
export function itemReserve<T extends PlanTx>(item: PlannedItem, inWindow: readonly T[]): { cents: number; covers: T[] } {
  const linked = (t: T) => (item.source === 'envelope' ? t.envelope_id === item.sourceId : item.source === 'debt' && t.debt_id === item.sourceId)
  // an envelope and a debt are paid by expenses; a loan goes back to its goal by a transfer too
  const covers = inWindow.filter((t) => linked(t) && (t.kind === 'expense' || (item.kind === 'to_goal' && t.kind === 'transfer')))
  return { cents: Math.max(item.leftCents, covers.reduce((s, t) => s + toCents(t.amount_eur), 0)), covers }
}
