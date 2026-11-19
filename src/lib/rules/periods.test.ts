import { describe, expect, it } from 'vitest'
import { currentPeriodMonth, envelopeStatus, nextPayday, paydayRule, paydays, periodMonthOf, periodMonths, periodName, periodStart, reservesNow } from './periods'

const accounts = [
  { id: 'main', grp: 'balance' },
  { id: 'spark', grp: 'balance' },
  { id: 'cushion', grp: 'cushion' },
]
const rule = (id: string, amount_eur: number, p: Partial<Parameters<typeof paydayRule>[0][number]> = {}) => ({
  id,
  kind: 'income',
  freq: 'monthly',
  interval_n: 1,
  active: true,
  amount_eur,
  account_id: 'spark',
  anchor_date: '2026-11-28',
  ...p,
})
const salary = rule('salary', 1263.49)
const lhk = rule('lhk', 211, { anchor_date: '2026-11-30' })
const occ = (recurring_id: string, date: string, p: { cancelled_at?: string | null; kind?: string } = {}) => ({ recurring_id, date, kind: 'income', cancelled_at: null, ...p })

describe('periods: the day of money', () => {
  it('the salary — the largest active monthly income rule into «Баланс»', () => {
    expect(paydayRule([lhk, salary], accounts)?.id).toBe('salary')
    expect(paydayRule([lhk, { ...salary, account_id: 'cushion' }], accounts)?.id).toBe('lhk')
    expect(paydayRule([lhk, { ...salary, active: false }], accounts)?.id).toBe('lhk')
    expect(paydayRule([lhk, { ...salary, freq: 'yearly' }], accounts)?.id).toBe('lhk')
    expect(paydayRule([lhk, { ...salary, kind: 'expense' }], accounts)?.id).toBe('lhk')
    expect(paydayRule([], accounts)).toBeNull()
  })
  it('days of money — its occurrences in the plan; a stored row on another day moves it; out of the plan — not', () => {
    const txs = [occ('salary', '2026-11-27'), occ('salary', '2026-12-28'), occ('salary', '2027-01-28', { cancelled_at: 'x' }), occ('lhk', '2026-11-30'), occ('salary', '2027-02-28')]
    expect(paydays([salary, lhk], txs, accounts)).toEqual(['2026-11-27', '2026-12-28', '2027-02-28'])
    expect(paydays([], txs, accounts)).toEqual([])
  })
  it('a period is named by the month most of it covers', () => {
    expect(periodMonthOf('2026-11-27')).toBe('2026-12')
    expect(periodMonthOf('2026-12-28')).toBe('2027-01')
    expect(periodMonthOf('2026-12-01')).toBe('2026-12')
  })
  const days = ['2026-11-27', '2026-12-28', '2027-01-28']
  it('a period starts on its day of money; without one — on the 1st', () => {
    expect(periodStart('2026-12', days)).toBe('2026-11-27')
    expect(periodStart('2027-01', days)).toBe('2026-12-28')
    expect(periodStart('2026-11', days)).toBe('2026-11-01')
    expect(periodStart('2026-12', [])).toBe('2026-12-01')
  })
  it('today’s period and the next ones', () => {
    expect(nextPayday('2026-11-19', days)).toBe('2026-11-27')
    expect(nextPayday('2026-11-27', days)).toBe('2026-12-28')
    expect(currentPeriodMonth('2026-11-19', days)).toBe('2026-11')
    expect(currentPeriodMonth('2026-11-27', days)).toBe('2026-12')
    expect(currentPeriodMonth('2026-11-19', [])).toBe('2026-11')
    expect(periodMonths('2026-11-19', days)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
  it('names: the month, with the year only a year away', () => {
    expect(periodName('2026-12', '2026-11-19')).toBe('Декабрь')
    expect(periodName('2027-01', '2026-11-19')).toBe('Январь')
    expect(periodName('2027-11', '2026-11-19')).toBe('Ноябрь 2027')
  })
})

describe('periods: the status of an envelope', () => {
  const days = ['2026-11-27', '2026-12-28']
  const env = (p: { pay_month?: string | null; reserved_early?: boolean; archived?: boolean } = {}) => ({ archived: false, ...p })
  const none = { spentCents: 0, leftCents: 16500 }
  it('of a period that has not started — «Запланировано», sets nothing aside', () => {
    expect(envelopeStatus(env({ pay_month: '2026-12-01' }), none, '2026-11-19', days)).toBe('planned')
    expect(reservesNow(env({ pay_month: '2026-12-01' }), '2026-11-19', days)).toBe(false)
  })
  it('its period has started (on the day of money) — «Отложено»', () => {
    expect(envelopeStatus(env({ pay_month: '2026-12-01' }), none, '2026-11-27', days)).toBe('reserved')
    expect(reservesNow(env({ pay_month: '2026-12-01' }), '2026-11-27', days)).toBe(true)
  })
  it('«Отложить сейчас» — set aside from today’s money', () => {
    expect(envelopeStatus(env({ pay_month: '2026-12-01', reserved_early: true }), none, '2026-11-19', days)).toBe('reserved')
    expect(reservesNow(env({ pay_month: '2026-12-01', reserved_early: true }), '2026-11-19', days)).toBe(true)
  })
  it('without a period (as before) and of today’s period — set aside', () => {
    expect(envelopeStatus(env(), none, '2026-11-19', days)).toBe('reserved')
    expect(envelopeStatus(env({ pay_month: null }), none, '2026-11-19', days)).toBe('reserved')
    expect(envelopeStatus(env({ pay_month: '2026-11-01' }), none, '2026-11-19', days)).toBe('reserved')
    expect(reservesNow(env({ pay_month: '2026-11-01' }), '2026-11-19', days)).toBe(true)
  })
  it('spending started — «Идёт»; nothing left — «Готово»; archived — «Готово»', () => {
    expect(envelopeStatus(env(), { spentCents: 500, leftCents: 1500 }, '2026-11-19', days)).toBe('running')
    expect(envelopeStatus(env(), { spentCents: 2500, leftCents: 0 }, '2026-11-19', days)).toBe('done')
    expect(envelopeStatus(env({ archived: true }), none, '2026-11-19', days)).toBe('done')
  })
  it('a future period stays «Запланировано» even with something spent early', () => {
    expect(envelopeStatus(env({ pay_month: '2026-12-01' }), { spentCents: 500, leftCents: 16000 }, '2026-11-19', days)).toBe('planned')
  })
})
