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

describe('rules 19–23: fixed / flexible, rollover, «Ждут решения»', async () => {
  const { isFixed, planRollover, rolloverCandidates } = await import('./study')
  const weeks = [
    { id: 'w03', start_date: '2026-11-02' },
    { id: 'w04', start_date: '2026-11-09' },
    { id: 'w05', start_date: '2026-11-16' },
  ]
  const s = (id: string, p: Record<string, unknown> = {}) => ({
    id,
    sphere: 'study',
    done_at: null,
    status: 'открыто',
    due_date: null,
    ready_by: null,
    week_id: 'w03',
    hours_est: 2,
    is_fixed: null as boolean | null,
    rollover_count: 0,
    sort_order: 0,
    ...p,
  })
  const current = { monday: '2026-11-09', weekId: 'w04', capacity: { base: 27, max: 36 } }

  it('rule 19: fixed by default when there is an official deadline; the card can override', () => {
    expect(isFixed({ due_date: '2026-11-12', is_fixed: null })).toBe(true)
    expect(isFixed({ due_date: null, is_fixed: null })).toBe(false)
    expect(isFixed({ due_date: '2026-11-12', is_fixed: false })).toBe(false)
    expect(isFixed({ due_date: null, is_fixed: true })).toBe(true)
  })

  it('rule 20: open flexible items of past weeks move in, rollover_count + 1', () => {
    const items = [s('flex'), s('done', { done_at: '2026-11-05T10:00:00Z' }), s('cancelled', { status: 'снято' }), s('thisWeek', { week_id: 'w04' })]
    const plan = planRollover(items, weeks, current)
    expect(plan.moves.map((m) => [m.item.id, m.rollover_count])).toEqual([['flex', 1]])
    expect(plan.waiting).toEqual([])
  })

  it('rule 23: fixed items do not move', () => {
    const items = [s('fixed', { due_date: '2026-11-06' }), s('forced', { is_fixed: true })]
    expect(planRollover(items, weeks, current).moves).toEqual([])
    expect(rolloverCandidates(items, weeks, current.monday)).toEqual([])
  })

  it('idempotent: after applying the moves a second run plans nothing', () => {
    const items = [s('a'), s('b', { rollover_count: 1 })]
    const first = planRollover(items, weeks, current)
    const applied = items.map((i) => {
      const m = first.moves.find((x) => x.item.id === i.id)
      return m ? { ...i, week_id: 'w04', rollover_count: m.rollover_count } : i
    })
    expect(first.moves.map((m) => m.rollover_count)).toEqual([1, 2])
    expect(planRollover(applied, weeks, current)).toEqual({ moves: [], waiting: [] })
  })

  it('rule 21: what does not fit under the maximum waits for a decision; smaller later ones still fit', () => {
    const items = [
      s('full', { week_id: 'w04', hours_est: 33 }), // current week already 33 h of 36
      s('big', { hours_est: 4 }), // 37 > 36 → waits
      s('small', { hours_est: 2 }), // 35 ≤ 36 → moves
      s('tail', { hours_est: 2 }), // 37 → waits
    ]
    const plan = planRollover(items, weeks, current)
    expect(plan.moves.map((m) => m.item.id)).toEqual(['small'])
    expect(plan.waiting.map((i) => i.id)).toEqual(['big', 'tail'])
    // the same data again: still the same decision, nothing moves silently
    expect(planRollover(items, weeks, current).moves.map((m) => m.item.id)).toEqual(['small'])
  })

  it('order: older week first, then «готово к», then sort_order', () => {
    const items = [s('w03late', { ready_by: '2026-11-06' }), s('w03early', { ready_by: '2026-11-03' }), s('noWeekDue', { week_id: null, due_date: '2026-10-28', is_fixed: false })]
    expect(rolloverCandidates(items, weeks, current.monday).map((i) => i.id)).toEqual(['noWeekDue', 'w03early', 'w03late'])
  })

  it('items without any week are not touched', () => {
    expect(rolloverCandidates([s('loose', { week_id: null })], weeks, current.monday)).toEqual([])
  })
})
