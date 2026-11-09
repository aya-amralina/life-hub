import { describe, expect, it } from 'vitest'
import { burning, completedOn, isItemOpen, nextTargetAfterHorizon, type ItemLike } from './items'

const base: ItemLike = { id: 'x', done_at: null, status: null, due_date: null, ready_by: null }
const item = (id: string, patch: Partial<ItemLike>): ItemLike => ({ ...base, id, ...patch })

describe('isItemOpen', () => {
  it('open by default', () => expect(isItemOpen(base)).toBe(true))
  it('closed by done_at', () => expect(isItemOpen({ ...base, done_at: '2026-11-09T10:00:00Z' })).toBe(false))
  it.each(['Erledigt', 'Verworfen', 'готово', 'Готово'])('closed by status %s', (status) => {
    expect(isItemOpen({ ...base, status })).toBe(false)
  })
  it.each(['Offen', 'Wartet auf Antwort', 'открыто', 'В процессе'])('open with status %s', (status) => {
    expect(isItemOpen({ ...base, status })).toBe(true)
  })
})

describe('rule 11 «Горит»', () => {
  const today = '2026-11-09'

  it('takes items up to today + 3 days, including overdue, sorted by date', () => {
    const items = [
      item('in4', { due_date: '2026-11-13' }),
      item('in3', { due_date: '2026-11-12' }),
      item('today', { due_date: '2026-11-09' }),
      item('overdue', { due_date: '2026-11-07' }),
      item('nodate', {}),
    ]
    expect(burning(items, today).map((b) => b.item.id)).toEqual(['overdue', 'today', 'in3'])
  })

  it('uses ready_by before due_date', () => {
    // Deadline 18.11 is beyond the horizon, but «готово к» 12.11 is within it
    const it1 = item('study', { due_date: '2026-11-18', ready_by: '2026-11-12' })
    const res = burning([it1], today)
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ date: '2026-11-12', overdue: false })
  })

  it('overdue means the deadline passed, not the ready_by', () => {
    const res = burning([item('a', { due_date: '2026-11-10', ready_by: '2026-11-08' })], today)
    expect(res[0]?.overdue).toBe(false)
    const res2 = burning([item('b', { due_date: '2026-11-08' })], today)
    expect(res2[0]?.overdue).toBe(true)
  })

  it('skips done items', () => {
    const items = [
      item('done', { due_date: '2026-11-09', done_at: '2026-11-09T08:00:00Z' }),
      item('erledigt', { due_date: '2026-11-09', status: 'Erledigt' }),
    ]
    expect(burning(items, today)).toEqual([])
  })
})

describe('completedOn / nextTargetAfterHorizon', () => {
  it('completedOn uses the Berlin day of done_at', () => {
    const items = [
      item('late', { done_at: '2026-11-09T22:30:00Z' }), // 23:30 Berlin, 9 Nov
      item('next', { done_at: '2026-11-09T23:30:00Z' }), // 00:30 Berlin, 10 Nov
      item('open', {}),
    ]
    expect(completedOn(items, '2026-11-09').map((i) => i.id)).toEqual(['late'])
  })
  it('nextTargetAfterHorizon', () => {
    const items = [
      item('a', { due_date: '2026-11-11' }),
      item('b', { due_date: '2026-11-20' }),
      item('c', { due_date: '2026-11-13' }),
      item('d', { due_date: '2026-11-13', done_at: '2026-11-01T00:00:00Z' }),
    ]
    expect(nextTargetAfterHorizon(items, '2026-11-09')).toBe('2026-11-13')
    expect(nextTargetAfterHorizon([], '2026-11-09')).toBeNull()
  })
})
