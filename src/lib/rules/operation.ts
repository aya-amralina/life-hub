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
  account: string | null
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
  account: string | null
  envelope_id: string | null
  debt_id: string | null
  note: string | null
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
export function operationRow(f: OperationForm, prev: { is_planned: boolean; confirmed_at: string | null } | null, nowIso: string): OperationRow {
  const planned = f.status === 'plan' ? true : (prev?.is_planned ?? false)
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
    account: f.account,
    envelope_id: f.kind === 'expense' ? f.envelopeId : null,
    debt_id: f.debtId,
    note: f.note.trim() || null,
  }
}

/** A stored operation back into the form (for editing). */
export function operationForm(t: OperationRow & { cancelled_at?: string | null }): OperationForm {
  return {
    kind: t.kind === 'income' ? 'income' : t.kind === 'transfer' ? 'transfer' : 'expense',
    title: t.title,
    cents: Math.round(Number(t.amount_eur) * 100),
    date: t.date,
    status: !t.is_planned || t.confirmed_at !== null ? 'fact' : 'plan',
    grp: t.grp,
    category: t.category,
    account: t.account,
    envelopeId: t.envelope_id,
    debtId: t.debt_id,
    note: t.note ?? '',
  }
}

export type DebtDirection = 'i_owe' | 'owed_to_me' | 'from_pot'
export const DEBT_DIRECTION_LABEL: Record<DebtDirection, string> = { i_owe: 'я должна', owed_to_me: 'мне должны', from_pot: 'заём из копилки' }

export type DebtForm = { who: string; direction: DebtDirection; cents: number | null; repaidCents: number | null; due: ISODate | null; potId: string | null; note: string }

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
    note: f.note.trim() || null,
  }
}
