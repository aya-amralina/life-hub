import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/20261119200000_habits.sql?raw'
import { backToBack, exerciseVariant, nextInQueue, parseExercises, queueOn, templateCodes, weekTarget } from './workouts'

// The seed of migration 0021 is the plan the rules read.
const A = parseExercises(JSON.parse(/\$a\$([\s\S]*?)\$a\$/.exec(migration)![1]!))
const B = parseExercises(JSON.parse(/\$b\$([\s\S]*?)\$b\$/.exec(migration)![1]!))

describe('workout templates: the seed', () => {
  it('at most 5 exercises of 3 sets, the cardio last; Dead bug and the side plank are in «Кор», not here', () => {
    for (const t of [A, B]) {
      const strength = t.filter((e) => e.kind !== 'cardio')
      expect(strength.length).toBeLessThanOrEqual(5)
      expect(strength.every((e) => e.sets === 3)).toBe(true)
      expect(t.at(-1)).toMatchObject({ kind: 'cardio', reps: '15–20 мин', sets: null })
      expect(t.map((e) => e.name).join()).not.toMatch(/Dead bug|Боковая планка/)
      for (const e of t) expect(e.variants.every((v) => v.home && v.gym)).toBe(true)
    }
    expect(A.map((e) => e.name)).toEqual(['Болгарские выпады', 'Ягодичный мост с пола', 'Румынская тяга на одной ноге', 'Отведения ног с мини-резинкой', 'Кардио'])
    expect(B.map((e) => e.name)).toEqual(['Отжимания', 'Тяга к поясу', 'Жим над головой сидя', 'Махи в стороны', 'Ягодичный мост с мини-резинкой', 'Кардио'])
  })
  it('the variant of the «Кор» stage: bridge on one leg from stage 2, full push-ups from stage 3', () => {
    const bridge = A[1]!
    expect(exerciseVariant(bridge, 1, 'home')).toBe('на двух ногах с мини-резинкой')
    expect(exerciseVariant(bridge, 2, 'home')).toBe('на одной ноге или с рюкзаком')
    expect(exerciseVariant(bridge, 2, 'gym')).toBe('гантель на бёдрах')
    const push = B[0]!
    expect(exerciseVariant(push, 2, 'gym')).toBe('от скамьи или с колен')
    expect(exerciseVariant(push, 3, 'home')).toBe('полные')
  })
  it('malformed data is dropped, not thrown', () => {
    expect(parseExercises(null)).toEqual([])
    expect(parseExercises([{ name: 'no key' }, { key: 'k', name: 'K', variants: [{ from_core_stage: 2, home: 'h' }, { home: 'no stage' }] }])).toEqual([
      { key: 'k', name: 'K', sets: null, reps: '', variants: [{ from_core_stage: 2, home: 'h', gym: '' }] },
    ])
  })
})

describe('workout queue', () => {
  const queue = [
    { starts_on: '2026-11-09', position: 1, template_id: 'A' },
    { starts_on: '2026-11-09', position: 2, template_id: 'B' },
    { starts_on: '2027-01-11', position: 1, template_id: 'A' },
    { starts_on: '2027-01-11', position: 2, template_id: 'B' },
    { starts_on: '2027-01-11', position: 3, template_id: 'A' },
  ]
  it('A → B until 10.01, A → B → A from 11.01', () => {
    expect(queueOn(queue, '2027-01-10').map((q) => q.template_id)).toEqual(['A', 'B'])
    expect(queueOn(queue, '2027-01-11').map((q) => q.template_id)).toEqual(['A', 'B', 'A'])
    expect(weekTarget(queue, '2026-11-20')).toBe(2)
    expect(weekTarget(queue, '2026-11-01')).toBe(0)
  })
  it('no fixed days: the next in order after this week’s sessions; the week full — nothing', () => {
    expect(nextInQueue(queue, [], '2027-01-12')?.template_id).toBe('A')
    expect(nextInQueue(queue, ['2027-01-11'], '2027-01-13')?.template_id).toBe('B')
    expect(nextInQueue(queue, ['2027-01-11', '2027-01-13', '2027-01-13'], '2027-01-15')?.template_id).toBe('A')
    expect(nextInQueue(queue, ['2027-01-11', '2027-01-13', '2027-01-15'], '2027-01-16')).toBeNull()
    expect(nextInQueue(queue, ['2027-01-08'], '2027-01-12')?.template_id).toBe('A') // last week does not count
  })
  it('strength two days in a row — a soft warning', () => {
    expect(backToBack(['2027-01-11'], '2027-01-12')).toBe(true)
    expect(backToBack(['2027-01-11'], '2027-01-13')).toBe(false)
  })
  it('journal codes of templates in use', () => {
    const t = (code: string, archived_at: string | null) => ({ id: code, code, name: code, focus: 'lower', exercises: [], archived_at })
    expect(templateCodes([t('A', null), t('B', null), t('C', '2027-01-01T00:00:00Z')])).toEqual(['A', 'B'])
  })
})
