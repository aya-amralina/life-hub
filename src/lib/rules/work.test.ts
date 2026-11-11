import { describe, expect, it } from 'vitest'
import { groupByStatus, nachhaken, statusAltDays, type WorkItemLike } from './work'

const w = (id: string, p: Partial<WorkItemLike> = {}): WorkItemLike => ({
  id,
  status: 'Offen',
  waiting_on: null,
  people: [],
  updated_at: '2026-11-09T10:00:00Z',
  ...p,
})
const today = '2026-11-24'

describe('rule 9 — Status alt', () => {
  it('older than 14 days', () => {
    expect(statusAltDays(w('a', { updated_at: '2026-11-09T10:00:00Z' }), today)).toBe(15)
    expect(statusAltDays(w('b', { updated_at: '2026-11-10T10:00:00Z' }), today)).toBeNull() // exactly 14
  })
  it('never for Erledigt / Verworfen', () => {
    expect(statusAltDays(w('a', { status: 'Erledigt', updated_at: '2026-01-01T00:00:00Z' }), today)).toBeNull()
    expect(statusAltDays(w('b', { status: 'Verworfen', updated_at: '2026-01-01T00:00:00Z' }), today)).toBeNull()
  })
  it('stalled items do count', () => {
    expect(statusAltDays(w('a', { status: 'Geparkt', updated_at: '2026-11-01T00:00:00Z' }), today)).toBe(23)
  })
})

describe('rule 10 — nachhaken', () => {
  const items = [
    w('1', { status: 'Wartet auf Antwort', waiting_on: 'Johannes (Review/Merge)', updated_at: '2026-11-19T10:00:00Z' }),
    w('2', { status: 'Blockiert', waiting_on: 'Merge PR 1 + 2; Bryan, Johannes', updated_at: '2026-11-22T10:00:00Z' }),
    w('3', { status: 'In Arbeit', waiting_on: 'Johannes' }),
    w('4', { status: 'Wartet auf Antwort', waiting_on: 'Marcus' }), // «Marc» must not match «Marcus»
  ]
  it('counts per person with days of the oldest wait', () => {
    expect(nachhaken(items, ['Johannes', 'Bryan', 'Marc'], today)).toEqual([
      { name: 'Johannes', count: 2, days: 5 },
      { name: 'Bryan', count: 1, days: 2 },
    ])
  })
  it('falls back to Beteiligte when there is no people list', () => {
    const res = nachhaken([{ ...items[0]!, people: ['Johannes'] }], [], today)
    expect(res).toEqual([{ name: 'Johannes', count: 1, days: 5 }])
  })
})

describe('board grouping', () => {
  it('fixed status order, empty groups dropped, null = Offen', () => {
    const g = groupByStatus([w('a', { status: 'Blockiert' }), w('b', { status: null }), w('c', { status: 'In Arbeit' })])
    expect(g.map((x) => x.status)).toEqual(['Offen', 'In Arbeit', 'Blockiert'])
  })
})

describe('board groups and Erfolge', async () => {
  const { boardGroups, fridayQueue, isErfolg } = await import('./work')
  const today = '2026-11-09'
  const b = (id: string, p: Record<string, unknown> = {}) => ({
    id,
    status: 'Offen',
    waiting_on: null,
    people: [],
    updated_at: '2026-11-01T10:00:00Z',
    done_at: null,
    due_date: null,
    ready_by: null,
    starts_on: null,
    type: 'Aufgabe',
    area: null,
    outcome: null,
    ...p,
  })
  const items = [
    b('work', { status: 'In Arbeit' }),
    b('review', { status: 'Im Review' }),
    b('open'),
    b('soon', { starts_on: '2026-11-16' }),
    b('waiting', { status: 'Wartet auf Antwort' }),
    b('parked', { status: 'Geparkt' }),
    b('doneNow', { status: 'Erledigt', done_at: '2026-11-08T10:00:00Z' }),
    b('doneOld', { status: 'Erledigt', done_at: '2026-10-01T10:00:00Z' }),
    b('dropped', { status: 'Verworfen' }),
    b('erfolg', { type: 'Erfolg', status: 'Erledigt', done_at: '2026-11-08T10:00:00Z' }),
  ]
  it('groups in board order; Скоро and Стоит; only last week’s Erledigt; Erfolge off the board', () => {
    expect(boardGroups(items, today).map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      ['In Arbeit', ['work']],
      ['Im Review', ['review']],
      ['Offen', ['open']],
      ['soon', ['soon']],
      ['stalled', ['waiting', 'parked']],
      ['Erledigt', ['doneNow']],
    ])
  })
  it('Erfolg: recorded, or done with «что это дало»', () => {
    expect(isErfolg({ type: 'Erfolg', status: 'Erledigt', done_at: null, outcome: null })).toBe(true)
    expect(isErfolg({ type: 'Aufgabe', status: 'Erledigt', done_at: null, outcome: 'Kunde live' })).toBe(true)
    expect(isErfolg({ type: 'Aufgabe', status: 'Erledigt', done_at: null, outcome: '  ' })).toBe(false)
    expect(isErfolg({ type: 'Aufgabe', status: 'Offen', done_at: null, outcome: 'x' })).toBe(false)
  })
  it('Friday review: open tasks, least recently updated first', () => {
    const q = fridayQueue([b('new', { updated_at: '2026-11-08T00:00:00Z' }), b('old', { updated_at: '2026-10-01T00:00:00Z' }), b('closed', { status: 'Erledigt' })])
    expect(q.map((i) => i.id)).toEqual(['old', 'new'])
  })
})
