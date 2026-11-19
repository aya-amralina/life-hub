import { describe, expect, it } from 'vitest'
import type { AccTx, AccountLike } from './accounts'
import { balanceView } from './accounts'
import { forecastLine } from './charts'
import { forecast, forecastMonths, freeUntil, goalForecast, lifePlanWeeks, lifeTempo, lifeWeekFact, lowestPoint, weekPace, type WeekLimitSum } from './forecast'
import { monthsTable } from './money'

const acc = (id: string, grp: string, sort_order = 0): AccountLike => ({ id, name: id, grp, sort_order, archived: false })
const accounts = [acc('main', 'balance', 10), acc('spark', 'balance', 30), acc('cushion', 'cushion', 50), acc('dep', 'separate', 70), acc('trips', 'separate', 90)]
const START = '2026-11-18'
const TODAY = '2026-11-19' // Thursday
const tx = (p: Partial<AccTx> & { debt_id?: string | null }): AccTx => ({
  date: TODAY,
  amount_eur: 1,
  kind: 'expense',
  category: null,
  envelope_id: null,
  is_planned: false,
  confirmed_at: null,
  cancelled_at: null,
  entry_kind: 'one_off',
  grp: 'Обязательное',
  account_id: null,
  to_account_id: null,
  ...p,
})
const plan = (p: Partial<AccTx> & { debt_id?: string | null }) => tx({ is_planned: true, ...p })
const total = (date: string, amount_eur: number) => tx({ date, amount_eur, entry_kind: 'week_total', grp: 'Жизнь' })

// the pot before the start: four weeks of «Жизнь» as week totals (19.10 … 9.11)
const history = [tx({ date: '2026-10-13', kind: 'opening', amount_eur: 1000 }), total('2026-10-19', 67.86), total('2026-10-26', 3), total('2026-11-02', 68), total('2026-11-09', 90.97)]
const txs: AccTx[] = [
  ...history,
  tx({ date: '2026-11-17', amount_eur: 10, grp: 'Жизнь', category: 'Продукты', account_id: 'main' }), // this week, inside the start
  tx({ date: START, kind: 'opening', amount_eur: 300, account_id: 'main' }),
  tx({ date: START, kind: 'opening', amount_eur: 500, account_id: 'cushion' }),
  tx({ date: START, kind: 'opening', amount_eur: 100, account_id: 'dep' }),
  tx({ date: START, kind: 'opening', amount_eur: 165, account_id: 'trips' }),
  tx({ date: TODAY, amount_eur: 6.96, grp: 'Жизнь', category: 'Кофейни и перекусы', account_id: 'main' }),
  plan({ date: '2026-11-16', amount_eur: 25, entry_kind: 'week_budget', grp: 'Жизнь' }), // this week's budget
  plan({ date: TODAY, amount_eur: 12, title: 'Abo', account_id: 'main' } as Partial<AccTx>), // waits for «Списалось?»
  plan({ date: '2026-11-15', amount_eur: 40, account_id: 'spark' }), // up to the start: inside the start balances
  plan({ date: '2026-11-27', kind: 'income', grp: 'Доход', amount_eur: 1000, account_id: 'spark' }),
  plan({ date: '2026-11-30', kind: 'transfer', amount_eur: 55, account_id: 'main', to_account_id: 'cushion' }),
  plan({ date: '2026-11-30', kind: 'transfer', amount_eur: 100, account_id: 'dep', to_account_id: 'main' }),
  plan({ date: '2026-11-30', amount_eur: 100, grp: 'Долги', account_id: 'main' }),
  plan({ date: '2026-12-01', amount_eur: 650, account_id: 'main' }),
  plan({ date: '2026-12-01', kind: 'income', grp: 'Доход', amount_eur: 3, account_id: 'cushion' }),
  plan({ date: '2026-12-05', kind: 'transfer', amount_eur: 165, account_id: 'trips', to_account_id: 'main' }),
  plan({ date: '2026-12-05', amount_eur: 165, grp: 'Поездки и события', account_id: 'main', envelope_id: 'trip' }),
]
const limits: WeekLimitSum[] = [
  { monday: '2026-11-16', limitCents: 2500 },
  { monday: '2026-11-23', limitCents: 7000 },
]
const END = '2026-12-06'

