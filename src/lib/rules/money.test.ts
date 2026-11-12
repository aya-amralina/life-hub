import { describe, expect, it } from 'vitest'
import { isFact, moneyWeek, weekSpendings, type TxLike } from './money'

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

describe('«Траты недели» — only what counts for the week', () => {
  it('fact with a weekly category; no planned, one-off or week rows; envelope expenses listed but not in the limit sum', () => {
    const txs = [
      tx({ date: '2026-11-10', amount_eur: 12, category: 'Продукты' }),
      tx({ date: '2026-11-12', amount_eur: 4.2, category: 'Кофейни и перекусы' }),
      tx({ date: '2026-11-11', amount_eur: 20, category: 'Продукты', envelope_id: 'e1' }),
      tx({ date: '2026-11-12', amount_eur: 650, category: null }),
      tx({ date: '2026-11-12', amount_eur: 30, category: 'Продукты', is_planned: true, confirmed_at: null }),
      tx({ date: '2026-11-12', amount_eur: 3, category: null, entry_kind: 'week_budget', is_planned: true, confirmed_at: 'x' }),
      tx({ date: '2026-11-16', amount_eur: 9, category: 'Продукты' }),
    ]
    const w = weekSpendings(txs, '2026-11-09')
    expect(w.list.map((t) => t.amount_eur)).toEqual([4.2, 20, 12])
    expect(w.limitCents).toBe(1620)
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
    ], '2026-10-20')
    expect(rows).toEqual([
      { month: '2026-10', incomeCents: 0, expenseCents: 10000, endCents: 90000, hasPlan: false },
      { month: '2026-11', incomeCents: 50000, expenseCents: 0, endCents: 140000, hasPlan: true },
    ])
  })
})

describe('rule 18a: week budgets («Неделя N»)', async () => {
  const { balanceAt, plannedQuestions } = await import('./money')
  const t = (id: string, date: string, kind: string, amount_eur: number, x: Record<string, unknown> = {}) => ({
    id, date, kind, amount_eur, category: null, envelope_id: null, is_planned: false, confirmed_at: null, cancelled_at: null, grp: 'Жизнь', entry_kind: 'one_off', ...x,
  })
  const today = '2026-11-11' // Wed of the week 09.11–15.11
  const txs = [
    t('o', '2026-10-13', 'opening', 1000, { grp: null }),
    t('w4', '2026-11-02', 'expense', 100, { is_planned: true, entry_kind: 'week_budget' }), // finished week
    t('w5', '2026-11-09', 'expense', 100, { is_planned: true, entry_kind: 'week_budget' }), // current week
    t('w6', '2026-11-16', 'expense', 100, { is_planned: true, entry_kind: 'week_budget' }), // later week
    t('coffee', '2026-11-10', 'expense', 30, { confirmed_at: '2026-11-10T10:00:00Z', category: 'Кофейни и перекусы' }), // spent from the app
  ]
  it('never asks «Списалось?»', () => expect(plannedQuestions(txs, today)).toEqual([]))
  it('finished week drops out; current costs max(budget, spent); later counts in full', () => {
    // 1000 − 30 (spent) − 70 (rest of w5) − 100 (w6); w4 is gone
    expect(balanceAt(txs, '2026-12-31', 'plan', today)).toBe(80000)
  })
  it('spent over the budget: the current week costs what was spent', () => {
    const over = [...txs, t('big', '2026-11-11', 'expense', 150, { confirmed_at: '2026-11-11T10:00:00Z', category: 'Продукты' })]
    // 1000 − 180 spent − 0 rest − 100 (w6)
    expect(balanceAt(over, '2026-12-31', 'plan', today)).toBe(72000)
  })
  it('fact never includes week budgets', () => expect(balanceAt(txs, '2026-12-31', 'fact', today)).toBe(97000))
  it('a one-off purchase of the plan (no weekly category) does not eat the week budget', () => {
    const shoes = [...txs, t('shoes', '2026-11-10', 'expense', 50, { confirmed_at: '2026-11-10T10:00:00Z' })]
    // 1000 − 30 − 70 (rest of w5) − 100 (w6) − 50 shoes
    expect(balanceAt(shoes, '2026-12-31', 'plan', today)).toBe(75000)
  })
})

