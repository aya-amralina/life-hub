import { describe, expect, it } from 'vitest'
import { itemReserve, periodOfDate, plannedItems, type PlanTx } from './plan'

const TODAY = '2026-11-19'
const PAYDAYS = ['2026-11-27', '2026-12-28', '2027-01-28']
const accounts = [
  { id: 'main', grp: 'balance' },
  { id: 'spark', grp: 'balance' },
  { id: 'cushion', grp: 'cushion' },
  { id: 'dep', grp: 'separate' },
]
const tx = (p: Partial<PlanTx>): PlanTx => ({
  date: TODAY,
  amount_eur: 1,
  kind: 'expense',
  category: null,
  envelope_id: null,
  is_planned: false,
  confirmed_at: null,
  cancelled_at: null,
  entry_kind: 'one_off',
  account_id: 'main',
  ...p,
})
const env = (id: string, planned_eur: number, p: Record<string, unknown> = {}) => ({ id, name: id, type: 'envelope', archived: false, account_id: 'main', planned_eur, ...p })
const envelopes = [
  env('berlin', 20, { pay_month: '2026-11-01' }),
  env('gifts', 165, { pay_month: '2026-12-01' }),
  env('frankfurt', 100), // spent out — «Готово»
  { id: 'pillow', name: 'Подушка', type: 'goal', archived: false, account_id: 'cushion', planned_eur: null },
]
const debt = (id: string, direction: string, amount_eur: number, p: Record<string, unknown> = {}) => ({
  id,
  who: id,
  direction,
  amount_eur,
  repaid_eur: 0,
  status: 'open',
  pot_id: null,
  due_date: null,
  account_id: 'main',
  ...p,
})
const debts = [
  debt('tenant', 'i_owe', 100, { due_date: '2026-11-30', account_id: 'dep' }),
  debt('loan', 'from_pot', 130, { due_date: '2026-12-31', pot_id: 'pillow' }),
  debt('sister', 'owed_to_me', 40),
  debt('old', 'i_owe', 50, { status: 'closed' }),
]
const wishes = [
  { id: 'w1', title: 'Куртка', price_eur: 80, decision: null },
  { id: 'w2', title: 'Лампа', price_eur: 30, decision: 'buy' },
  { id: 'w3', title: 'Кроссовки', price_eur: 120, decision: 'skip' },
]
const txs = [
  tx({ id: 't1', amount_eur: 100, envelope_id: 'frankfurt' }), // a fact from an envelope
  tx({ id: 't2', date: '2026-12-15', amount_eur: 540, is_planned: true, title: 'Аренда' }),
  tx({ id: 't3', date: '2026-11-24', amount_eur: 30, is_planned: true, envelope_id: 'gifts' }), // inside «gifts»
  tx({ id: 't4', date: '2026-12-29', amount_eur: 65, is_planned: true, debt_id: 'loan', kind: 'transfer', to_account_id: 'cushion' }), // inside «loan»
  tx({ id: 't5', date: '2026-12-01', amount_eur: 50, is_planned: true, kind: 'transfer', to_account_id: 'cushion', title: 'В подушку' }),
  tx({ id: 't6', date: '2026-12-01', amount_eur: 50, is_planned: true, kind: 'transfer', account_id: 'main', to_account_id: 'spark' }), // inside «Баланс» — not spending
  tx({ id: 't7', date: '2026-11-27', amount_eur: 1263.49, is_planned: true, kind: 'income', account_id: 'spark' }),
  tx({ id: 't8', date: '2026-12-28', amount_eur: 12, is_planned: true, recurring_id: 'r1', title: 'Google One' }),
  tx({ id: 't9', date: '2026-12-10', amount_eur: 9, is_planned: true, cancelled_at: 'x' }),
  tx({ id: 't10', date: '2026-11-16', amount_eur: 7, is_planned: true }), // before the start by accounts — history
]
const items = plannedItems({ envelopes, debts, wishes, txs, accounts, start: '2026-11-18', today: TODAY, paydays: PAYDAYS })
const by = (key: string) => items.find((i) => i.key === key)!

