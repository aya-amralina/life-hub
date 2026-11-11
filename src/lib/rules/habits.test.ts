import { describe, expect, it } from 'vitest'
import { activeHabits, habitsDone, minimumDone, minimumSet, stageForDate, visibleHabits, weekHabitShare, type HabitLog, type StageLike } from './habits'

const stage = (name: string, start: string, end: string, habits: string[]): StageLike => ({
  name,
  sphere: 'body',
  start_date: start,
  end_date: end,
  habits,
})
const log = (date: string, p: Partial<HabitLog> = {}): Partial<HabitLog> => ({
  date,
  morning: false,
  outside: false,
  water: false,
  minimum_mode: false,
  ...p,
})

describe('rule 12 — stage by date', () => {
  const stages = [stage('Этап 1', '2026-11-09', '2026-11-29', ['morning', 'outside']), stage('Этап 2', '2026-11-30', '2026-12-27', ['morning', 'outside', 'water'])]
  it('picks the stage containing the date (inclusive bounds)', () => {
    expect(stageForDate(stages, '2026-11-09')?.name).toBe('Этап 1')
    expect(stageForDate(stages, '2026-11-29')?.name).toBe('Этап 1')
    expect(stageForDate(stages, '2026-11-30')?.name).toBe('Этап 2')
    expect(stageForDate(stages, '2026-11-08')).toBeNull()
  })
  it('ignores stages of other spheres', () => {
    expect(stageForDate([{ ...stages[0]!, sphere: 'study' }], '2026-11-10')).toBeNull()
  })
  it('hides habits that have not started; all three without stages', () => {
    expect(activeHabits(stages[0]!)).toEqual(['morning', 'outside'])
    expect(activeHabits(null)).toEqual(['morning', 'outside', 'water'])
  })
})

describe('rule 13 — «минимум» counts the day', () => {
  it('counts marked habits', () => {
    expect(habitsDone(log('d', { morning: true, water: true }), ['morning', 'outside', 'water'])).toBe(2)
    expect(habitsDone(null, ['morning'])).toBe(0)
  })
  it('minimum mode: the day counts fully once the whole set is marked', () => {
    const all = ['morning', 'outside', 'water'] as const
    expect(habitsDone(log('d', { minimum_mode: true, water: true, outside: true }), all, ['water', 'outside'])).toBe(3)
    expect(minimumDone(log('d', { minimum_mode: true, water: true, outside: true }), ['water', 'outside'])).toBe(true)
  })
  it('minimum mode with the set not complete: only marked habits of the set count', () => {
    const all = ['morning', 'outside', 'water'] as const
    expect(habitsDone(log('d', { minimum_mode: true, water: true, morning: true }), all, ['water', 'outside'])).toBe(1)
    expect(habitsDone(log('d', { minimum_mode: true }), all, ['water', 'outside'])).toBe(0)
    expect(minimumDone(log('d', { minimum_mode: true, water: true }), ['water', 'outside'])).toBe(false)
  })
  it('minimum set: stage field, default water + 10 minutes outside, unknown keys ignored', () => {
    expect(minimumSet(null)).toEqual(['outside', 'water'])
    expect(minimumSet({ minimum_habits: ['morning'] })).toEqual(['morning'])
    expect(minimumSet({ minimum_habits: ['zzz'] })).toEqual(['outside', 'water'])
  })
  it('in minimum mode only the set is shown', () => {
    const st = { habits: ['morning', 'outside', 'water'], minimum_habits: ['water'] }
    expect(visibleHabits(st, true)).toEqual(['water'])
    expect(visibleHabits(st, false)).toEqual(['morning', 'outside', 'water'])
  })
})

describe('rule 14 — week habit share', () => {
  const mon = '2026-11-09'
  it('marked / (active × elapsed days), today included', () => {
    // Wednesday: 3 days × 3 habits = 9 possible; 3 + 2 + 1 marked = 6
    const logs = [
      log('2026-11-09', { morning: true, outside: true, water: true }),
      log('2026-11-10', { morning: true, water: true }),
      log('2026-11-11', { outside: true }),
    ]
    expect(weekHabitShare(logs, [], mon, '2026-11-11')).toBeCloseTo(6 / 9)
  })
  it('missing days count as zero, no reset, a complete minimum day counts fully', () => {
    const logs = [log('2026-11-09', { minimum_mode: true, water: true, outside: true })]
    expect(weekHabitShare(logs, [], mon, '2026-11-10')).toBeCloseTo(3 / 6)
  })
  it('an incomplete minimum day counts its marked habits of the set', () => {
    const logs = [log('2026-11-09', { minimum_mode: true, water: true })]
    expect(weekHabitShare(logs, [], mon, '2026-11-09')).toBeCloseTo(1 / 3)
  })
  it('past week uses all 7 days', () => {
    const logs = [log('2026-11-09', { morning: true })]
    expect(weekHabitShare(logs, [], mon, '2026-11-20')).toBeCloseTo(1 / 21)
  })
  it('active habits are taken per day when a stage starts mid-week', () => {
    const stages = [stage('A', '2026-11-01', '2026-11-10', ['morning']), stage('B', '2026-11-11', '2026-11-30', ['morning', 'water'])]
    const logs = [log('2026-11-09', { morning: true }), log('2026-11-11', { morning: true, water: true })]
    // possible: 1 + 1 + 2 = 4; done: 1 + 0 + 2 = 3
    expect(weekHabitShare(logs, stages, mon, '2026-11-11')).toBeCloseTo(3 / 4)
  })
  it('null before the week starts', () => {
    expect(weekHabitShare([], [], mon, '2026-11-08')).toBeNull()
  })
})
