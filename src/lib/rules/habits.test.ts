import { describe, expect, it } from 'vitest'
import {
  activeOn,
  dueOn,
  isDueOn,
  isoWeekday,
  weekDoneBefore,
  dayMarks,
  daySet,
  habitsDone,
  isActiveOn,
  minimumDone,
  minimumOn,
  minimumPhrase,
  stageForDate,
  visibleOn,
  weekHabitShare,
  type HabitLike,
  type MarkLike,
  type PlanLike,
} from './habits'

const habit = (id: string, p: Partial<HabitLike> = {}): HabitLike => ({ id, kind: 'habit', name: id, in_minimum: false, sort_order: 0, archived_at: null, ...p })
// the seed of 0021: outside, water active always; «Утренний старт» archived without a period; «Кор» from its start
const outside = habit('outside', { name: '10 мин на улице', phrase: '10 минут на улице', sort_order: 10 })
const water = habit('water', { name: 'Вода', phrase: 'вода', sort_order: 20, in_minimum: true })
const morning = habit('morning', { name: 'Утренний старт', sort_order: 5, archived_at: '2026-11-18T23:00:00Z' })
const core = habit('core', { kind: 'program', name: 'Кор', phrase: 'кор', sort_order: 30 })
const habits = [outside, water, morning, core]
const plans: PlanLike[] = [
  { habit_id: 'outside', from_date: null, to_date: null },
  { habit_id: 'water', from_date: null, to_date: null },
  { habit_id: 'core', from_date: '2026-11-19', to_date: null },
]
const mark = (habit_id: string, date: string, done = true): MarkLike => ({ habit_id, date, done })

describe('rule 12 — a habit is active by its plan and archive', () => {
  it('inside a period; no period — never; archived — not from its archive day (Berlin)', () => {
    const withMorning = [...plans, { habit_id: 'morning', from_date: '2026-11-09', to_date: null }]
    expect(isActiveOn(outside, plans, '2020-01-01')).toBe(true)
    expect(isActiveOn(morning, withMorning, '2026-11-18')).toBe(true)
    expect(isActiveOn(morning, withMorning, '2026-11-19')).toBe(false)
    expect(isActiveOn(morning, plans, '2026-11-10')).toBe(false)
    expect(isActiveOn(core, plans, '2026-11-18')).toBe(false)
    expect(isActiveOn(habit('x'), [{ habit_id: 'x', from_date: '2027-01-01', to_date: '2027-01-31' }], '2027-02-01')).toBe(false)
  })
  it('daily habits in their order; programs apart', () => {
    expect(activeOn(habits, plans, '2026-11-19').map((h) => h.id)).toEqual(['outside', 'water'])
    expect(activeOn(habits, plans, '2026-11-19', 'program').map((h) => h.id)).toEqual(['core'])
    expect(daySet(habits, plans, '2026-11-19', true).active).toEqual(['outside', 'water', 'core'])
    expect(daySet(habits, plans, '2026-11-18', true).active).toEqual(['outside', 'water'])
  })
  it('the stage name is still picked by date', () => {
    const stages = [{ name: 'Этап 1', sphere: 'body', start_date: '2026-11-09', end_date: '2026-11-22' }]
    expect(stageForDate(stages, '2026-11-22')?.name).toBe('Этап 1')
    expect(stageForDate(stages, '2026-11-23')).toBeNull()
  })
})

describe('rule 13 — minimum is a field of the habit', () => {
  it('the set, the phrase; none marked — all daily habits', () => {
    expect(minimumOn(habits, plans, '2026-11-19').map((h) => h.id)).toEqual(['water'])
    expect(minimumPhrase(minimumOn(habits, plans, '2026-11-19'))).toBe('вода')
    const none = habits.map((h) => ({ ...h, in_minimum: false }))
    expect(minimumPhrase(minimumOn(none, plans, '2026-11-19'))).toBe('10 минут на улице и вода')
    expect(visibleOn(habits, plans, '2026-11-19', true).map((h) => h.id)).toEqual(['water'])
    expect(visibleOn(habits, plans, '2026-11-19', false).map((h) => h.id)).toEqual(['outside', 'water'])
  })
  it('a complete minimum day counts fully; an incomplete one — its marked habits of the set', () => {
    const all = ['outside', 'water']
    expect(habitsDone(dayMarks([mark('water', 'd')], 'd', true), all, ['water'])).toBe(2)
    expect(habitsDone(dayMarks([], 'd', true), all, ['water'])).toBe(0)
    expect(habitsDone(dayMarks([mark('outside', 'd')], 'd', false), all, ['water'])).toBe(1)
    expect(minimumDone(dayMarks([mark('water', 'd')], 'd', true), ['water'])).toBe(true)
    expect(minimumDone(dayMarks([mark('water', 'd')], 'd', false), ['water'])).toBe(false)
  })
  it('a later «done = false» unmarks; extra ids (a finished session) count as done', () => {
    const day = dayMarks([mark('water', 'd'), mark('water', 'd', false), mark('outside', 'e')], 'd', false, ['core'])
    expect([...day.done]).toEqual(['core'])
  })
})

