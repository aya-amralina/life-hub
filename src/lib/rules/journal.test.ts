import { describe, expect, it } from 'vitest'
import { byMonth, cleanNote, dayContext, journalEntries, longNote, noteDirty, searchJournal } from './journal'

describe('day note', () => {
  it('stored trimmed; empty is nothing', () => {
    expect(cleanNote('  Тревожка утром \n')).toBe('Тревожка утром')
    expect(cleanNote('   ')).toBeNull()
  })
  it('dirty only when the text really differs from the saved one', () => {
    expect(noteDirty('', null)).toBe(false)
    expect(noteDirty('Привет ', 'Привет')).toBe(false)
    expect(noteDirty('Привет!', 'Привет')).toBe(true)
    expect(noteDirty('', 'Привет')).toBe(true)
  })
})

describe('journal', () => {
  const logs = [
    { date: '2026-11-12', note: 'Тревожка с утра, но справилась', mood: 7, energy: 6, sleep_h: 7.5 },
    { date: '2026-11-15', note: 'Спокойный день', mood: null, energy: null, sleep_h: null },
    { date: '2026-11-13', note: '   ', mood: 5, energy: 5, sleep_h: 6 },
    { date: '2026-10-30', note: 'Кипр', mood: 8, energy: null, sleep_h: 8 },
  ]
  const weeks = [{ start_date: '2026-11-09', week_thought: 'Не брать лишнего' }, { start_date: '2026-11-02', week_thought: null }]
  it('newest first, empty notes skipped, the week thought on its Sunday after the day note', () => {
    const e = journalEntries(logs, weeks)
    expect(e.map((x) => `${x.kind}:${x.date}`)).toEqual(['day:2026-11-15', 'week:2026-11-15', 'day:2026-11-12', 'day:2026-10-30'])
  })
  it('by month, search, quiet context line', () => {
    const e = journalEntries(logs, weeks)
    expect(byMonth(e).map((m) => [m.month, m.entries.length])).toEqual([['2026-11', 3], ['2026-10', 1]])
    expect(searchJournal(e, 'тревож').map((x) => x.date)).toEqual(['2026-11-12'])
    expect(dayContext({ mood: 7, energy: null, sleep: 7.5 })).toBe('настроение 7 · сон 7,5 ч')
    expect(dayContext({ mood: null, energy: null, sleep: null })).toBe('')
  })
  it('long note folds', () => {
    expect(longNote('коротко')).toBe(false)
    expect(longNote('a\nb\nc\nd\ne')).toBe(true)
    expect(longNote('x'.repeat(250))).toBe(true)
  })
})
