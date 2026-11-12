import { WEEK_CATEGORIES, type WeekCategory } from '../constants'
import { addDaysISO, weekStart as weekStartISO, type ISODate } from '../dates'
import { toCents } from '../format'

export type LimitLike = { category: string; limit_eur: number }
export type TxLike = {
  date: ISODate
  amount_eur: number
  kind: string
  category: string | null
  envelope_id: string | null
  is_planned: boolean
  confirmed_at: string | null
  cancelled_at?: string | null
  /** «Вид»: разовая · бюджет недели (planned spending of a week) · итог недели (the week's total, a fact) */
  entry_kind?: string | null
  grp?: string | null
}

export type CategoryWeek = {
  category: WeekCategory
  limitCents: number
  spentCents: number
  /** fact − limit; > 0 = overspend */
  deviationCents: number
  status: 'within' | 'over'
}

export type MoneyWeek = {
  categories: CategoryWeek[]
  limitCents: number
  spentCents: number
  deviationCents: number
  status: 'within' | 'over'
  hasLimits: boolean
}

const isWeekCategory = (c: string | null): c is WeekCategory => c !== null && (WEEK_CATEGORIES as readonly string[]).includes(c)

/** A planned operation counts as fact only once confirmed; a cancelled one never. */
export function isFact(t: Pick<TxLike, 'is_planned' | 'confirmed_at' | 'cancelled_at'>): boolean {
  return !t.cancelled_at && (!t.is_planned || t.confirmed_at !== null)
}

/** Still in the plan: not cancelled («Отменить» on «Пришло? / Списалось?»). */
export function isInPlan(t: Pick<TxLike, 'cancelled_at'>): boolean {
  return !t.cancelled_at
}

/**
 * Rule 2 «Неделя денег»: fact = Σ expenses with a weekly category and without an envelope (rule 4)
 * within Mon–Sun. Deviation = fact − limit; ≤ 0 «в лимите», > 0 «перерасход».
 */
export function moneyWeek(limits: readonly LimitLike[], txs: readonly TxLike[], weekStart: ISODate): MoneyWeek {
  const weekEnd = addDaysISO(weekStart, 6)
  const spent = new Map<WeekCategory, number>()
  for (const t of txs) {
    if (t.kind !== 'expense' || t.envelope_id !== null || !isWeekCategory(t.category) || !isFact(t)) continue
    if (t.date < weekStart || t.date > weekEnd) continue
    spent.set(t.category, (spent.get(t.category) ?? 0) + toCents(t.amount_eur))
  }
  const limitOf = new Map<WeekCategory, number>()
  for (const l of limits) if (isWeekCategory(l.category)) limitOf.set(l.category, toCents(l.limit_eur))

  const categories = WEEK_CATEGORIES.map((category): CategoryWeek => {
    const limitCents = limitOf.get(category) ?? 0
    const spentCents = spent.get(category) ?? 0
    const deviationCents = spentCents - limitCents
    return { category, limitCents, spentCents, deviationCents, status: deviationCents > 0 ? 'over' : 'within' }
  })
  const limitCents = categories.reduce((s, c) => s + c.limitCents, 0)
  const spentCents = categories.reduce((s, c) => s + c.spentCents, 0)
  const deviationCents = spentCents - limitCents
  return {
    categories,
    limitCents,
    spentCents,
    deviationCents,
    status: deviationCents > 0 ? 'over' : 'within',
    hasLimits: limitOf.size > 0,
  }
}

/** «бюджет недели» or «итог недели» — a row about a whole week, not one operation (rule 26). */
export function isWeekRow(t: Pick<TxLike, 'entry_kind'>): boolean {
  return t.entry_kind === 'week_budget' || t.entry_kind === 'week_total'
}

/** End of the budget (SPEC rule 1: «На счетах 31.12»). */
export const BUDGET_END: ISODate = '2026-12-31'

