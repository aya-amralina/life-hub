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

describe('closing statuses: done vs cancelled', () => {
  it.each(['снято', 'Отменено', 'Verworfen'])('%s closes the item but is not done', async (status) => {
    const { isItemDone, isItemCancelled } = await import('./items')
    expect(isItemOpen({ ...base, status })).toBe(false)
    expect(isItemDone({ ...base, status })).toBe(false)
    expect(isItemCancelled({ ...base, status })).toBe(true)
  })
  it('checked item is done', async () => {
    const { isItemDone } = await import('./items')
    expect(isItemDone({ ...base, done_at: '2026-11-09T10:00:00Z' })).toBe(true)
  })
})

describe('rule 15: deadline kind by fields', async () => {
  const { deadlineKind } = await import('./items')
  it('open — no dates', () => expect(deadlineKind({ due_date: null, starts_on: null, happens_on: null })).toBe('open'))
  it('day — happens_on', () => expect(deadlineKind({ due_date: null, starts_on: null, happens_on: '2026-11-12' })).toBe('day'))
  it('from — starts_on', () => expect(deadlineKind({ due_date: null, starts_on: '2026-12-01', happens_on: null })).toBe('from'))
  it('from + deadline combine', () => expect(deadlineKind({ due_date: '2026-12-15', starts_on: '2026-12-01', happens_on: null })).toBe('from'))
  it('deadline — due_date only', () => expect(deadlineKind({ due_date: '2026-12-15', starts_on: null, happens_on: null })).toBe('deadline'))
})

describe('rule 16: starts_on hides the item until the date («Скоро»)', async () => {
  const { isUpcoming } = await import('./items')
  const today = '2026-11-09'
  it('later start is upcoming', () => expect(isUpcoming({ starts_on: '2026-11-16' }, today)).toBe(true))
  it('from the start date on it is a normal item', () => expect(isUpcoming({ starts_on: today }, today)).toBe(false))
  it('no start — never upcoming', () => expect(isUpcoming({ starts_on: null }, today)).toBe(false))
  it('«Горит» leaves out items that start later, even with a near deadline', () => {
    const items = [item('later', { starts_on: '2026-11-10', due_date: '2026-11-11' }), item('now', { starts_on: '2026-11-08', due_date: '2026-11-11' })]
    expect(burning(items, today).map((b) => b.item.id)).toEqual(['now'])
  })
})

describe('rule 17 «Состоялось?» after happens_on', async () => {
  const { happenedQuestions, itemsOfDay } = await import('./items')
  const today = '2026-11-10'
  const items = [
    item('past', { happens_on: '2026-11-09' }),
    item('older', { happens_on: '2026-11-02' }),
    item('today', { happens_on: today, happens_time: '15:00:00' }),
    item('allday', { happens_on: today }),
    item('pastDone', { happens_on: '2026-11-09', done_at: '2026-11-09T16:00:00Z' }),
    item('pastCancelled', { happens_on: '2026-11-09', status: 'Отменено' }),
  ]
  it('asks for open items whose day passed, oldest first', () => {
    expect(happenedQuestions(items, today).map((i) => i.id)).toEqual(['older', 'past'])
  })
  it('today’s items are in «Сегодня», all-day first', () => {
    expect(itemsOfDay(items, today).map((i) => i.id)).toEqual(['allday', 'today'])
  })
})

describe('deadline chips (design 06)', async () => {
  const { deadlineChip, historyChips, isStuck } = await import('./items')
  const today = '2026-11-09' // Mon
  it('day item: clock with weekday and time', () => {
    expect(deadlineChip(item('a', { happens_on: '2026-11-12', happens_time: '14:00:00' }), today)).toEqual({ kind: 'clock', text: 'Чт 12.11 · 14:00' })
    expect(deadlineChip(item('a', { happens_on: today }), today)).toEqual({ kind: 'clock', text: 'Сегодня' })
  })
  it('from a date, with and without a deadline', () => {
    expect(deadlineChip(item('a', { starts_on: '2026-11-16' }), today)).toEqual({ kind: 'from', text: 'с Пн 16.11' })
    expect(deadlineChip(item('a', { starts_on: '2026-12-01', due_date: '2026-12-15' }), today)).toEqual({ kind: 'from', text: 'с Вт 1.12 · до Вт 15.12' })
  })
  it('calm deadline: flag', () => expect(deadlineChip(item('a', { due_date: '2026-11-13' }), today)).toEqual({ kind: 'flag', text: 'до Пт 13.11' }))
  it('hot from 3 days before', () => {
    expect(deadlineChip(item('a', { due_date: '2026-11-11' }), today)).toEqual({ kind: 'hot', text: 'до Ср 11.11 · через 2 дня' })
    expect(deadlineChip(item('a', { due_date: '2026-11-12' }), today)?.kind).toBe('hot')
    expect(deadlineChip(item('a', { due_date: today, due_time: '10:00:00' }), today)).toEqual({ kind: 'hot', text: 'до Сегодня 10:00 · сегодня' })
  })
  it('study: hot by «готово к» while the deadline is later', () => {
    expect(deadlineChip(item('a', { due_date: '2026-11-18', ready_by: '2026-11-11' }), today)?.kind).toBe('hot')
  })
  it('late only after the deadline, always with the date', () => {
    expect(deadlineChip(item('a', { due_date: '2026-11-07' }), today)).toEqual({ kind: 'late', text: 'Срок прошёл · Сб 7.11' })
  })
  it('open and closed items: no chip', () => {
    expect(deadlineChip(item('a', {}), today)).toBeNull()
    expect(deadlineChip(item('a', { due_date: '2026-11-07', status: 'готово' }), today)).toBeNull()
  })
  it('rule 22: «застряло» from rollover_count ≥ 2', () => {
    expect(isStuck({ rollover_count: 1 })).toBe(false)
    expect(isStuck({ rollover_count: 2 })).toBe(true)
    expect(historyChips(item('a', { rollover_count: 1 }))).toEqual([{ kind: 'moved', text: 'перенесено ×1' }])
    expect(historyChips(item('a', { rollover_count: 2 }))).toEqual([
      { kind: 'moved', text: 'перенесено ×2' },
      { kind: 'stuck', text: 'застряло · 3 нед' },
    ])
  })
})
