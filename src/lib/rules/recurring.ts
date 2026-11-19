import { addDaysISO, addMonthsISO, type ISODate } from '../dates'
import type { TxLike } from './money'

/**
 * Recurring operations (decision 16.11.2026). A rule produces *virtual* planned operations up to the forecast
 * horizon; they take part wherever the plan does and are never written to the base. An answer to one (confirm,
 * another date, out of the plan, an edit) creates a real row with `recurring_id` + `occurrence_date`, which
 * closes that occurrence in any state, cancelled included.
 *
 * This file is what every plan view needs (also «Сегодня», in the main bundle); describing, the form, changing the
 * schedule and linking existing rows live in `recurringEdit.ts` (loaded with «Деньги»).
 */

export type Freq = 'weekly' | 'monthly' | 'yearly'

export type RecurringLike = {
  id: string
  title: string
  amount_eur: number | string
  kind: string
  grp: string | null
  /** the old text «Счёт» (until migration 0019 drops it) */
  account?: string | null
  /** expense — «откуда», income — «куда», transfer — «откуда» (decision 18.11.2026) */
  account_id?: string | null
  /** transfer only — «куда» */
  to_account_id?: string | null
  envelope_id: string | null
  freq: string
  interval_n: number
  anchor_date: ISODate
  end_date: ISODate | null
  active: boolean
  note: string | null
}

/** What an operation needs for a rule to know it answers one of its occurrences. */
export type OccurrenceLink = { recurring_id?: string | null; occurrence_date?: ISODate | null }

/** A planned operation of a rule that has no real row yet. Shaped like a stored operation; `virtual` marks it. */
export type VirtualTx = TxLike & {
  id: string
  virtual: true
  recurring_id: string
  occurrence_date: ISODate
  title: string
  account: string | null
  account_id: string | null
  to_account_id: string | null
  grp: string | null
  note: string | null
  is_planned: true
  confirmed_at: null
  cancelled_at: null
  entry_kind: 'one_off'
  planned_amount_eur: null
  debt_id: null
  source_id: null
  week_no: null
}

/** The id of a virtual operation: stable for the rule and the occurrence, never a uuid of the base. */
export function virtualId(ruleId: string, occurrence: ISODate): string {
  return `rec:${ruleId}:${occurrence}`
}

export function isVirtual(t: object): t is VirtualTx {
  return (t as { virtual?: unknown }).virtual === true
}

/**
 * The k-th date of a schedule from its first date. Always counted from the first date, so a day the month lacks
 * becomes its last day only in that month: 31.01 → 28.02 → 31.03; 29.02 yearly → 28.02 in common years.
 */
export function nthDate(rule: Pick<RecurringLike, 'freq' | 'interval_n' | 'anchor_date'>, k: number): ISODate {
  const n = Math.max(1, Math.floor(rule.interval_n)) * k
  if (rule.freq === 'weekly') return addDaysISO(rule.anchor_date, 7 * n)
  if (rule.freq === 'yearly') return addMonthsISO(rule.anchor_date, 12 * n)
  return addMonthsISO(rule.anchor_date, n)
}

/** Occurrence dates of an active rule within [from, to], never past its end. A paused rule has none. */
export function occurrences(rule: Pick<RecurringLike, 'freq' | 'interval_n' | 'anchor_date' | 'end_date' | 'active'>, from: ISODate, to: ISODate): ISODate[] {
  if (!rule.active) return []
  const last = rule.end_date !== null && rule.end_date < to ? rule.end_date : to
  const out: ISODate[] = []
  for (let k = 0; ; k += 1) {
    const d = nthDate(rule, k)
    if (d > last) return out
    if (d >= from) out.push(d)
  }
}

/** The first date of the schedule strictly after `after` (end and pause not considered). */
export function nextDateAfter(rule: Pick<RecurringLike, 'freq' | 'interval_n' | 'anchor_date'>, after: ISODate): ISODate {
  for (let k = 0; ; k += 1) {
    const d = nthDate(rule, k)
    if (d > after) return d
  }
}

/** Occurrences of each rule already answered by a real row (any state, cancelled included). */
export function answeredByRule(txs: readonly OccurrenceLink[]): Map<string, Set<ISODate>> {
  const out = new Map<string, Set<ISODate>>()
  for (const t of txs) {
    if (!t.recurring_id || !t.occurrence_date) continue
    let s = out.get(t.recurring_id)
    if (!s) out.set(t.recurring_id, (s = new Set()))
    s.add(t.occurrence_date)
  }
  return out
}

function virtualOf(rule: RecurringLike, occurrence: ISODate): VirtualTx {
  const kind = rule.kind
  return {
    id: virtualId(rule.id, occurrence),
    virtual: true,
    recurring_id: rule.id,
    occurrence_date: occurrence,
    date: occurrence,
    title: rule.title,
    amount_eur: Number(rule.amount_eur),
    kind,
    grp: kind === 'income' ? 'Доход' : kind === 'transfer' ? null : rule.grp,
    category: null,
    account: rule.account ?? null,
    account_id: rule.account_id ?? null,
    to_account_id: kind === 'transfer' ? (rule.to_account_id ?? null) : null,
    envelope_id: kind === 'expense' ? rule.envelope_id : null,
    note: rule.note,
    is_planned: true,
    confirmed_at: null,
    cancelled_at: null,
    entry_kind: 'one_off',
    planned_amount_eur: null,
    debt_id: null,
    source_id: null,
    week_no: null,
  }
}

/**
 * Virtual planned operations of the rules from their first date up to `to`: one per occurrence that no real row
 * answers. Past ones are included — they ask «Пришло? / Списалось?» like any planned operation. Paused rules give none.
 */
export function virtualPlanned(rules: readonly RecurringLike[], txs: readonly OccurrenceLink[], to: ISODate): VirtualTx[] {
  const answered = answeredByRule(txs)
  return rules.flatMap((r) => {
    const done = answered.get(r.id)
    return occurrences(r, r.anchor_date, to)
      .filter((d) => !done?.has(d))
      .map((d) => virtualOf(r, d))
  })
}

/** The stored operations plus the virtual ones up to `to` — what every plan view and calculation works on. */
export function withRecurring<T extends OccurrenceLink>(txs: readonly T[], rules: readonly RecurringLike[], to: ISODate): (T | VirtualTx)[] {
  return [...txs, ...virtualPlanned(rules, txs, to)]
}

/**
 * A virtual operation made real: the row to insert (id from the client, so it works offline), with the answer
 * applied — `confirmPatch(...)`, `{ date }` for another day, `{ cancelled_at }` for out of the plan, or the
 * fields of the operation sheet. The occurrence it answers stays fixed whatever the answer changes.
 */
export function materialize(v: VirtualTx, id: string, answer: Record<string, unknown>) {
  return {
    id,
    date: v.date,
    title: v.title,
    amount_eur: v.amount_eur,
    kind: v.kind,
    grp: v.grp,
    category: null as string | null,
    account_id: v.account_id,
    to_account_id: v.to_account_id,
    envelope_id: v.envelope_id,
    note: v.note,
    is_planned: true,
    confirmed_at: null as string | null,
    cancelled_at: null as string | null,
    entry_kind: 'one_off',
    ...answer,
    recurring_id: v.recurring_id,
    occurrence_date: v.occurrence_date,
  }
}