/** Rule 1: signed amount in cents — opening and income +, expense −, transfer 0. */
export function signedCents(t: Pick<TxLike, 'kind' | 'amount_eur'>): number {
  const c = toCents(t.amount_eur)
  if (t.kind === 'opening' || t.kind === 'income') return c
  if (t.kind === 'expense') return -c
  return 0
}

/**
 * «Траты недели»: what the week's list shows — fact expenses with a weekly category in Mon–Sun, newest first.
 * Planned operations, one-off rows of the plan and week rows («Неделя N») live in «Месяц», not here.
 * `limitCents` — the part that counts against the limit (rule 4: an envelope's expense does not).
 */
export function weekSpendings<T extends TxLike>(txs: readonly T[], monday: ISODate): { list: T[]; limitCents: number } {
  const sunday = addDaysISO(monday, 6)
  const list = txs
    .filter((t) => t.kind === 'expense' && !isWeekRow(t) && isFact(t) && isWeekCategory(t.category) && t.date >= monday && t.date <= sunday)
    .sort((a, b) => b.date.localeCompare(a.date))
  return { list, limitCents: list.filter((t) => t.envelope_id === null).reduce((s, t) => s + toCents(t.amount_eur), 0) }
}

/**
 * What the week's budget has already covered: expenses with a weekly category (the app's «+» expenses) in
 * Mon–Sun. One-off rows of the plan (a purchase in group «Жизнь» without a weekly category) are separate.
 */
function spentLifeInWeek(txs: readonly TxLike[], monday: ISODate): number {
  const sunday = addDaysISO(monday, 6)
  return txs
    .filter((t) => t.kind === 'expense' && !isWeekRow(t) && isFact(t) && isWeekCategory(t.category) && t.date >= monday && t.date <= sunday)
    .reduce((s, t) => s + toCents(t.amount_eur), 0)
}

/**
 * Rule 1 «Баланс и прогноз»: running sum of signed amounts up to `date` (inclusive). `fact` counts only
 * confirmed operations (the «факт» line); `plan` adds planned ones not yet confirmed (the forecast).
 * Rule 26, week rows («Неделя N»): a planned week budget of a finished week drops out (its fact is the app's
 * expenses); the current week adds only what is left of the budget, so the week costs max(budget, already
 * spent with weekly categories); later weeks count in full. A confirmed «Неделя N (факт)» from Excel is the week's total: the app's
 * weekly-category expenses of that week stay in the category stats (rule 2) but not in the balance.
 */
export function balanceAt(txs: readonly TxLike[], date: ISODate, mode: 'fact' | 'plan', today: ISODate = date): number {
  const factWeeks = new Set(txs.filter((t) => t.entry_kind === 'week_total' && isFact(t) && isInPlan(t)).map((t) => weekStartISO(t.date)))
  let sum = 0
  for (const t of txs) {
    if (t.date > date || !isInPlan(t)) continue
    if (mode === 'fact' && !isFact(t)) continue
    if (!isWeekRow(t) && t.kind === 'expense' && isWeekCategory(t.category) && factWeeks.has(weekStartISO(t.date))) continue
    if (t.entry_kind === 'week_budget' && !isFact(t)) {
      const monday = weekStartISO(t.date)
      if (addDaysISO(monday, 6) < today) continue
      if (monday <= today) {
        sum -= Math.max(0, toCents(t.amount_eur) - spentLifeInWeek(txs, monday))
        continue
      }
    }
    sum += signedCents(t)
  }
  return sum
}

export type PlannedQuestion<T> = { tx: T; question: 'Пришло?' | 'Списалось?' }

/**
 * Rule 18: a planned operation whose day has come (date ≤ today) and that is neither confirmed nor
 * cancelled asks once: income — «Пришло?», expense and transfer — «Списалось?». Oldest first.
 * Week budgets («Неделя N») never ask (rule 18a).
 */
