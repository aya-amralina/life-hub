import { describe, expect, it } from 'vitest'
import { isFact, moneyWeek, type TxLike } from './money'

const tx = (p: Partial<TxLike>): TxLike => ({
  date: '2026-11-10',
  amount_eur: 1,
  kind: 'expense',
  category: 'Продукты',
  envelope_id: null,
  is_planned: false,
  confirmed_at: null,
  ...p,
})
const limits = [
  { category: 'Продукты', limit_eur: 20 },
  { category: 'Кофейни и перекусы', limit_eur: 6 },
]
const mon = '2026-11-09'

describe('rule 2 — money week', () => {
  it('fact, deviation and status per category', () => {
    const w = moneyWeek(limits, [tx({ amount_eur: 16.2 }), tx({ category: 'Кофейни и перекусы', amount_eur: 7.8 })], mon)
    const food = w.categories.find((c) => c.category === 'Продукты')!
    const coffee = w.categories.find((c) => c.category === 'Кофейни и перекусы')!
    expect(food).toMatchObject({ limitCents: 2000, spentCents: 1620, deviationCents: -380, status: 'within' })
    expect(coffee).toMatchObject({ limitCents: 600, spentCents: 780, deviationCents: 180, status: 'over' })
    expect(w).toMatchObject({ limitCents: 2600, spentCents: 2400, deviationCents: -200, status: 'within', hasLimits: true })
  })
  it('exactly at the limit is «в лимите»', () => {
    expect(moneyWeek(limits, [tx({ amount_eur: 20 })], mon).categories[0]!.status).toBe('within')
  })
  it('ignores envelopes (rule 4), other kinds, non-weekly groups, other weeks, unconfirmed plans', () => {
    const w = moneyWeek(
      limits,
      [
        tx({ envelope_id: 'env' }),
        tx({ kind: 'income' }),
        tx({ category: null }),
        tx({ date: '2026-11-08' }),
        tx({ date: '2026-11-16' }),
        tx({ is_planned: true }),
      ],
      mon,
    )
    expect(w.spentCents).toBe(0)
  })
  it('Sunday belongs to the week; confirmed plan counts', () => {
    const w = moneyWeek(limits, [tx({ date: '2026-11-15' }), tx({ is_planned: true, confirmed_at: '2026-11-10T10:00:00Z' })], mon)
    expect(w.spentCents).toBe(200)
  })
  it('no float drift on sums', () => {
    const w = moneyWeek(limits, [tx({ amount_eur: 0.1 }), tx({ amount_eur: 0.2 })], mon)
    expect(w.spentCents).toBe(30)
  })
  it('without limits everything is overspend but hasLimits=false', () => {
    const w = moneyWeek([], [tx({ amount_eur: 5 })], mon)
    expect(w.hasLimits).toBe(false)
    expect(w.status).toBe('over')
  })
  it('isFact', () => {
    expect(isFact({ is_planned: false, confirmed_at: null })).toBe(true)
    expect(isFact({ is_planned: true, confirmed_at: null })).toBe(false)
  })
})

describe('rule 1: balance and forecast', async () => {
  const { balanceAt, BUDGET_END } = await import('./money')
  const t = (date: string, kind: string, amount_eur: number, p: Record<string, unknown> = {}) => ({
    date,
    kind,
    amount_eur,
    category: null,
    envelope_id: null,
    is_planned: false,
    confirmed_at: null,
    cancelled_at: null,
    ...p,
  })
  const txs = [
    t('2026-10-13', 'opening', 1000),
    t('2026-11-01', 'expense', 650), // Miete — expense
    t('2026-11-05', 'income', 300),
    t('2026-11-06', 'transfer', 200),
    t('2026-12-01', 'expense', 650, { is_planned: true }),
    t('2026-12-09', 'income', 100, { is_planned: true, cancelled_at: '2026-11-10T08:00:00Z' }),
  ]
  it('fact: signed running sum up to the date, transfers 0', () => expect(balanceAt(txs, '2026-11-10', 'fact')).toBe(65000))
  it('plan to 31.12 adds planned, skips cancelled', () => expect(balanceAt(txs, BUDGET_END, 'plan')).toBe(0))
  it('fact ignores unconfirmed planned operations', () => expect(balanceAt(txs, BUDGET_END, 'fact')).toBe(65000))
  it('a confirmed planned operation moves the fact line', () => {
    const confirmed = txs.map((x) => (x.date === '2026-12-01' ? { ...x, confirmed_at: '2026-12-01T09:00:00Z' } : x))
    expect(balanceAt(confirmed, BUDGET_END, 'fact')).toBe(0)
  })
})

