import { describe, expect, it } from 'vitest'
import type { AccTx, AccountLike } from './accounts'
import { plannedItems, type PlanTx } from './plan'
import { doneItems, planPeriods, somedayItems } from './planPeriods'

const TODAY = '2026-11-20'
const PAYDAYS = ['2026-11-27', '2026-12-28', '2027-01-28']
const acc = (id: string, grp: string): AccountLike => ({ id, name: id, grp, sort_order: 0, archived: false })
const accounts = [acc('main', 'balance'), acc('spark', 'balance'), acc('cushion', 'cushion'), acc('dep', 'separate')]
const tx = (p: Partial<AccTx & PlanTx>): AccTx & PlanTx => ({
  date: TODAY,
  amount_eur: 1,
  kind: 'expense',
  category: null,
  envelope_id: null,
  is_planned: true,
  confirmed_at: null,
  cancelled_at: null,
  entry_kind: 'one_off',
  account_id: 'main',
  to_account_id: null,
  ...p,
})
const txs = [
  tx({ id: 'start', date: '2026-11-18', kind: 'opening', amount_eur: 100, is_planned: false, confirmed_at: 'x' }),
  tx({ id: 'sal1', date: '2026-11-27', kind: 'income', amount_eur: 1263.49, account_id: 'spark', recurring_id: 'salary' }),
  tx({ id: 'lhk', date: '2026-11-30', kind: 'income', amount_eur: 211, account_id: 'spark' }),
  tx({ id: 'dep', date: '2026-11-30', kind: 'transfer', amount_eur: 100, account_id: 'dep', to_account_id: 'main' }),
  tx({ id: 'back', date: '2026-11-30', amount_eur: 100, debt_id: 'tenant' }),
  tx({ id: 'rent', date: '2026-12-15', amount_eur: 540, title: 'Аренда' }),
  tx({ id: 'tk', date: '2026-12-14', amount_eur: 120, title: 'TK', recurring_id: 'tk' }),
  tx({ id: 'pillow', date: '2026-12-01', kind: 'transfer', amount_eur: 30, to_account_id: 'cushion', title: 'В подушку' }),
  tx({ id: 'sal2', date: '2026-12-28', kind: 'income', amount_eur: 1263.49, account_id: 'spark', recurring_id: 'salary' }),
  tx({ id: 'big', date: '2027-01-05', amount_eur: 2000, title: 'Ноутбук' }),
]
const envelopes = [
  { id: 'berlin', name: 'Дорога в Берлин', type: 'envelope', archived: false, account_id: 'main', planned_eur: 20, pay_month: '2026-11-01' },
  { id: 'gifts', name: 'Подарки', type: 'envelope', archived: false, account_id: 'main', planned_eur: 165, pay_month: '2026-12-01' },
  { id: 'early', name: 'Билеты', type: 'envelope', archived: false, account_id: 'main', planned_eur: 50, pay_month: '2026-12-01', reserved_early: true },
  { id: 'trip', name: 'Кипр', type: 'envelope', archived: true, account_id: 'main', planned_eur: 300 },
]
const debts = [{ id: 'tenant', who: 'Жилец', direction: 'i_owe', amount_eur: 100, repaid_eur: 0, status: 'open', pot_id: null, due_date: '2026-11-30', account_id: 'dep' }]
const wishes = [{ id: 'w', title: 'Куртка', price_eur: 80, decision: null }]
const items = plannedItems({ envelopes, debts, wishes, txs, accounts, start: '2026-11-18', today: TODAY, paydays: PAYDAYS })
const limits = [{ monday: '2026-11-16', limitCents: 2500 }, { monday: '2026-11-23', limitCents: 7000 }]
const [nov, dec, jan] = planPeriods({ items, txs, accounts, limits, start: '2026-11-18', today: TODAY, paydays: PAYDAYS, currentMonth: '2026-11' })

describe('plan: periods', () => {
  it('today’s period runs to the day of money and holds its open items; no «на жизнь» — «Свободно до» tells it', () => {
    expect(nov).toMatchObject({ month: '2026-11', start: TODAY, end: '2026-11-26', current: true, lifeCents: null })
    expect(nov!.items.map((i) => i.title)).toEqual(['Дорога в Берлин'])
  })
  it('a period: income into «Баланс» − what leaves = на жизнь; only money of «Баланс» counts', () => {
    expect(dec).toMatchObject({ start: '2026-11-27', end: '2026-12-27', incomeCents: 126349 + 21100 + 10000, recurringCents: 12000, spendCents: 54000 + 16500, toGoalCents: 3000 })
    // the tenant's debt lies on «Депозит» (apart), but its expense from Основной leaves «Баланс»
    expect(dec!.debtCents).toBe(10000)
    expect(dec!.apart.has('debt:tenant')).toBe(true)
    // set aside early — paid from today's money, listed but not counted
    expect(dec!.apart.has('envelope:early')).toBe(true)
    expect(dec!.lifeCents).toBe(157449 - 12000 - 70500 - 3000 - 10000)
    expect(dec!.perWeekCents).toBe(Math.round((dec!.lifeCents! * 7) / 31))
    expect(dec!.shortCents).toBe(0)
  })
  it('«не сходится на X», when more leaves than comes in', () => {
    // January starts with the salary of 28.12
    expect(jan).toMatchObject({ start: '2026-12-28', incomeCents: 126349, spendCents: 200000, lifeCents: 126349 - 200000, shortCents: 200000 - 126349 })
  })
  it('the week limit by plan — the average over the period’s weeks', () => {
    // weeks of 23.11 … 21.12: the last limits (70) and after them their average of (25, 70)
    expect(dec!.limitWeekCents).toBeGreaterThan(0)
  })
  it('«Когда-нибудь» and «Готово»', () => {
    expect(somedayItems(items).map((i) => i.title)).toEqual(['Куртка'])
    expect(doneItems(items).map((i) => i.title)).toEqual(['Кипр'])
  })
})