export function plannedQuestions<T extends TxLike & { id: string }>(txs: readonly T[], today: ISODate): PlannedQuestion<T>[] {
  return txs
    .filter((t) => t.is_planned && t.confirmed_at === null && !t.cancelled_at && !isWeekRow(t) && t.kind !== 'opening' && t.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((tx) => ({ tx, question: tx.kind === 'income' ? 'Пришло?' : 'Списалось?' }))
}

/** Planned operations still ahead (after today), in date order — «Дальше по плану». */
export function upcomingPlanned<T extends TxLike>(txs: readonly T[], today: ISODate): T[] {
  return txs
    .filter((t) => t.is_planned && t.confirmed_at === null && !t.cancelled_at && t.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Rule 3: an overspent week suggests cutting next week's limits by the overspend, per category
 * (applied only after confirmation). Returns the new limits; a limit never drops below 0.
 */
export function cutNextWeek(week: MoneyWeek, nextLimits: readonly LimitLike[]): { category: WeekCategory; limitCents: number; cutCents: number }[] {
  const next = new Map<string, number>(nextLimits.map((l) => [l.category, toCents(l.limit_eur)]))
  return week.categories
    .filter((c) => c.deviationCents > 0)
    .map((c) => {
      const before = next.get(c.category) ?? c.limitCents
      const limitCents = Math.max(0, before - c.deviationCents)
      return { category: c.category, limitCents, cutCents: before - limitCents }
    })
}

export type EnvelopeLike = { id: string; planned_eur: number | null }

/** Rule 4: envelope card — planned / spent (confirmed expenses with this envelope) / left; over > 0 = overspent. */
export function envelopeSummary(envelope: EnvelopeLike, txs: readonly TxLike[]) {
  const plannedCents = envelope.planned_eur === null ? 0 : toCents(envelope.planned_eur)
  const spentCents = txs
    .filter((t) => t.envelope_id === envelope.id && t.kind === 'expense' && isFact(t))
    .reduce((s, t) => s + toCents(t.amount_eur), 0)
  return { plannedCents, spentCents, leftCents: Math.max(0, plannedCents - spentCents), overCents: Math.max(0, spentCents - plannedCents) }
}

export type MonthRow = { month: string; incomeCents: number; expenseCents: number; endCents: number; hasPlan: boolean }

/**
 * Months table (like the «Обзор» sheet): per calendar month income and expenses (planned ones included,
 * cancelled ones not) and the balance at its end with the plan.
 */
export function monthsTable(txs: readonly TxLike[], today: ISODate): MonthRow[] {
  const months = [...new Set(txs.filter((t) => t.kind !== 'opening').map((t) => t.date.slice(0, 7)))].sort()
  return months.map((month) => {
    const inMonth = txs.filter((t) => t.date.startsWith(month) && isInPlan(t))
    const sum = (kind: string) => inMonth.filter((t) => t.kind === kind).reduce((s, t) => s + toCents(t.amount_eur), 0)
    const last = `${month}-31`
    return {
      month,
      incomeCents: sum('income'),
      expenseCents: sum('expense'),
      endCents: balanceAt(txs, last, 'plan', today),
      hasPlan: inMonth.some((t) => !isFact(t)),
    }
  })
}

export type ActualBalances = { date: ISODate; balances: Record<string, string | number> }
export type Reconciliation = { date: ISODate; actualCents: number; calculatedCents: number; diffCents: number; matches: boolean; missing: string[] }

/**
 * Real balances (entered in the Sunday review, later the «Остатки» sheet) against the calculated balance on the
 * same date (start + facts, rule 1). The latest entry with any amount wins. Within 1 € it «сходится»; accounts
 * not entered are named (the comparison then covers only what was entered).
 */
export function reconcile(
  entries: readonly ActualBalances[],
  txs: readonly TxLike[],
  accounts: readonly string[],
): Reconciliation | null {
  const parse = (v: string | number) => {
    if (typeof v === 'number') return Math.round(v * 100)
    const s = v.trim().replace(/\s/g, '').replace(',', '.')
    return /^-?\d+(\.\d{1,2})?$/.test(s) ? Math.round(Number(s) * 100) : null
  }
  for (const e of [...entries].sort((a, b) => b.date.localeCompare(a.date))) {
    // accounts only: a pocket of a goal is already inside its account
    const amounts = Object.entries(e.balances)
      .filter(([k]) => accounts.includes(k))
      .map(([k, v]) => [k, parse(v)] as const)
      .filter((x): x is readonly [string, number] => x[1] !== null)
    if (!amounts.length) continue
    const actualCents = amounts.reduce((s, [, c]) => s + c, 0)
    const calculatedCents = balanceAt(txs, e.date, 'fact')
    const diffCents = actualCents - calculatedCents
    return {
      date: e.date,
      actualCents,
      calculatedCents,
      diffCents,
      matches: Math.abs(diffCents) < 100,
      missing: accounts.filter((a) => !amounts.some(([k]) => k === a)),
    }
  }
  return null
}

/** Rows of «Остатки» grouped by date for the reconciliation (accounts by name). */
export function balancesByDate(rows: readonly { date: ISODate; account: string; amount_eur: number }[]): ActualBalances[] {
  const by = new Map<ISODate, Record<string, number>>()
  for (const r of rows) by.set(r.date, { ...(by.get(r.date) ?? {}), [r.account]: Number(r.amount_eur) })
  return [...by.entries()].map(([date, balances]) => ({ date, balances }))
}

export type GoalLike = { id: string; goal_eur: number | null; goal_date: string | null }

/**
 * A goal (envelope type «цель»): now = the latest real balance of its pocket in «Остатки» (the one source), target,
 * share and what is borrowed from it («заём из копилки», open).
 */
export function goalProgress(
  goal: GoalLike,
  balances: readonly { date: ISODate; envelope_id: string | null; amount_eur: number }[],
  debts: readonly DebtLike[],
  txs: readonly TxLike[] = [],
) {
  const latest = balances.filter((b) => b.envelope_id === goal.id).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  const targetCents = goal.goal_eur === null ? null : toCents(goal.goal_eur)
  const nowCents = latest ? toCents(latest.amount_eur) : null
  const borrowedCents = debts
    .filter((d) => d.direction === 'from_pot' && d.pot_id === goal.id && d.status === 'open')
    .reduce((s, d) => s + debtSummary(d, txs).leftCents, 0)
  return {
    nowCents,
    asOf: latest?.date ?? null,
    targetCents,
    share: nowCents !== null && targetCents ? Math.min(1, nowCents / targetCents) : null,
    due: goal.goal_date,
    borrowedCents,
  }
}

export type DebtLike = { id: string; direction: string; amount_eur: number; repaid_eur: number | null; status: string; pot_id: string | null; due_date: string | null }

/** A debt: repaid = confirmed operations linked to it (debt_id) if there are any, else «Возвращено» of the table. */
export function debtSummary(debt: DebtLike, txs: readonly (TxLike & { debt_id?: string | null })[]) {
  const linked = txs.filter((t) => t.debt_id === debt.id && isFact(t))
  const repaidCents = linked.length ? linked.reduce((s, t) => s + toCents(t.amount_eur), 0) : toCents(debt.repaid_eur ?? 0)
  const amountCents = toCents(debt.amount_eur)
  return { amountCents, repaidCents, leftCents: Math.max(0, amountCents - repaidCents), fromOperations: linked.length > 0 }
}

/** «Отложено» on «Конверты»: what is left in envelopes of type «конверт» (goals and their balances apart). */
export function envelopesLeft(envelopes: readonly (EnvelopeLike & { type: string })[], txs: readonly TxLike[]): number {
  return envelopes.filter((e) => e.type === 'envelope').reduce((s, e) => s + envelopeSummary(e, txs).leftCents, 0)
}