describe('plan: one model of what leaves later', () => {
  it('every source row gives exactly one item; linked operations are inside their item; nothing twice', () => {
    expect(items.map((i) => i.key).sort()).toEqual(
      ['envelope:berlin', 'envelope:gifts', 'envelope:frankfurt', 'debt:tenant', 'debt:loan', 'debt:old', 'wish:w1', 'wish:w2', 'operation:t2', 'operation:t5', 'operation:t8'].sort(),
    )
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length)
  })
  it('envelopes: period, status and what they set aside — as in phase 1', () => {
    expect(by('envelope:berlin')).toMatchObject({ kind: 'spend', month: '2026-11', status: 'reserved', counts: 'reserve', leftCents: 2000 })
    expect(by('envelope:gifts')).toMatchObject({ month: '2026-12', status: 'planned', counts: 'none', leftCents: 16500 })
    expect(by('envelope:frankfurt')).toMatchObject({ month: '2026-11', status: 'done', counts: 'none', spentCents: 10000, leftCents: 0 })
  })
  it('a debt «я должна» reserves until paid back, its period is its due date; closed — done', () => {
    expect(by('debt:tenant')).toMatchObject({ kind: 'debt', month: '2026-12', date: '2026-11-30', status: 'reserved', counts: 'reserve', leftCents: 10000, accountId: 'dep' })
    expect(by('debt:old')).toMatchObject({ status: 'done', counts: 'none' })
  })
  it('a loan from a goal is a return to it in its period: nothing set aside before the period starts', () => {
    expect(by('debt:loan')).toMatchObject({ kind: 'to_goal', goalId: 'pillow', month: '2027-01', status: 'planned', counts: 'none', leftCents: 13000 })
    const later = plannedItems({ envelopes, debts, txs, accounts, start: '2026-11-18', today: '2026-12-28', paydays: PAYDAYS })
    expect(later.find((i) => i.key === 'debt:loan')).toMatchObject({ status: 'reserved', counts: 'reserve' })
  })
  it('wishes without «не покупаем» are «Когда-нибудь»', () => {
    expect(by('wish:w1')).toMatchObject({ month: null, counts: 'none', amountCents: 8000 })
    expect(by('wish:w2')).toMatchObject({ month: null })
  })
  it('planned operations: expenses and transfers to «Подушка», by their date and period', () => {
    expect(by('operation:t2')).toMatchObject({ kind: 'spend', title: 'Аренда', date: '2026-12-15', month: '2026-12', status: 'planned', counts: 'by_date' })
    expect(by('operation:t5')).toMatchObject({ kind: 'to_goal', month: '2026-12' })
    expect(by('operation:t8')).toMatchObject({ recurringId: 'r1', month: '2027-01' })
  })
  it('the period of a date: the latest day of money up to it', () => {
    expect(periodOfDate('2026-11-26', PAYDAYS)).toBe('2026-11')
    expect(periodOfDate('2026-11-27', PAYDAYS)).toBe('2026-12')
    expect(periodOfDate('2026-12-31', PAYDAYS)).toBe('2027-01')
    expect(periodOfDate('2026-12-31', [])).toBe('2026-12')
  })
  it('the reserve of an item: the larger of what is left and its planned operations in the window', () => {
    const inWindow = txs.filter((t) => t.is_planned && !t.cancelled_at)
    const gifts = { ...by('envelope:gifts'), leftCents: 1000 }
    expect(itemReserve(gifts, inWindow)).toMatchObject({ cents: 3000 })
    expect(itemReserve(gifts, inWindow).covers.map((t) => t.id)).toEqual(['t3'])
    expect(itemReserve(by('debt:loan'), inWindow).covers.map((t) => t.id)).toEqual(['t4']) // a loan goes back by a transfer
    expect(itemReserve(by('debt:tenant'), inWindow)).toEqual({ cents: 10000, covers: [] })
  })
})