describe('forecast: «Жизнь» — fact, tempo, plan', () => {
  it('a week costs its total if there is one, else the app expenses with a weekly category (no envelopes, no plan)', () => {
    expect(lifeWeekFact(txs, '2026-11-09')).toBe(9097)
    const week = [
      tx({ date: '2026-11-17', amount_eur: 4, category: 'Продукты' }),
      tx({ date: '2026-11-17', amount_eur: 5, category: 'Продукты', envelope_id: 'e' }),
      tx({ date: '2026-11-17', amount_eur: 6, category: 'Продукты', is_planned: true }),
      tx({ date: '2026-11-17', amount_eur: 7, category: null }),
    ]
    expect(lifeWeekFact(week, '2026-11-16')).toBe(400)
    expect(lifeWeekFact(week, '2026-11-23')).toBeNull()
    expect(lifeWeekFact([...week, total('2026-11-16', 30)], '2026-11-16')).toBe(3000)
  })
  it('the tempo — the median of the last 4 full weeks; this week does not count; fewer than 3 with data — not enough', () => {
    expect(lifeTempo(txs, TODAY)).toMatchObject({ weeklyCents: 6793, enough: true })
    const three = history.filter((t) => t.date !== '2026-10-19')
    expect(lifeTempo(three, TODAY)).toMatchObject({ weeklyCents: 6800, enough: true })
    expect(lifeTempo(history.slice(0, 3), TODAY)).toMatchObject({ enough: false })
  })
  it('by plan: the budget row, else the limits; a week of zeros stays zero; after the last limits — the average of the last 4 above zero', () => {
    const w = lifePlanWeeks(txs, [...limits, { monday: '2026-11-30', limitCents: 0 }, { monday: '2026-12-07', limitCents: 9000 }])
    expect([w('2026-11-16'), w('2026-11-23'), w('2026-11-30'), w('2026-12-07')]).toEqual([2500, 7000, 0, 9000])
    expect(w('2027-01-04')).toBe(Math.round((2500 + 7000 + 9000) / 3))
    expect(lifePlanWeeks([], [])('2027-01-04')).toBe(0)
  })
})

describe('forecast: «Баланс» in three scenarios', () => {
  const f = forecast({ txs, accounts, limits, today: TODAY, end: END })
  it('starts from the fact now and what waits for an answer (after the start only)', () => {
    expect(f.nowCents).toBe(29304) // 300 − 6.96
    expect(f.pendingCents).toBe(-1200)
  })
  it('by plan: the plan as it changes «Баланс», «Жизнь» by the budget, the limits, their average', () => {
    // 281.04 + 1000 − 55 − 650 (pairs give 0, the interest is «Подушка») − (8.04 + 70 + 47.50)
    expect(f.scenarios.plan!.endCents).toBe(45050)
    expect(f.scenarios.plan!.pit).toEqual({ date: '2026-11-26', cents: 23300 }) // the day before the salary
    // the week budget row is replaced, never added: by Sunday this week only what is left of it is gone
    expect(f.days.find((d) => d.date === '2026-11-22')!.plan).toBe(28104 - 804)
  })
  it('by tempo: 67.93 a week (this week what is left of it); careful: the larger of the two each week', () => {
    expect(f.scenarios.tempo!.endCents).toBe(28104 + 29500 - (5097 + 6793 + 6793))
    expect(f.scenarios.careful!.endCents).toBe(28104 + 29500 - (5097 + 7000 + 6793))
    for (const d of f.days) expect(d.careful!).toBeLessThanOrEqual(Math.min(d.plan, d.tempo!))
  })
  it('too few weeks for the tempo — only «по плану»', () => {
    const g = forecast({ txs: txs.filter((t) => t.entry_kind !== 'week_total' || t.date >= '2026-11-02'), accounts, limits, today: TODAY, end: END })
    expect(g.scenarios.tempo).toBeNull()
    expect(g.scenarios.careful).toBeNull()
    expect(g.days[0]!.tempo).toBeNull()
  })
  it('without a start by accounts — the common pot, as before', () => {
    const pot = txs.filter((t) => !(t.kind === 'opening' && t.account_id))
    const g = forecast({ txs: pot, accounts, limits, today: TODAY, end: END })
    expect(g.start).toBeNull()
    expect(g.nowCents).toBe(100000 - 6786 - 300 - 6800 - 9097 - 1000 - 696)
  })
  it('the lowest day — the earliest of equal ones', () => {
    expect(lowestPoint([{ date: 'a', cents: 5 }, { date: 'b', cents: 3 }, { date: 'c', cents: 3 }])).toEqual({ date: 'b', cents: 3 })
  })
})

