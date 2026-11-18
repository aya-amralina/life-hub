import type { AccountGroup } from '../constants'
import type { ISODate } from '../dates'
import { toCents } from '../format'
import { balanceAt, isFact, isInPlan, type TxLike } from './money'

/**
 * Accounts (decision 18.11.2026). Every Revolut pocket is an account; accounts are in groups: «Баланс» — the plan and
 * the forecast, «Подушка» — its own forecast, «Отдельно» — overview only. Expenses go only from «Баланс»; a transfer
 * is «откуда → куда». The start by accounts is the end of a day (18.11): from then on balances are counted per
 * account; what happened up to it is the history of the one common pot and stays as it was.
 */

export type AccountLike = { id: string; name: string; grp: AccountGroup | string; archived: boolean; sort_order: number }
/** An operation with its accounts: `account_id` — expense «откуда», income «куда», transfer «откуда»; `to_account_id` — transfer «куда». */
export type AccTx = TxLike & { account_id?: string | null; to_account_id?: string | null }

export const GROUP_LABEL: Record<AccountGroup, string> = { balance: 'Баланс', cushion: 'Подушка', separate: 'Отдельно' }

/** The old text «Счёт» → the account's name: Revolut was the main one, the rest keep their names. */
export function legacyAccountName(text: string): string {
  return text === 'Revolut' ? 'Revolut · Основной' : text
}

/** The start by accounts: the date of the start balances (openings with an account); null — not entered yet. */
export function accountsStart(txs: readonly AccTx[]): ISODate | null {
  let start: ISODate | null = null
  for (const t of txs) if (t.kind === 'opening' && t.account_id && isInPlan(t) && (start === null || t.date < start)) start = t.date
  return start
}

/** Group of an account; a row without an account (the old text only, or none) counts as «Баланс». */
export function groupOfAccount(accounts: readonly AccountLike[]): (id: string | null | undefined) => AccountGroup {
  const by = new Map(accounts.map((a) => [a.id, a.grp as AccountGroup]))
  return (id) => (id ? (by.get(id) ?? 'balance') : 'balance')
}

/** What a row does to one account, in cents: expense −, income and start +, transfer − «откуда» / + «куда». */
export function accountDelta(t: AccTx, accountId: string): number {
  const c = toCents(t.amount_eur)
  if (t.kind === 'transfer') return (t.to_account_id === accountId ? c : 0) - (t.account_id === accountId ? c : 0)
  if (t.account_id !== accountId) return 0
  if (t.kind === 'expense') return -c
  return t.kind === 'income' || t.kind === 'opening' ? c : 0
}

/**
 * What a row does to a group, in cents. A transfer inside the group changes nothing; between groups it takes from
 * one and gives to the other; a transfer without «куда» (history, before the start) changes nothing.
 */
export function groupDelta(t: AccTx, groupOf: (id: string | null | undefined) => AccountGroup, g: AccountGroup): number {
  const c = toCents(t.amount_eur)
  if (t.kind === 'transfer') {
    if (!t.account_id || !t.to_account_id) return 0
    const from = groupOf(t.account_id)
    const to = groupOf(t.to_account_id)
    if (from === to) return 0
    return from === g ? -c : to === g ? c : 0
  }
  if (groupOf(t.account_id) !== g) return 0
  if (t.kind === 'expense') return -c
  return t.kind === 'income' || t.kind === 'opening' ? c : 0
}

/**
 * A group's balance on `date` (rule 1 and rule 26 within it): the start balances of its accounts and what happened
 * after the start. Null before the start or when there is none yet — the common pot (`balanceAt`) counts then.
 */
export function groupBalanceAt(
  txs: readonly AccTx[],
  accounts: readonly AccountLike[],
  g: AccountGroup,
  date: ISODate,
  mode: 'fact' | 'plan',
  today: ISODate = date,
): number | null {
  const from = accountsStart(txs)
  if (from === null || date < from) return null
  const groupOf = groupOfAccount(accounts)
  return balanceAt(txs, date, mode, today, { from, signed: (t) => groupDelta(t, groupOf, g) })
}

/** One account's balance on `date` from the start; null before the start or without one. */
export function accountBalanceAt(txs: readonly AccTx[], accountId: string, date: ISODate, mode: 'fact' | 'plan' = 'fact'): number | null {
  const from = accountsStart(txs)
  if (from === null || date < from) return null
  let sum = 0
  for (const t of txs) {
    if (t.date > date || !isInPlan(t) || (mode === 'fact' && !isFact(t))) continue
    if (t.date < from || (t.date === from && t.kind !== 'opening')) continue
    sum += accountDelta(t, accountId)
  }
  return sum
}

export type AccountsForm = { kind: string; date: ISODate; account_id: string | null; to_account_id: string | null }

/**
 * The accounts of an operation the form is about to save; a reason in words, or null when it is fine. After the
 * start: an expense only from «Баланс»; a transfer — two different accounts. History (up to the start) is not checked.
 */
export function accountsProblem(f: AccountsForm, accounts: readonly AccountLike[], start: ISODate | null): string | null {
  if (f.kind !== 'transfer' && f.to_account_id) return 'Куда — только у перевода.'
  if (start !== null && f.date <= start) return null
  if (f.kind === 'transfer') {
    if (!f.account_id || !f.to_account_id) return 'Выбери, откуда и куда.'
    if (f.account_id === f.to_account_id) return 'Откуда и куда — разные счета.'
    return null
  }
  if (f.kind === 'expense' && f.account_id && groupOfAccount(accounts)(f.account_id) !== 'balance') {
    return 'Трата — только со счетов «Баланса». Сначала перевод на основной.'
  }
  return null
}

