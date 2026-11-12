import { describe, expect, it } from 'vitest'
import { eveningAnswered, isEvening, lastBefore, loadPhrase, spentOn, stepSleep } from './day'

describe('day rules', () => {
  it('evening from 18:00', () => {
    expect(isEvening(17)).toBe(false)
    expect(isEvening(18)).toBe(true)
  })
  it('answered questions of «Вечер»: 0 and false are answers', () => {
    expect(eveningAnswered(null)).toEqual({ answered: 0, total: 4 })
    expect(eveningAnswered({ energy: 6, mood: null, slump: false, coffee_cups: 0 })).toEqual({ answered: 3, total: 4 })
  })
  it('last answer before the day', () => {
    const logs = [
      { date: '2026-11-09', sleep_h: 7 },
      { date: '2026-11-11', sleep_h: null },
      { date: '2026-11-10', sleep_h: 8.5 },
      { date: '2026-11-12', sleep_h: 6 },
    ]
    expect(lastBefore(logs, '2026-11-12', (l) => l.sleep_h)).toBe(8.5)
    expect(lastBefore(logs, '2026-11-09', (l) => l.sleep_h)).toBeNull()
  })
  it('sleep stepper: starts at the last value, half-hour steps, 0 … 16', () => {
    expect(stepSleep(null, 1, 8)).toBe(8)
    expect(stepSleep(null, -1, null)).toBe(7.5)
    expect(stepSleep(7.5, 1, null)).toBe(8)
    expect(stepSleep(7.5, -1, null)).toBe(7)
    expect(stepSleep(16, 1, null)).toBe(16)
    expect(stepSleep(0, -1, null)).toBe(0)
  })
  it('spent today: fact expenses of the day, no plan, no week rows', () => {
    const t = (x: Record<string, unknown>) => ({ date: '2026-11-12', amount_eur: 1, kind: 'expense', category: null, envelope_id: null, is_planned: false, confirmed_at: null, ...x })
    expect(spentOn([t({ amount_eur: 4.2 }), t({ amount_eur: 650, is_planned: true }), t({ amount_eur: 3, entry_kind: 'week_budget', is_planned: true, confirmed_at: 'x' }), t({ amount_eur: 9, date: '2026-11-11' }), t({ amount_eur: 100, kind: 'income' })], '2026-11-12')).toBe(420)
  })
  it('study load in plain words', () => {
    expect(loadPhrase({ hours: 9, base: 27, max: 36, status: 'ok' })).toContain('спокойная неделя')
    expect(loadPhrase({ hours: 30, base: 27, max: 36, status: 'tight' })).toContain('нужен Do/Sa ½')
    expect(loadPhrase({ hours: 40, base: 27, max: 36, status: 'over' })).toContain('перегруз')
  })
})