describe('forecast: «Свободно до …»', () => {
  const envelopes = [
    { id: 'gift', name: 'Подарки', type: 'envelope', archived: false, account_id: 'main', planned_eur: 100 },
    { id: 'trip', name: 'Франкфурт', type: 'envelope', archived: false, account_id: 'trips', planned_eur: 165 },
  ]
  const debts = [
    { id: 'rent', who: 'Залог', direction: 'i_owe', amount_eur: 50, repaid_eur: 0, status: 'open', pot_id: null, due_date: null, account_id: 'main' },
    { id: 'l1', who: 'Депозит', direction: 'i_owe', amount_eur: 100, repaid_eur: 0, status: 'open', pot_id: null, due_date: null, account_id: 'dep' },
  ]
  const list = [
    ...txs,
    tx({ date: START, amount_eur: 20, account_id: 'main', envelope_id: 'gift', grp: 'Поездки и события' }), // inside the start: 80 left
    plan({ date: '2026-11-26', amount_eur: 50, grp: 'Долги', account_id: 'main', debt_id: 'rent' }),
  ]
  const free = (rows = list) => freeUntil({ txs: rows, accounts, limits, envelopes, debts, today: TODAY, end: END })

  it('to the next income into «Баланс»: now − what leaves − «Жизнь» − what is set aside on «Баланс»', () => {
    const r = free()
    expect(r.until).toBe('2026-11-27')
    // 293.04 − 12 (waits) − 48.04 («Жизнь» 19–26.11) − 80 (envelope on Основной) − 50 (debt on Основной, its payment inside)
    expect(r.parts).toEqual({ nowCents: 29304, outCents: 1200, inCents: 0, lifeCents: 4804, reservedCents: 13000 })
    expect(r.cents).toBe(10300)
  })
  it('a planned transfer into «Баланс» in those days adds; an envelope or debt off «Баланс» sets nothing aside', () => {
    expect(free([...list, plan({ date: '2026-11-24', kind: 'transfer', amount_eur: 30, account_id: 'trips', to_account_id: 'main' })]).cents).toBe(13300)
  })
  it('income into «Подушка» does not open the window; none into «Баланс» — to the horizon', () => {
    const r = free(list.filter((t) => !(t.kind === 'income' && t.account_id === 'spark')))
    expect(r.until).toBeNull()
    expect(r.windowEnd).toBe(END)
  })
  it('an unanswered income of a past day is not added', () => {
    const r = free([...list, plan({ date: '2026-11-19', kind: 'income', grp: 'Доход', amount_eur: 500, account_id: 'main' })])
    expect(r.cents).toBe(10300)
  })
  it('below zero — as is', () => {
    expect(free([...list, plan({ date: '2026-11-20', amount_eur: 500, account_id: 'main' })]).cents).toBe(10300 - 50000)
  })
})

describe('forecast: goals', () => {
  const goals = [
    { id: 'g', type: 'goal', archived: false, account_id: 'cushion', goal_eur: 535, goal_date: '2026-12-31' },
    { id: 'a', type: 'goal', archived: false, account_id: 'kz', goal_eur: 1000, goal_date: '2027-05-31' },
    { id: 'b', type: 'goal', archived: false, account_id: 'kz', goal_eur: 300, goal_date: '2026-12-31' },
  ]
  const accs = [...accounts, acc('kz', 'cushion', 60)]
  const base = { goals, accounts: accs, txs, balances: [] as { date: string; envelope_id: string | null; amount_eur: number }[], today: TODAY }
  it('alone on its account: now — the account; a month’s share to the due date; the pace needs 14 days', () => {
    const r = goalForecast(goals[0]!, base)!
    expect(r).toMatchObject({ nowCents: 50000, leftCents: 3500, perMonthCents: Math.round(3500 / (42 / (365.25 / 12))), pace: 'none' })
  })
  it('the pace of an account since the start, and when it closes', () => {
    const later = [...txs, tx({ date: '2026-11-25', kind: 'transfer', amount_eur: 14, account_id: 'main', to_account_id: 'cushion' })]
    const r = goalForecast(goals[0]!, { ...base, txs: later, today: '2026-12-02' })!
    // 500 → 514 in 14 days: 1 € a day, 21 left
    expect(r.pace).toEqual({ perMonthCents: Math.round(100 * (365.25 / 12)), closesOn: '2026-12-23' })
  })
  it('sharing an account: by its shares — the latest is now; two of them 14 days apart give the pace', () => {
    const balances = [
      { date: START, envelope_id: 'a', amount_eur: 100 },
      { date: '2026-12-02', envelope_id: 'a', amount_eur: 170 },
    ]
    const r = goalForecast(goals[1]!, { ...base, balances, today: '2026-12-02' })!
    expect(r).toMatchObject({ nowCents: 17000, leftCents: 83000, pace: { perMonthCents: Math.round(500 * (365.25 / 12)), closesOn: '2027-05-17' } })
    expect(goalForecast(goals[1]!, { ...base, balances: [balances[1]!, { ...balances[0]!, amount_eur: 200 }], today: '2026-12-02' })!.pace).toBe('not_growing')
  })
  it('less than a month to go — only what is left; reached or no target — nothing', () => {
    expect(goalForecast(goals[2]!, { ...base, today: '2026-12-10' })).toMatchObject({ leftCents: 30000, perMonthCents: null })
    expect(goalForecast({ ...goals[0]!, goal_eur: 400 }, base)).toBeNull()
    expect(goalForecast({ ...goals[0]!, goal_eur: null }, base)).toBeNull()
  })
})

