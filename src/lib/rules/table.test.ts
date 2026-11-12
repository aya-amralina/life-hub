import { describe, expect, it } from 'vitest'
import { bulkPatches, clampWidth, compareCells, groupRows, matchesSearch, moveCell, nextSort, parseHours, parseNames, parsePrefs, selectClick, sortRows } from './table'

describe('table: sorting', () => {
  it('empty values last in both directions; numbers numeric; text German order', () => {
    expect(compareCells(null, 'a', 'asc')).toBe(1)
    expect(compareCells(null, 'a', 'desc')).toBe(1)
    expect(compareCells(2, 10, 'asc')).toBeLessThan(0)
    expect(compareCells('Übung', 'Uhr', 'asc')).toBeLessThan(0) // Ü sorts as U
    expect(compareCells('VL2', 'VL10', 'asc')).toBeLessThan(0)
  })
  it('stable, by column, none keeps order', () => {
    const rows = [{ id: 'a', d: '2026-11-20' }, { id: 'b', d: null }, { id: 'c', d: '2026-11-14' }, { id: 'd', d: '2026-11-14' }]
    const v = (r: (typeof rows)[number]) => r.d
    expect(sortRows(rows, { col: 'd', dir: 'asc' }, v).map((r) => r.id)).toEqual(['c', 'd', 'a', 'b'])
    expect(sortRows(rows, { col: 'd', dir: 'desc' }, v).map((r) => r.id)).toEqual(['a', 'c', 'd', 'b'])
    expect(sortRows(rows, null, v).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('header cycles asc → desc → none; another column starts at asc', () => {
    expect(nextSort(null, 'x')).toEqual({ col: 'x', dir: 'asc' })
    expect(nextSort({ col: 'x', dir: 'asc' }, 'x')).toEqual({ col: 'x', dir: 'desc' })
    expect(nextSort({ col: 'x', dir: 'desc' }, 'x')).toBeNull()
    expect(nextSort({ col: 'x', dir: 'desc' }, 'y')).toEqual({ col: 'y', dir: 'asc' })
  })
})

describe('table: search and grouping', () => {
  it('every word in some field, case and umlauts ignored', () => {
    expect(matchesSearch(['Release vorbereiten', 'Kundendashboard'], 'kunden rel')).toBe(true)
    expect(matchesSearch(['Übungsblatt 4', 'GLET'], 'ubungs')).toBe(true)
    expect(matchesSearch(['Release', null], 'release export')).toBe(false)
    expect(matchesSearch(['x'], '  ')).toBe(true)
  })
  it('groups in the given order, others alphabetically, empty last', () => {
    const rows = [{ s: 'Offen' }, { s: null }, { s: 'In Arbeit' }, { s: 'Zebra' }, { s: 'Alpha' }, { s: 'Offen' }]
    const g = groupRows(rows, (r) => r.s, { order: ['In Arbeit', 'Offen'], emptyLabel: 'Без статуса' })
    expect(g.map((x) => [x.label, x.rows.length])).toEqual([['In Arbeit', 1], ['Offen', 2], ['Alpha', 1], ['Zebra', 1], ['Без статуса', 1]])
  })
})

describe('table: selection', () => {
  const order = ['a', 'b', 'c', 'd', 'e']
  it('click toggles and sets the anchor', () => {
    const r = selectClick(order, new Set(), null, 'b', false)
    expect([...r.selected]).toEqual(['b'])
    expect(r.anchor).toBe('b')
    expect([...selectClick(order, r.selected, 'b', 'b', false).selected]).toEqual([])
  })
  it('shift-click selects the range from the anchor, in either direction', () => {
    expect([...selectClick(order, new Set(['b']), 'b', 'd', true).selected].sort()).toEqual(['b', 'c', 'd'])
    expect([...selectClick(order, new Set(['d']), 'd', 'a', true).selected].sort()).toEqual(['a', 'b', 'c', 'd'])
  })
  it('shift-click from an unselected anchor clears the range', () => {
    expect([...selectClick(order, new Set(['a', 'c', 'd']), 'b', 'c', true).selected].sort()).toEqual(['a', 'd'])
  })
})

describe('table: keyboard', () => {
  it('arrows stop at the edges; Tab wraps to the next row; Shift-Tab back', () => {
    expect(moveCell({ row: 0, col: 0 }, 'ArrowUp', 3, 4)).toEqual({ row: 0, col: 0 })
    expect(moveCell({ row: 0, col: 3 }, 'ArrowRight', 3, 4)).toEqual({ row: 0, col: 3 })
    expect(moveCell({ row: 0, col: 3 }, 'Tab', 3, 4)).toEqual({ row: 1, col: 0 })
    expect(moveCell({ row: 1, col: 0 }, 'ShiftTab', 3, 4)).toEqual({ row: 0, col: 3 })
    expect(moveCell({ row: 2, col: 3 }, 'Tab', 3, 4)).toEqual({ row: 2, col: 3 })
    expect(moveCell({ row: 1, col: 2 }, 'Home', 3, 4)).toEqual({ row: 1, col: 0 })
  })
})

describe('table: column prefs and cell input', () => {
  it('prefs: unknown columns dropped, widths clamped, bad JSON → defaults', () => {
    expect(parsePrefs('{"hidden":["a","zzz"],"widths":{"a":20,"b":9999,"zzz":100}}', ['a', 'b'])).toEqual({ hidden: ['a'], widths: { a: 56, b: 640 } })
    expect(parsePrefs('nope', ['a'])).toEqual({ hidden: [], widths: {} })
    expect(parsePrefs(null, ['a'])).toEqual({ hidden: [], widths: {} })
    expect(clampWidth(120.4)).toBe(120)
  })
  it('names and hours', () => {
    expect(parseNames(' Bryan, Johannes;Bryan ,, ')).toEqual(['Bryan', 'Johannes'])
    expect(parseHours('1,5')).toBe(1.5)
    expect(parseHours('')).toBeNull()
    expect(parseHours('zwei')).toBe('invalid')
  })
})

describe('table: bulk actions', () => {
  const NOW = '2026-11-12T10:00:00.000Z'
  const work = { id: 'w', sphere: 'work', status: 'Offen', done_at: null, priority: 'Mittel', area: 'Export' }
  const done = { id: 'x', sphere: 'work', status: 'Erledigt', done_at: 'T0', priority: null, area: null }
  const study = { id: 's', sphere: 'study', status: 'открыто', done_at: null, week_id: 'w1', due_date: null }
  it('status: Erledigt sets done_at, others clear it; undo restores both; unchanged items left out', () => {
    const r = bulkPatches([work, done], { kind: 'status', status: 'Erledigt' }, NOW)
    expect(r.apply).toEqual([{ id: 'w', patch: { status: 'Erledigt', done_at: NOW } }])
    expect(r.undo).toEqual([{ id: 'w', patch: { status: 'Offen', done_at: null } }])
    expect(bulkPatches([done], { kind: 'status', status: 'In Arbeit' }, NOW).apply).toEqual([{ id: 'x', patch: { status: 'In Arbeit', done_at: null } }])
  })
  it('done and take off use the sphere statuses', () => {
    expect(bulkPatches([work, study], { kind: 'done' }, NOW).apply).toEqual([
      { id: 'w', patch: { status: 'Erledigt', done_at: NOW } },
      { id: 's', patch: { status: 'готово', done_at: NOW } },
    ])
    expect(bulkPatches([work, study], { kind: 'takeOff' }, NOW).apply).toEqual([
      { id: 'w', patch: { status: 'Verworfen', done_at: null } },
      { id: 's', patch: { status: 'снято', done_at: null } },
    ])
    expect(bulkPatches([done], { kind: 'done' }, NOW).apply).toEqual([])
  })
  it('priority, area, due, week — with undo', () => {
    expect(bulkPatches([work], { kind: 'priority', priority: 'Hoch' }, NOW)).toEqual({ apply: [{ id: 'w', patch: { priority: 'Hoch' } }], undo: [{ id: 'w', patch: { priority: 'Mittel' } }] })
    expect(bulkPatches([work, done], { kind: 'area', area: 'Export' }, NOW).apply).toEqual([{ id: 'x', patch: { area: 'Export' } }])
    expect(bulkPatches([study], { kind: 'due', due: '2026-11-20' }, NOW).undo).toEqual([{ id: 's', patch: { due_date: null } }])
    expect(bulkPatches([study], { kind: 'week', weekId: 'w2' }, NOW)).toEqual({ apply: [{ id: 's', patch: { week_id: 'w2' } }], undo: [{ id: 's', patch: { week_id: 'w1' } }] })
  })
})