describe('rule 18 «Пришло? / Списалось?»', async () => {
  const { plannedQuestions, upcomingPlanned } = await import('./money')
  const p = (id: string, date: string, kind: string, x: Record<string, unknown> = {}) => ({
    id,
    date,
    kind,
    amount_eur: 10,
    category: null,
    envelope_id: null,
    is_planned: true,
    confirmed_at: null,
    cancelled_at: null,
    ...x,
  })
  const today = '2026-11-09'
  const txs = [
    p('miete', '2026-11-09', 'expense'),
    p('gehalt', '2026-11-02', 'income'),
    p('move', '2026-11-08', 'transfer'),
    p('later', '2026-11-27', 'income'),
    p('confirmed', '2026-11-01', 'expense', { confirmed_at: '2026-11-01T10:00:00Z' }),
    p('cancelled', '2026-11-01', 'expense', { cancelled_at: '2026-11-02T10:00:00Z' }),
    p('fact', '2026-11-01', 'expense', { is_planned: false }),
    p('opening', '2026-10-13', 'opening'),
  ]
  it('asks from the operation’s day on: income «Пришло?», expense and transfer «Списалось?»', () => {
    expect(plannedQuestions(txs, today).map((q) => [q.tx.id, q.question])).toEqual([
      ['gehalt', 'Пришло?'],
      ['move', 'Списалось?'],
      ['miete', 'Списалось?'],
    ])
  })
  it('no question before the day', () => expect(plannedQuestions(txs, '2026-11-01').map((q) => q.tx.id)).toEqual([]))
  it('upcoming plan after today', () => expect(upcomingPlanned(txs, today).map((t) => t.id)).toEqual(['later']))
})

describe('rule 3: overspend cuts next week (suggestion)', async () => {
  const { cutNextWeek, moneyWeek } = await import('./money')
  const week = moneyWeek(
    [{ category: 'Продукты', limit_eur: 50 }, { category: 'Шопинг', limit_eur: 20 }],
    [
      { date: '2026-11-10', amount_eur: 62.5, kind: 'expense', category: 'Продукты', envelope_id: null, is_planned: false, confirmed_at: null },
      { date: '2026-11-10', amount_eur: 5, kind: 'expense', category: 'Шопинг', envelope_id: null, is_planned: false, confirmed_at: null },
    ],
    '2026-11-09',
  )
  it('only overspent categories, next limit − overspend', () => {
    expect(cutNextWeek(week, [{ category: 'Продукты', limit_eur: 50 }])).toEqual([{ category: 'Продукты', limitCents: 3750, cutCents: 1250 }])
  })
  it('never below zero; without a next limit uses this week’s', () => {
    expect(cutNextWeek(week, [{ category: 'Продукты', limit_eur: 5 }])).toEqual([{ category: 'Продукты', limitCents: 0, cutCents: 500 }])
    expect(cutNextWeek(week, [])).toEqual([{ category: 'Продукты', limitCents: 3750, cutCents: 1250 }])
  })
})

describe('rule 4: envelopes', async () => {
  const { envelopeSummary, moneyWeek } = await import('./money')
  const tx = (amount_eur: number, envelope_id: string | null, x: Record<string, unknown> = {}) => ({
    date: '2026-11-10',
    amount_eur,
    kind: 'expense',
    category: 'Шопинг',
    envelope_id,
    is_planned: false,
    confirmed_at: null,
    ...x,
  })
  const txs = [tx(80, 'gifts'), tx(30, 'gifts', { is_planned: true }), tx(10, null)]
  it('planned / spent / left', () => {
    expect(envelopeSummary({ id: 'gifts', planned_eur: 200 }, txs)).toEqual({ plannedCents: 20000, spentCents: 8000, leftCents: 12000, overCents: 0 })
  })
  it('overspent envelope', () => {
    expect(envelopeSummary({ id: 'gifts', planned_eur: 50 }, txs)).toMatchObject({ leftCents: 0, overCents: 3000 })
  })
  it('envelope expenses stay out of the week limit', () => {
    expect(moneyWeek([{ category: 'Шопинг', limit_eur: 20 }], txs, '2026-11-09').spentCents).toBe(1000)
  })
})

describe('months table', async () => {
  const { monthsTable } = await import('./money')
  const t = (date: string, kind: string, amount_eur: number, x: Record<string, unknown> = {}) => ({
    date, kind, amount_eur, category: null, envelope_id: null, is_planned: false, confirmed_at: null, cancelled_at: null, ...x,
  })
  it('income, expenses and end balance per month (plan included, cancelled out)', () => {
    const rows = monthsTable([
      t('2026-10-13', 'opening', 1000),
      t('2026-10-20', 'expense', 100),
      t('2026-11-01', 'income', 500, { is_planned: true }),
      t('2026-11-02', 'expense', 50, { is_planned: true, cancelled_at: '2026-11-03T00:00:00Z' }),
    ])
    expect(rows).toEqual([
      { month: '2026-10', incomeCents: 0, expenseCents: 10000, endCents: 90000, hasPlan: false },
      { month: '2026-11', incomeCents: 50000, expenseCents: 0, endCents: 140000, hasPlan: true },
    ])
  })
})
