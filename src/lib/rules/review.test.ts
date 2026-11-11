import { describe, expect, it } from 'vitest'
import { nextWeekAgenda, reviewDue, reviewWeek, splitItem } from './review'

describe('Sunday review', () => {
  it('closes this week on Sat/Sun, the past week otherwise', () => {
    expect(reviewWeek('2026-11-15')).toBe('2026-11-09') // Sun
    expect(reviewWeek('2026-11-14')).toBe('2026-11-09') // Sat
    expect(reviewWeek('2026-11-16')).toBe('2026-11-09') // Mon — late review of the past week
    expect(reviewWeek('2026-11-11')).toBe('2026-11-02') // Wed
  })
  it('the card shows Sat–Mon until completed', () => {
    expect(reviewDue('2026-11-15', false)).toBe(true)
    expect(reviewDue('2026-11-16', false)).toBe(true)
    expect(reviewDue('2026-11-15', true)).toBe(false)
    expect(reviewDue('2026-11-11', false)).toBe(false)
  })
  it('split: two steps with half the hours, the original taken off', () => {
    const s = splitItem({ id: 'x', title: 'Übungsblatt 3', sphere: 'study', area: 'Analysis II', type: 'Задача', hours_est: 3, week_id: 'w' })
    expect(s.create.map((c) => [c.title, c.hours_est, c.rollover_count])).toEqual([
      ['Übungsblatt 3 · шаг 1', 1.5, 0],
      ['Übungsblatt 3 · шаг 2', 1.5, 0],
    ])
    expect(s.close).toEqual({ id: 'x', patch: { status: 'снято' } })
  })
  it('next week agenda: open items by day, deadline or start within Mon–Sun', () => {
    const base = { status: null, done_at: null, due_date: null, sphere: 'work' }
    const items = [
      { ...base, id: 'a', title: 'A', due_date: '2026-11-20' },
      { ...base, id: 'b', title: 'B', happens_on: '2026-11-16' },
      { ...base, id: 'c', title: 'C', due_date: '2026-11-30' },
      { ...base, id: 'd', title: 'D', due_date: '2026-11-18', done_at: '2026-11-10T10:00:00Z' },
    ]
    expect(nextWeekAgenda(items, '2026-11-16').map((x) => [x.item.id, x.kind])).toEqual([
      ['b', 'day'],
      ['a', 'due'],
    ])
  })
})