describe('rule 26: a week with «Неделя N (факт)» — app expenses stay in categories, not in the balance', async () => {
  const { balanceAt, moneyWeek } = await import('./money')
  const t = (date: string, kind: string, amount_eur: number, x: Record<string, unknown> = {}) => ({
    date, kind, amount_eur, category: null, envelope_id: null, is_planned: false, confirmed_at: null, cancelled_at: null, grp: 'Жизнь', entry_kind: 'one_off', ...x,
  })
  const txs = [
    t('2026-10-13', 'opening', 1000, { grp: null }),
    t('2026-11-02', 'expense', 120, { entry_kind: 'week_total', confirmed_at: '2026-11-08T12:00:00Z' }), // «Неделя 4 (факт)»
    t('2026-11-03', 'expense', 30, { category: 'Продукты' }), // app expense inside that week
    t('2026-11-10', 'expense', 20, { category: 'Продукты' }), // app expense, week without a fact
  ]
  it('balance counts the fact row, not the app expenses of that week', () => {
    expect(balanceAt(txs, '2026-12-31', 'fact', '2026-11-11')).toBe(100000 - 12000 - 2000)
  })
  it('the category stats of that week still see the app expense', () => {
    expect(moneyWeek([{ category: 'Продукты', limit_eur: 50 }], txs, '2026-11-02').spentCents).toBe(3000)
  })
})

describe('reconciliation: real balances vs the calculated balance', async () => {
  const { reconcile } = await import('./money')
  const t = (date: string, kind: string, amount_eur: number, x: Record<string, unknown> = {}) => ({
    date, kind, amount_eur, category: null, envelope_id: null, is_planned: false, confirmed_at: null, cancelled_at: null, ...x,
  })
  const txs = [
    t('2026-10-13', 'opening', 1000),
    t('2026-11-10', 'expense', 100),
    t('2026-11-12', 'expense', 50, { is_planned: true }), // planned: not in the calculated «now»
  ]
  const accounts = ['Revolut', 'Sparkasse', 'Наличные']
  it('latest entry with amounts; within 1 € it matches', () => {
    const r = reconcile(
      [
        { date: '2026-11-01', balances: { Revolut: '999' } },
        { date: '2026-11-15', balances: { Revolut: '600,50', Sparkasse: '300', Наличные: '' } },
      ],
      txs,
      accounts,
    )
    expect(r).toMatchObject({ date: '2026-11-15', actualCents: 90050, calculatedCents: 90000, diffCents: 50, matches: true, missing: ['Наличные'] })
  })
  it('a real difference is named', () => {
    expect(reconcile([{ date: '2026-11-15', balances: { Revolut: '850' } }], txs, accounts)).toMatchObject({ diffCents: -5000, matches: false })
  })
  it('nothing entered — nothing to compare', () => {
    expect(reconcile([{ date: '2026-11-15', balances: { Revolut: '' } }], txs, accounts)).toBeNull()
    expect(reconcile([], txs, accounts)).toBeNull()
  })
})

describe('goals, debts, envelopes left', async () => {
  const { debtSummary, envelopesLeft, goalProgress, reconcile } = await import('./money')
  const tx = (x: Record<string, unknown>) => ({ date: '2026-11-10', amount_eur: 0, kind: 'expense', category: null, envelope_id: null, is_planned: false, confirmed_at: null, ...x })
  const pot = { id: 'E5', goal_eur: 1000, goal_date: '2027-03-31' }
  const loan = { id: 'L2', direction: 'from_pot', amount_eur: 150, repaid_eur: 50, status: 'open', pot_id: 'E5', due_date: null }
  it('goal now = the latest balance of its pocket; borrowed from it is shown', () => {
    const g = goalProgress(
      pot,
      [
        { date: '2026-11-01', envelope_id: 'E5', amount_eur: 300 },
        { date: '2026-11-15', envelope_id: 'E5', amount_eur: 390 },
        { date: '2026-11-20', envelope_id: 'E1', amount_eur: 50 },
      ],
      [loan],
    )
    expect(g).toMatchObject({ nowCents: 39000, asOf: '2026-11-15', targetCents: 100000, share: 0.39, borrowedCents: 10000 })
    expect(goalProgress(pot, [], []).nowCents).toBeNull()
  })
  it('debt repaid: linked confirmed operations win over the table value', () => {
    expect(debtSummary(loan, [])).toMatchObject({ repaidCents: 5000, leftCents: 10000, fromOperations: false })
    expect(debtSummary(loan, [tx({ debt_id: 'L2', amount_eur: 70 }), tx({ debt_id: 'L2', amount_eur: 30, is_planned: true })])).toMatchObject({ repaidCents: 7000, leftCents: 8000, fromOperations: true })
  })
  it('«Отложено» counts only envelopes of type «конверт»', () => {
    const envs = [
      { id: 'E1', planned_eur: 200, type: 'envelope' },
      { id: 'E5', planned_eur: 999, type: 'goal' },
    ]
    expect(envelopesLeft(envs, [tx({ envelope_id: 'E1', amount_eur: 80 })])).toBe(12000)
  })
  it('reconciliation sums accounts only, not pockets', () => {
    const r = reconcile([{ date: '2026-11-15', balances: { Revolut: 500, E5: 390 } }], [tx({ kind: 'opening', amount_eur: 500, date: '2026-10-13' })], ['Revolut', 'Sparkasse'])
    expect(r).toMatchObject({ actualCents: 50000, matches: true })
  })
})
