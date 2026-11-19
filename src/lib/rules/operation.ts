import { WEEK_CATEGORIES } from '../constants'
import type { ISODate } from '../dates'

/** Groups of «Статьи» an operation can belong to (as the database allows them). */
export const OPERATION_GROUPS = ['Обязательное', 'Жизнь', 'Поездки и события', 'Долги', 'Буфер'] as const
export type OperationKind = 'expense' | 'income' | 'transfer'
export const OPERATION_KIND_LABEL: Record<OperationKind, string> = { expense: 'Расход', income: 'Доход', transfer: 'Перевод' }

/** What the operation sheet edits. Amount in cents; status «план» — expected, «факт» — went through the account. */
export type OperationForm = {
  kind: OperationKind
  title: string
  cents: number | null
  date: ISODate
  status: 'plan' | 'fact'
  grp: string | null
  category: string | null
  /** expense — «откуда», income — «куда», transfer — «откуда» */
  accountId: string | null
  /** transfer only — «куда» */
  toAccountId: string | null
  envelopeId: string | null
  debtId: string | null
  note: string
}

export type OperationRow = {
  kind: string
  title: string
  amount_eur: number
  date: ISODate
  is_planned: boolean
  confirmed_at: string | null
  grp: string | null
  category: string | null
  account_id: string | null
  to_account_id: string | null
  envelope_id: string | null
  debt_id: string | null
  note: string | null
  planned_amount_eur: number | null
}

/** What the rules need of a stored operation to confirm it or turn it back to plan. */
export type PlanState = {
  is_planned: boolean
  confirmed_at: string | null
  amount_eur: number | string
  planned_amount_eur?: number | string | null
}

const eur = (cents: number) => cents / 100

/**
 * Confirming a planned operation («Пришло? / Списалось?», «Подтвердить»): the time, the corrected amount if it
 * differs, and the amount that was in the plan (`planned_amount_eur`, decision 16.11.2026) — kept from an earlier
 * confirmation if there was one, so confirm → undo → confirm does not lose it. A plain fact gets only the time.
 * The patch is complete in itself: it goes through the offline queue as is.
 */
export function confirmPatch(tx: PlanState, correctedCents: number | null, nowIso: string): { confirmed_at: string; amount_eur?: number; planned_amount_eur?: number } {
  const patch: { confirmed_at: string; amount_eur?: number; planned_amount_eur?: number } = { confirmed_at: nowIso }
  if (correctedCents !== null && correctedCents > 0 && correctedCents !== Math.round(Number(tx.amount_eur) * 100)) patch.amount_eur = eur(correctedCents)
  if (tx.is_planned) patch.planned_amount_eur = Number(tx.planned_amount_eur ?? tx.amount_eur)
  return patch
}

/** Back to plan («Вернуть» after a confirmation): unconfirmed, the planned amount restored, the planned-amount mark cleared. */
export function unconfirmPatch(tx: PlanState): { confirmed_at: null; amount_eur: number; planned_amount_eur: null } {
  return { confirmed_at: null, amount_eur: Number(tx.planned_amount_eur ?? tx.amount_eur), planned_amount_eur: null }
}

export function operationValid(f: OperationForm): boolean {
  return f.title.trim().length > 0 && f.cents !== null && f.cents > 0 && /^\d{4}-\d{2}-\d{2}$/.test(f.date)
}

/**
 * The form as a row of `transactions`. Status: «план» — planned and not confirmed (it will ask «Пришло? / Списалось?»
 * on its day); «факт» — a new operation is a plain fact, one that was planned keeps its mark and gets confirmed
 * (the time of the first confirmation stays). Group: income — «Доход», transfer — none. A weekly category only
 * for an expense of «Жизнь» (it is what counts against the week's limit); an envelope only for an expense.
 */
