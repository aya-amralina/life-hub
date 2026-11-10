import { describe, expect, it } from 'vitest'
import { hoursDone, nextTest, readyBy, studyItemsOfWeek, weekCapacity, weekLoad, type StudyItemLike } from './study'

const it_ = (id: string, p: Partial<StudyItemLike & { type: string | null }> = {}) => ({
  id,
  sphere: 'study',
  done_at: null,
  status: null,
  due_date: null,
  ready_by: null,
  week_id: null,
  hours_est: null,
  type: null,
  ...p,
})

describe('rule 6 — «готово к»', () => {
  it('SPEC example: Wed 28.10 → Sat 24.10', () => expect(readyBy('2026-10-28')).toBe('2026-10-24'))
  it('Fri → Wed', () => expect(readyBy('2026-10-30')).toBe('2026-10-28'))
  it('Tue → Sun → previous Saturday', () => expect(readyBy('2026-10-27')).toBe('2026-10-24'))
  it('Thu → Tue', () => expect(readyBy('2026-10-29')).toBe('2026-10-27'))
  it('crosses the year', () => expect(readyBy('2027-01-06')).toBe('2027-01-02'))
})

describe('rule 7 — week load', () => {
  it('default 27 / 36, ½ mode 13,5 / 18, explicit values win', () => {
    expect(weekCapacity(null)).toEqual({ base: 27, max: 36 })
    expect(weekCapacity({ id: 'w', start_date: '2026-11-09', place_mode: 'у сестры ½', capacity_base_h: null, capacity_max_h: null })).toEqual({ base: 13.5, max: 18 })
    expect(weekCapacity({ id: 'w', start_date: '2026-11-09', place_mode: null, capacity_base_h: 20, capacity_max_h: 25 })).toEqual({ base: 20, max: 25 })
  })
  it('statuses at the bounds', () => {
    const cap = { base: 27, max: 36 }
    expect(weekLoad([{ hours_est: 27 }], cap).status).toBe('ok')
    expect(weekLoad([{ hours_est: 27.5 }], cap).status).toBe('tight')
    expect(weekLoad([{ hours_est: 36 }], cap).status).toBe('tight')
    expect(weekLoad([{ hours_est: 36.5 }], cap).status).toBe('over')
  })
  it('sums hours without float drift; null hours = 0', () => {
    expect(weekLoad([{ hours_est: 0.1 }, { hours_est: 0.2 }, { hours_est: null }], { base: 1, max: 2 }).hours).toBe(0.3)
  })
  it('items of week: by week_id, else by deadline in Mon–Sun', () => {
    const items = [
      it_('a', { week_id: 'w1' }),
      it_('b', { week_id: 'w2' }),
      it_('c', { due_date: '2026-11-15' }),
      it_('d', { due_date: '2026-11-16' }),
      { ...it_('e', { week_id: 'w1' }), sphere: 'work' },
    ]
    expect(studyItemsOfWeek(items, '2026-11-09', 'w1').map((i) => i.id)).toEqual(['a', 'c'])
    expect(studyItemsOfWeek(items, '2026-11-09', null).map((i) => i.id)).toEqual(['c'])
  })
  it('hoursDone counts closed items', () => {
    expect(hoursDone([it_('a', { hours_est: 2, done_at: 'x' }), it_('b', { hours_est: 3 })])).toBe(2)
  })
})

describe('nearest test', () => {
  it('picks the earliest open test from today', () => {
    const items = [
      it_('late', { type: 'Тест', due_date: '2026-11-20' }),
      it_('soon', { type: 'Тест', due_date: '2026-11-12' }),
      it_('past', { type: 'Тест', due_date: '2026-11-08' }),
      it_('done', { type: 'Тест', due_date: '2026-11-10', done_at: 'x' }),
      it_('ha', { type: 'HA', due_date: '2026-11-10' }),
    ]
    expect(nextTest(items, '2026-11-09')).toMatchObject({ item: { id: 'soon' }, days: 3 })
    expect(nextTest([], '2026-11-09')).toBeNull()
  })
})
