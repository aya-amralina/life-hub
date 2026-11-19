import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/20261119160000_core.sql?raw'
import {
  coreLine,
  domeFree,
  fingersText,
  nextStagePhrase,
  earliestNext,
  isTestDay,
  nextStage,
  nextTestDay,
  parseStages,
  programWeek,
  rulesLine,
  sessionDays,
  snoozePatch,
  stageOf,
  switchPatch,
  toggleExercise,
  weekDaysActive,
  weekSessions,
  type CoreProgramLike,
  type CoreSessionLike,
} from './core'

// The seed of migration 0020 is the program the rules read.
const SEED = JSON.parse(/\$seed\$([\s\S]*?)\$seed\$/.exec(migration)![1]!) as unknown

const program = (p: Partial<CoreProgramLike> = {}): CoreProgramLike => ({
  start_date: '2026-11-19',
  stages: SEED,
  test_every_days: 28,
  stage: 1,
  stage_since: '2026-11-19',
  offer_after: null,
  ...p,
})
const session = (date: string, dome: boolean | null, done = true): CoreSessionLike => ({ date, dome, done_at: done ? `${date}T18:00:00Z` : null })
/** n finished sessions on consecutive days ending on `last`. */
const days = (last: string, n: number, dome: boolean | null = false) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(`${last}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - i)
    return session(d.toISOString().slice(0, 10), dome)
  })

describe('core: the program is data', () => {
  it('the seed: three stages — 4, 7 and no exercises yet; terms 3 and 6 weeks, the last open', () => {
    const stages = parseStages(SEED)
    expect(stages.map((s) => [s.no, s.weeks, s.exercises.length])).toEqual([
      [1, 3, 4],
      [2, 6, 7],
      [3, null, 0],
    ])
    expect(stages[0]!.exercises[1]).toEqual({ key: 'exhale-draw-in', name: 'Выдох с подтягиванием живота', dose: 'по 5', detail: 'лёжа, на четвереньках, сидя, стоя' })
    expect(stages[2]!.note).toMatch(/только если живот остаётся плоским/)
    // keys are unique within a stage (the session stores them)
    for (const s of stages) expect(new Set(s.exercises.map((e) => e.key)).size).toBe(s.exercises.length)
  })
  it('malformed data is dropped, not thrown', () => {
    expect(parseStages(null)).toEqual([])
    expect(parseStages([{ no: 2, exercises: [{ key: 'a', name: 'A' }, { name: 'no key' }] }, { no: 'x' }, { no: 1 }])).toEqual([
      { no: 1, weeks: null, exercises: [] },
      { no: 2, weeks: null, exercises: [{ key: 'a', name: 'A', dose: '' }] },
    ])
  })
  it('stage and week of the program', () => {
    expect(stageOf(program())?.no).toBe(1)
    expect(stageOf(program(), 4)).toBeNull()
    expect(programWeek('2026-11-19', '2026-11-18')).toBeNull()
    expect(programWeek('2026-11-19', '2026-11-19')).toBe(1)
    expect(programWeek('2026-11-19', '2026-11-25')).toBe(1)
    expect(programWeek('2026-11-19', '2026-11-26')).toBe(2)
    expect(programWeek('2026-11-19', '2026-12-10')).toBe(4)
  })
  it('rules in one line', () => {
    expect(rulesLine(['Усилие на выдохе', 'Вставать через бок', 'Не тужиться.'])).toBe('Усилие на выдохе. Вставать через бок. Не тужиться.')
  })
})

describe('core: the next stage', () => {
  it('stage 2 not before 10.12 (3 weeks from 19.11)', () => {
    expect(earliestNext(program())).toBe('2026-12-10')
    expect(nextStage(program(), days('2026-12-09', 7), '2026-12-09')).toMatchObject({ kind: 'wait', from: '2026-12-10' })
  })
  it('the term passed and the last 7 sessions without the «домик» → offer', () => {
    expect(nextStage(program(), days('2026-12-10', 7), '2026-12-10')).toMatchObject({ kind: 'offer', next: { no: 2 } })
  })
  it('a «домик» in the last 7 or fewer than 7 sessions → no offer', () => {
    const withDome = [...days('2026-12-10', 6), session('2026-12-04', true)]
    expect(nextStage(program(), withDome, '2026-12-10')).toMatchObject({ kind: 'dome', free: 6, of: 7 })
    expect(nextStage(program(), days('2026-12-10', 6), '2026-12-10')).toMatchObject({ kind: 'dome', free: 6, of: 6 })
    // an older «домик» is out of the window
    expect(nextStage(program(), [...days('2026-12-10', 7), session('2026-12-01', true)], '2026-12-10').kind).toBe('offer')
  })
  it('an unfinished session or an unanswered «домик» does not count as without', () => {
    expect(domeFree([...days('2026-12-10', 6), session('2026-12-04', null)], '2026-12-10')).toEqual({ free: 6, of: 7 })
    expect(domeFree([...days('2026-12-10', 6), session('2026-12-04', false, false)], '2026-12-10')).toEqual({ free: 6, of: 6 })
  })
  it('«Ещё неделю» hides the offer for 7 days', () => {
    expect(snoozePatch('2026-12-10')).toEqual({ offer_after: '2026-12-17' })
    const p = program({ offer_after: '2026-12-17' })
    expect(nextStage(p, days('2026-12-16', 7), '2026-12-16')).toMatchObject({ kind: 'later', after: '2026-12-17' })
    expect(nextStage(p, days('2026-12-17', 7), '2026-12-17').kind).toBe('offer')
  })
  it('«Перейти»: the term of stage 2 runs from the day of the switch (6 weeks)', () => {
    expect(switchPatch(stageOf(program(), 2)!, '2026-12-14')).toEqual({ stage: 2, stage_since: '2026-12-14', offer_after: null })
    const p = program({ stage: 2, stage_since: '2026-12-14' })
    expect(earliestNext(p)).toBe('2027-01-25')
  })
  it('stage 3 has no exercises yet — not offered; past the last stage — nothing', () => {
    expect(nextStage(program({ stage: 2, stage_since: '2026-12-10' }), days('2027-02-01', 7), '2027-02-01')).toMatchObject({ kind: 'empty', next: { no: 3 } })
    expect(nextStage(program({ stage: 3, stage_since: '2027-01-21' }), [], '2027-02-01')).toEqual({ kind: 'last' })
  })
})

describe('core: finger test, week, session', () => {
  it('every 4 weeks from the start: 17.12, 14.01, …; not the start day', () => {
    expect(isTestDay(program(), '2026-11-19')).toBe(false)
    expect(isTestDay(program(), '2026-12-17')).toBe(true)
    expect(isTestDay(program(), '2027-01-14')).toBe(true)
    expect(isTestDay(program(), '2026-12-18')).toBe(false)
    expect(nextTestDay(program(), '2026-11-19')).toBe('2026-12-17')
    expect(nextTestDay(program(), '2026-12-17')).toBe('2026-12-17')
    expect(nextTestDay(program(), '2026-12-18')).toBe('2027-01-14')
  })
  it('sessions of the week; the start week has fewer days', () => {
    const s = [session('2026-11-19', false), session('2026-11-20', null, false), session('2026-11-23', true)]
    expect(weekSessions(s, '2026-11-22')).toBe(1)
    expect(weekDaysActive('2026-11-19', '2026-11-22')).toBe(4)
    expect(weekDaysActive('2026-11-19', '2026-11-23')).toBe(7)
    expect([...sessionDays(s)]).toEqual(['2026-11-19', '2026-11-23'])
  })
  it('ticking an exercise toggles it', () => {
    expect(toggleExercise([], 'a')).toEqual(['a'])
    expect(toggleExercise(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('core: words', () => {
  it('the card line, the way to the next stage, fingers', () => {
    expect(coreLine({ stage: 1, start_date: '2026-11-19', minutes: 10 }, '2026-11-19')).toBe('Этап 1, неделя 1 · 10 мин')
    expect(nextStagePhrase(nextStage(program(), [], '2026-11-19'))).toBe('Этап 2 не раньше 10.12 и только без домика.')
    expect(nextStagePhrase(nextStage(program(), days('2026-12-12', 3), '2026-12-12'))).toBe('Этап 2 — после 7 сессий подряд без домика. Сейчас без домика 3 из 3.')
    expect(nextStagePhrase({ kind: 'last' })).toBeNull()
    expect([0, 1, 1.5, 2, 5].map(fingersText)).toEqual(['0 пальцев', '1 палец', '1,5 пальца', '2 пальца', '5 пальцев'])
  })
})

describe('core: a minimal session («Тяжёлый день»)', () => {
  it('counts in the week, not in the move to the next stage', () => {
    const minimal = (date: string) => ({ ...session(date, null), minimal: true })
    expect(weekSessions([minimal('2026-11-19'), session('2026-11-20', false)], '2026-11-20')).toBe(2)
    // 7 sessions without the «домик», one of them minimal → only 6 full ones
    const s = [...days('2026-12-10', 6), minimal('2026-12-04')]
    expect(domeFree(s, '2026-12-10')).toEqual({ free: 6, of: 6 })
    expect(nextStage(program(), s, '2026-12-10').kind).toBe('dome')
    expect(nextStage(program(), [...s, session('2026-12-03', false)], '2026-12-10').kind).toBe('offer')
  })
})