export function operationRow(f: OperationForm, prev: PlanState | null, nowIso: string): OperationRow {
  const planned = f.status === 'plan' ? true : (prev?.is_planned ?? false)
  // the plan's amount: taken when a planned operation is confirmed here, kept while it stays confirmed, cleared back in plan
  const plannedAmount =
    f.status === 'plan' || !prev?.is_planned ? null : prev.confirmed_at === null ? Number(prev.amount_eur) : prev.planned_amount_eur == null ? null : Number(prev.planned_amount_eur)
  const grp = f.kind === 'income' ? 'Доход' : f.kind === 'transfer' ? null : f.grp
  const weekly = f.kind === 'expense' && grp === 'Жизнь' && f.category !== null && (WEEK_CATEGORIES as readonly string[]).includes(f.category)
  return {
    kind: f.kind,
    title: f.title.trim(),
    amount_eur: (f.cents ?? 0) / 100,
    date: f.date,
    is_planned: planned,
    confirmed_at: f.status === 'plan' ? null : (prev?.confirmed_at ?? nowIso),
    grp,
    category: weekly ? f.category : null,
    account_id: f.accountId,
    to_account_id: f.kind === 'transfer' ? f.toAccountId : null,
    envelope_id: f.kind === 'expense' ? f.envelopeId : null,
    debt_id: f.debtId,
    note: f.note.trim() || null,
    planned_amount_eur: plannedAmount,
  }
}

/** A stored operation back into the form (for editing). */
export function operationForm(t: Omit<OperationRow, 'planned_amount_eur'> & { cancelled_at?: string | null }): OperationForm {
  return {
    kind: t.kind === 'income' ? 'income' : t.kind === 'transfer' ? 'transfer' : 'expense',
    title: t.title,
    cents: Math.round(Number(t.amount_eur) * 100),
    date: t.date,
    status: !t.is_planned || t.confirmed_at !== null ? 'fact' : 'plan',
    grp: t.grp,
    category: t.category,
    accountId: t.account_id,
    toAccountId: t.to_account_id,
    envelopeId: t.envelope_id,
    debtId: t.debt_id,
    note: t.note ?? '',
  }
}

/**
 * «Сначала перевод с …» (decision 18.11.2026): an expense from an envelope whose money lies off «Баланс» goes with
 * a transfer of the same sum on the same day, from the envelope's account to the account the expense goes from —
 * so «Баланс» does not dip for money that was set aside elsewhere. The same status as the expense.
 */
export function envelopeTransferRow(f: OperationForm, fromAccountId: string, envelopeName: string): OperationRow {
  return {
    kind: 'transfer',
    title: `Из конверта «${envelopeName}»`,
    amount_eur: (f.cents ?? 0) / 100,
    date: f.date,
    is_planned: f.status === 'plan',
    confirmed_at: null,
    grp: null,
    category: null,
    account_id: fromAccountId,
    to_account_id: f.accountId,
    envelope_id: null,
    debt_id: null,
    note: null,
    planned_amount_eur: null,
  }
}

export type DebtDirection = 'i_owe' | 'owed_to_me' | 'from_pot'
export const DEBT_DIRECTION_LABEL: Record<DebtDirection, string> = { i_owe: 'я должна', owed_to_me: 'мне должны', from_pot: 'заём из копилки' }

/** `accountId` — where the money to pay back is set aside («я должна», e.g. a tenant's deposit); only for that direction. */
export type DebtForm = { who: string; direction: DebtDirection; cents: number | null; repaidCents: number | null; due: ISODate | null; potId: string | null; accountId?: string | null; note: string }

/** A debt needs a name and a sum; «заём из копилки» — also the goal it was taken from; repaid ≤ the sum. */
export function debtValid(f: DebtForm): boolean {
  if (!f.who.trim() || f.cents === null || f.cents <= 0) return false
  if (f.direction === 'from_pot' && !f.potId) return false
  return f.repaidCents === null || (f.repaidCents >= 0 && f.repaidCents <= f.cents)
}

export function debtRow(f: DebtForm) {
  return {
    who: f.who.trim(),
    direction: f.direction,
    amount_eur: (f.cents ?? 0) / 100,
    repaid_eur: f.repaidCents === null ? null : f.repaidCents / 100,
    due_date: f.due,
    pot_id: f.direction === 'from_pot' ? f.potId : null,
    account_id: f.direction === 'i_owe' ? (f.accountId ?? null) : null,
    note: f.note.trim() || null,
  }
}