describe('rule 14 — week habit share', () => {
  const mon = '2026-11-09'
  const marks = [mark('outside', '2026-11-09'), mark('water', '2026-11-09'), mark('water', '2026-11-10'), mark('outside', '2026-11-11')]
  const day = (d: string) => dayMarks(marks, d, false)
  const set = (d: string) => daySet(habits, plans, d)
  it('marked / (active × elapsed days), today included', () => {
    expect(weekHabitShare(day, set, mon, '2026-11-11')).toBeCloseTo(4 / 6)
  })
  it('past week uses all 7 days; before the week — null', () => {
    expect(weekHabitShare(day, set, mon, '2026-11-20')).toBeCloseTo(4 / 14)
    expect(weekHabitShare(day, set, mon, '2026-11-08')).toBeNull()
  })
  it('a habit that starts mid-week counts from its day', () => {
    const later = [...plans, { habit_id: 'new', from_date: '2026-11-11', to_date: null }]
    const withNew = [...habits, habit('new', { sort_order: 40 })]
    // possible: 2 + 2 + 3 = 7; done: 2 + 1 + 1
    expect(weekHabitShare(day, (d) => daySet(withNew, later, d), mon, '2026-11-11')).toBeCloseTo(4 / 7)
  })
})

describe('only done = true counts — everywhere a mark is read', () => {
  // every habit of the day has a row, all of them unmarked
  const off = [mark('outside', '2026-11-19', false), mark('water', '2026-11-19', false)]
  const day = dayMarks(off, '2026-11-19', false)
  const set = daySet(habits, plans, '2026-11-19')
  it('the day card, the week, the minimum', () => {
    expect(day.done.size).toBe(0)
    expect(habitsDone(day, set.active, set.minimum)).toBe(0)
    expect(habitsDone(dayMarks(off, '2026-11-19', true), set.active, set.minimum)).toBe(0)
    expect(minimumDone(dayMarks(off, '2026-11-19', true), set.minimum)).toBe(false)
    expect(weekHabitShare((d) => dayMarks(off, d, false), (d) => daySet(habits, plans, d), '2026-11-16', '2026-11-19')).toBe(0)
  })
})

describe('frequency (applied since step 3)', () => {
  it('daily, weekdays, every other day from starts_on (back in time too), N a week', () => {
    expect(isDueOn({ freq: 'daily' }, '2026-11-19')).toBe(true)
    expect(isDueOn({}, '2026-11-19')).toBe(true)
    expect(isDueOn({ freq: 'weekdays', freq_weekdays: [1, 4] }, '2026-11-19')).toBe(true) // Thu
    expect(isDueOn({ freq: 'weekdays', freq_weekdays: [1, 4] }, '2026-11-20')).toBe(false)
    const eod = { freq: 'every_other_day', starts_on: '2026-11-23' }
    expect([isDueOn(eod, '2026-11-23'), isDueOn(eod, '2026-11-24'), isDueOn(eod, '2026-11-25'), isDueOn(eod, '2026-11-21'), isDueOn(eod, '2026-11-20')]).toEqual([true, false, true, true, false])
    const weekly = { freq: 'per_week', freq_per_week: 1 }
    expect(isDueOn(weekly, '2027-01-05', 0)).toBe(true)
    expect(isDueOn(weekly, '2027-01-06', 1)).toBe(false)
    expect(isDueOn(weekly, '2027-01-06', 1, true)).toBe(true)
    expect(isoWeekday('2026-11-22')).toBe(7)
  })
  it('the screen shows what is due; the week counts marks before the day', () => {
    const stick = habit('stick', { kind: 'care', freq: 'per_week', freq_per_week: 1, starts_on: '2027-01-01' })
    const p = [{ habit_id: 'stick', from_date: '2027-01-01', to_date: null }]
    const done = [mark('stick', '2027-01-04')] // Mon
    expect(weekDoneBefore(done, 'stick', '2027-01-06')).toBe(1)
    expect(dueOn([stick], p, '2027-01-04', 'care', done).map((h) => h.id)).toEqual(['stick']) // marked that day
    expect(dueOn([stick], p, '2027-01-06', 'care', done)).toEqual([])
    expect(dueOn([stick], p, '2027-01-11', 'care', done).map((h) => h.id)).toEqual(['stick']) // a new week
    expect(dueOn([stick], p, '2026-12-30', 'care', [])).toEqual([]) // before its period
  })
  it('counts: a habit not due is not a miss; «N a week» counts only on a marked day', () => {
    const eod = habit('eod', { freq: 'every_other_day', starts_on: '2026-11-19', sort_order: 40 })
    const weekly = habit('weekly', { freq: 'per_week', freq_per_week: 2, sort_order: 50 })
    const p = [...plans, { habit_id: 'eod', from_date: null, to_date: null }, { habit_id: 'weekly', from_date: null, to_date: null }]
    const all = [...habits, eod, weekly]
    expect(daySet(all, p, '2026-11-19').active).toEqual(['outside', 'water', 'eod'])
    expect(daySet(all, p, '2026-11-20').active).toEqual(['outside', 'water'])
    expect(daySet(all, p, '2026-11-20', false, new Set(['weekly'])).active).toEqual(['outside', 'water', 'weekly'])
  })
  it('the minimum with programs: «Кор» in the minimum', () => {
    const coreMin = { ...core, in_minimum: true }
    expect(minimumOn([outside, water, coreMin], plans, '2026-11-19', true).map((h) => h.id)).toEqual(['water', 'core'])
    expect(minimumOn([outside, water, coreMin], plans, '2026-11-19').map((h) => h.id)).toEqual(['water'])
  })
})
