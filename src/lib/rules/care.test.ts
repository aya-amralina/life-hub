import { describe, expect, it } from 'vitest'
import { careChoice, careDone, careEntries, careTimeOfDay, careTitle, careToggle, parseCare } from './care'
import { dayMarks, type HabitLike, type PlanLike } from './habits'

const care = (id: string, name: string, group: string | null, sort_order: number): HabitLike => ({ id, kind: 'care', name, group_name: group, in_minimum: false, sort_order, archived_at: null })
// the seed of 0021: the clay stick waits for January (its pause is a period of the plan)
const habits = [
  care('m-nia', 'Ниацинамид', 'Утро', 100),
  care('stick', 'Глиняный стик', 'Утро', 110),
  care('e-nia', 'Ниацинамид', 'Вечер', 200),
  care('aze', 'Азелаинка', 'Вечер', 210),
  care('cream', 'Крем для тела', null, 300),
]
const plans: PlanLike[] = habits.map((h) => ({ habit_id: h.id, from_date: h.id === 'stick' ? '2027-01-01' : null, to_date: null }))

describe('care habits', () => {
  it('groups and plain items in order; a habit outside its period is not offered', () => {
    expect(careEntries(habits, plans, '2026-11-19').map(careTitle)).toEqual(['Утро — Ниацинамид', 'Вечер — Ниацинамид или Азелаинка', 'Крем для тела'])
    expect(careEntries(habits, plans, '2027-01-02').map(careTitle)[0]).toBe('Утро — Ниацинамид или Глиняный стик')
  })
  it('a group keeps one choice: another option replaces it, the same clears it', () => {
    const evening = careEntries(habits, plans, '2026-11-19')[1]!
    expect(careToggle(dayMarks([], 'd', false), evening, 'aze')).toEqual([{ habit_id: 'aze', done: true }])
    const chosen = dayMarks([{ habit_id: 'aze', date: 'd', done: true }], 'd', false)
    expect(careChoice(chosen, evening)?.name).toBe('Азелаинка')
    expect(careToggle(chosen, evening, 'e-nia')).toEqual([
      { habit_id: 'e-nia', done: true },
      { habit_id: 'aze', done: false },
    ])
    expect(careToggle(chosen, evening, 'aze')).toEqual([{ habit_id: 'aze', done: false }])
  })
  it('counts done entries (a group once); a plain item toggles', () => {
    const entries = careEntries(habits, plans, '2026-11-19')
    const day = dayMarks(
      [
        { habit_id: 'cream', date: 'd', done: true },
        { habit_id: 'e-nia', date: 'd', done: true },
      ],
      'd',
      false,
    )
    expect(careDone(day, entries)).toBe(2)
    expect(careToggle(day, entries[2]!)).toEqual([{ habit_id: 'cream', done: false }])
  })
  it('adding in settings: «Группа: A | B» or one plain item; the time of day from the group', () => {
    expect(parseCare(' Вечер:  Ниацинамид | Азелаинка ')).toEqual({ group: 'Вечер', names: ['Ниацинамид', 'Азелаинка'] })
    expect(parseCare('Утро: только SPF')).toEqual({ group: null, names: ['Утро: только SPF'] })
    expect(parseCare('Крем для тела')).toEqual({ group: null, names: ['Крем для тела'] })
    expect([careTimeOfDay('Утро'), careTimeOfDay('Вечер'), careTimeOfDay(null)]).toEqual(['morning', 'evening', 'any'])
  })
})

describe('care: only done = true counts', () => {
  it('unmarked rows choose nothing and count nothing', () => {
    const entries = careEntries(habits, plans, '2026-11-19')
    const off = dayMarks(['e-nia', 'aze', 'cream'].map((habit_id) => ({ habit_id, date: 'd', done: false })), 'd', false)
    expect(careDone(off, entries)).toBe(0)
    expect(careChoice(off, entries[1]!)).toBeNull()
  })
})