describe('forecast: the pace of the week', () => {
  const mon = '2026-11-16'
  it('from Wednesday to Saturday, linear by the days gone', () => {
    expect(weekPace(1696, 2500, mon, '2026-11-19')).toEqual({ projectedCents: 2968, limitCents: 2500 })
    expect(weekPace(1200, 2500, mon, '2026-11-18')).toEqual({ projectedCents: 2800, limitCents: 2500 })
  })
  it('Monday, Tuesday and Sunday, no limits or nothing spent — nothing', () => {
    expect(weekPace(1000, 2500, mon, '2026-11-17')).toBeNull()
    expect(weekPace(1000, 2500, mon, '2026-11-22')).toBeNull()
    expect(weekPace(1000, 0, mon, '2026-11-19')).toBeNull()
    expect(weekPace(0, 2500, mon, '2026-11-19')).toBeNull()
  })
})

describe('forecast: «Месяцы» and the chart', () => {
  const f = forecast({ txs, accounts, limits, today: TODAY, end: END })
  it('from today’s month: the end by plan, «Жизнь» by plan instead of the week budget rows', () => {
    const view = balanceView(txs, accounts, TODAY)
    const rows = forecastMonths(monthsTable(txs, TODAY, END, view), f, txs)
    const nov = rows.find((r) => r.month === '2026-11')!
    const dec = rows.find((r) => r.month === '2026-12')!
    expect(dec.endCents).toBe(f.scenarios.plan!.endCents) // 6.12, the horizon here
    expect(nov.endCents).toBe(f.days.find((d) => d.date === '2026-11-30')!.plan)
    const plain = monthsTable(txs, TODAY, END, view).find((r) => r.month === '2026-11')!
    // November: the 25 € week budget row out, «Жизнь» by plan 19–30.11 in (8.04 + 70 + 47.50 / 7)
    expect(nov.expenseCents - plain.expenseCents).toBe(-2500 + f.days.find((d) => d.date === '2026-11-30')!.lifePlan)
    expect(rows.find((r) => r.month === '2026-10')).toEqual(monthsTable(txs, TODAY, END, view).find((r) => r.month === '2026-10'))
  })
  it('the line: the fact to today, the plan and the corridor from today; today, the lowest day and the horizon included', () => {
    const line = forecastLine(f, (d) => balanceView(txs, accounts, TODAY).at(d, 'fact'), START, TODAY, 8)
    expect(line.length).toBeLessThanOrEqual(8)
    for (const k of [TODAY, '2026-11-26', END]) expect(line.some((p) => p.key === k)).toBe(true)
    const today = line.find((p) => p.key === TODAY)!
    expect(today).toMatchObject({ fact: 293, plan: Math.round(f.days[0]!.plan / 100) }) // whole euros: an estimate
    expect(line.find((p) => p.key === START)).toMatchObject({ fact: 300, plan: null, low: null, high: null })
    for (const p of line.filter((x) => x.key >= TODAY)) expect(p.low! <= p.plan! && p.plan! <= p.high!).toBe(true)
  })
})
