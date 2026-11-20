import { describe, expect, it } from 'vitest'
import type { AccTx, AccountLike } from './accounts'
import { freeUntil } from './forecast'
import { limitsByCategory, paydayPlan, splitWeekLimit } from './payday'
import type { PlanTx } from './plan'

const TODAY = '2026-11-20' // Friday
const acc = (id: string, grp: string): AccountLike => ({ id, name: id, grp, sort_order: 0, archived: false })
const accounts = [acc('main', 'balance'), acc('spark', 'balance'), acc('cushion', 'cushion'), acc('dep', 'separate')]
const tx = (p: Partial<AccTx & PlanTx> & { id: string }): AccTx & PlanTx & { id: string } => ({
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
const salary = tx({ id: 'sal1', date: '2026-11-27', kind: 'income', amount_eur: 1000, account_id: 'spark', recurring_id: 'salary' })
const txs = [
  tx({ id: 'start', date: '2026-11-18', kind: 'opening', amount_eur: 200, is_planned: false, confirmed_at: 'x' }),
  salary,
  tx({ id: 'lhk', date: '2026-11-30', kind: 'income', amount_eur: 200, account_id: 'spark' }),
  tx({ id: 'nov', date: '2026-11-24', amount_eur: 30, title: 'Ноябрьский счёт' }),
  tx({ id: 'rent', date: '2026-12-15', amount_eur: 500, title: 'Аренда' }),
  tx({ id: 'tk', date: '2026-12-14', amount_eur: 100, title: 'TK', recurring_id: 'tk' }),
  tx({ id: 'sal2', date: '2026-12-28', kind: 'income', amount_eur: 1000, account_id: 'spark', recurring_id: 'salary' }),
]
const envelopes = [
  { id: 'berlin', name: 'Берлин', type: 'envelope', archived: false, account_id: 'main', planned_eur: 20, pay_month: '2026-11-01' },
  { id: 'gifts', name: 'Подарки', type: 'envelope', archived: false, account_id: 'main', planned_eur: 150, pay_month: '2026-12-01' },
  { id: 'early', name: 'Билеты', type: 'envelope', archived: false, account_id: 'main', planned_eur: 40, pay_month: '2026-12-01', reserved_early: true },
]
const limits = [{ monday: '2026-11-16', limitCents: 3500 }]
const paydays = ['2026-11-27', '2026-12-28']
const base = { envelopes, debts: [], txs, accounts, limits, today: TODAY, paydays, salary, incomeCents: 100000, arrived: '2026-11-27' }

describe('payday: what the salary covers and what is left to live on', () => {
  it('the new period from the day it came; leftover of the old one = «Свободно до …»', () => {
    const p = paydayPlan(base)
    expect(p).toMatchObject({ month: '2026-12', start: '2026-11-27', end: '2026-12-27', incomeCents: 100000, moreIncomeCents: 20000 })
    // the old period keeps Берлин 20, Билеты 40 (set aside early), the bill of 24.11 and «Жизнь» to 26.11
    const free = freeUntil({ txs, accounts, limits, envelopes, debts: [], today: TODAY, paydays })
    expect(p.leftoverCents).toBe(free.cents)
    expect(p).toMatchObject({ recurringCents: 10000, spendCents: 50000 + 15000, toGoalCents: 0, debtCents: 0 })
    expect(p.lifeCents).toBe(100000 + 20000 + p.leftoverCents - 10000 - 65000)
    expect(p.days).toBe(31)
    expect(p.perWeekCents).toBe(Math.floor((p.lifeCents * 7) / 31 / 100) * 100)
    expect(p.mondays).toEqual(['2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21'])
  })
  it('it came with another amount and earlier: the period starts that day, the amount counts', () => {
    const p = paydayPlan({ ...base, incomeCents: 90000, arrived: TODAY })
    expect(p).toMatchObject({ start: TODAY, incomeCents: 90000, days: 38 })
    // no «Жизнь» before the start: today is in the new period
    expect(p.leftoverCents).toBeGreaterThan(paydayPlan(base).leftoverCents)
  })
  it('does not add up — nothing per week', () => {
    const p = paydayPlan({ ...base, incomeCents: 10000 })
    expect(p.lifeCents).toBeLessThan(0)
    expect(p.perWeekCents).toBe(0)
  })
})

describe('payday: the week limit by categories', () => {
  it('in the shares of the latest limits, whole euros, the rest to the largest', () => {
    expect(splitWeekLimit(10900, { Продукты: 2500, 'Кофейни и перекусы': 600, 'Выходы и еда вне дома': 1000 })).toMatchObject({
      Продукты: 6800, // 109 × 25/41 = 66,5 → 66; 15 + 26 + 66 = 107, the rest 2 → 68
      'Кофейни и перекусы': 1500,
      'Выходы и еда вне дома': 2600,
    })
    const split = splitWeekLimit(10950, { Продукты: 2500, 'Кофейни и перекусы': 600 })!
    expect(Object.values(split).reduce((s, c) => s + c, 0)).toBe(10900)
  })
  it('no limits to split by — null', () => {
    expect(splitWeekLimit(10000, {})).toBeNull()
  })
  it('rows of a week → categories', () => {
    expect(limitsByCategory([{ category: 'Продукты', limit_eur: 25 }, { category: 'Не категория', limit_eur: 5 }])).toEqual({ Продукты: 2500 })
  })
})
