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