/** A goal lives only on an account of «Подушка». */
export function goalAccountProblem(accountId: string | null, accounts: readonly AccountLike[]): string | null {
  if (!accountId) return null
  return accounts.find((a) => a.id === accountId)?.grp === 'cushion' ? null : 'Цель — только на счёте «Подушки».'
}

/** Accounts a choice offers: not archived (the one already chosen stays), optionally of one group, in order. */
export function accountOptions(accounts: readonly AccountLike[], opts: { group?: AccountGroup; keep?: string | null } = {}): AccountLike[] {
  return accounts
    .filter((a) => (!a.archived || a.id === opts.keep) && (!opts.group || a.grp === opts.group || a.id === opts.keep))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

/**
 * How «Деньги» see the balance (decision 18.11.2026): up to the start the common pot (rule 1), from the start on
 * the group «Баланс». `at` — the balance on a day; `counts` — whether a row after the start belongs in the months'
 * income and expenses (only «Баланс»; a row without an account is «Баланс»). Without a start — the pot as before.
 */
export function balanceView(txs: readonly AccTx[], accounts: readonly AccountLike[], today: ISODate) {
  const start = accountsStart(txs)
  const groupOf = groupOfAccount(accounts)
  return {
    start,
    at: (d: ISODate, mode: 'fact' | 'plan') => groupBalanceAt(txs, accounts, 'balance', d, mode, today) ?? balanceAt(txs, d, mode, today),
    counts: (t: AccTx) => groupOf(t.account_id) === 'balance',
  }
}

export type AccountCheck = { account: AccountLike; actualCents: number; calculatedCents: number; diffCents: number }
export type AccountsReconciliation = {
  date: ISODate
  /** «Баланс» as a whole — only when every account of it was entered that day */
  balance: { actualCents: number; calculatedCents: number; diffCents: number } | null
  accounts: AccountCheck[]
  /** accounts off by 1 € or more */
  off: AccountCheck[]
  /** accounts (not archived) without a balance that day */
  missing: string[]
  matches: boolean
}

/**
 * Real balances by account («Остатки» with an account, on the start or later) against the calculation on the same
 * date: the latest day with any entry; each account within 1 € «сходится»; «Баланс» as a whole when it is complete.
 */
export function reconcileAccounts(
  rows: readonly { date: ISODate; account_id: string | null; amount_eur: number | string }[],
  txs: readonly AccTx[],
  accounts: readonly AccountLike[],
): AccountsReconciliation | null {
  const start = accountsStart(txs)
  if (start === null) return null
  const known = new Map(accounts.map((a) => [a.id, a]))
  const entered = rows.filter((r) => r.account_id && known.has(r.account_id) && r.date >= start)
  if (!entered.length) return null
  const date = entered.reduce((m, r) => (r.date > m ? r.date : m), entered[0]!.date)
  const checks = entered
    .filter((r) => r.date === date)
    .map((r): AccountCheck => {
      const account = known.get(r.account_id!)!
      const actualCents = toCents(r.amount_eur)
      const calculatedCents = accountBalanceAt(txs, account.id, date) ?? 0
      return { account, actualCents, calculatedCents, diffCents: actualCents - calculatedCents }
    })
    .sort((a, b) => a.account.sort_order - b.account.sort_order)
  const balanceAccounts = accounts.filter((a) => a.grp === 'balance' && !a.archived)
  const complete = balanceAccounts.every((a) => checks.some((c) => c.account.id === a.id))
  const actual = checks.filter((c) => c.account.grp === 'balance').reduce((s, c) => s + c.actualCents, 0)
  const calculated = groupBalanceAt(txs, accounts, 'balance', date, 'fact')!
  const balance = complete ? { actualCents: actual, calculatedCents: calculated, diffCents: actual - calculated } : null
  const off = checks.filter((c) => Math.abs(c.diffCents) >= 100)
  return {
    date,
    balance,
    accounts: checks,
    off,
    missing: accounts.filter((a) => !a.archived && !checks.some((c) => c.account.id === a.id)).sort((a, b) => a.sort_order - b.sort_order).map((a) => a.name),
    matches: off.length === 0 && (balance === null || Math.abs(balance.diffCents) < 100),
  }
}

/**
 * «Сейчас» of a goal that is the only one on its account: that account's balance today (decision 18.11.2026).
 * Null when the goal shares its account, has none, or there is no start yet — then «Внести остаток» counts.
 */
export function goalAccountNow(
  goal: { id: string; account_id: string | null },
  goals: readonly { id: string; type: string; archived: boolean; account_id: string | null }[],
  accounts: readonly AccountLike[],
  txs: readonly AccTx[],
  today: ISODate,
): { cents: number; account: AccountLike } | null {
  const account = accounts.find((a) => a.id === goal.account_id)
  if (!account) return null
  const others = goals.filter((g) => g.type === 'goal' && !g.archived && g.account_id === account.id && g.id !== goal.id)
  if (others.length) return null
  const cents = accountBalanceAt(txs, account.id, today)
  return cents === null ? null : { cents, account }
}
