import { describe, expect, it } from 'vitest'
import { bandsOn, calendarBands, calendarEvents, monthGrid, parseFilters } from './calendar'
import { activityWeeks, balanceLine, enoughForMonths, erfolgeByMonth, habitCalendar, intakeBands, repsSeries, studyHeatmap, wellbeingSeries } from './charts'

const today = '2026-11-11' // Wed

describe('wellbeing series', () => {
  const logs = [
    { date: '2026-11-09', mood: 6, energy: 5, sleep_h: 7 },
    { date: '2026-11-10', mood: 8, energy: null, sleep_h: 8 },
    { date: '2026-11-02', mood: 4, energy: 4, sleep_h: 6 },
  ]
  it('day: 14 days, gaps are null, not zero', () => {
    const s = wellbeingSeries(logs, today, 'day')
    expect(s).toHaveLength(14)
    expect(s.at(-1)).toMatchObject({ key: today, mood: null, energy: null, sleep: null })
    expect(s.find((p) => p.key === '2026-11-10')).toMatchObject({ mood: 8, energy: null, sleep: 8 })
  })
  it('week: averages per Mon–Sun, 13 weeks', () => {
    const s = wellbeingSeries(logs, today, 'week')
    expect(s).toHaveLength(13)
    expect(s.at(-1)).toMatchObject({ key: '2026-11-09', mood: 7, energy: 5, sleep: 7.5 })
    expect(s.at(-2)).toMatchObject({ key: '2026-11-02', mood: 4 })
    expect(s.at(-3)).toMatchObject({ mood: null })
  })
  it('month: averages per month, last 6', () => {
    const s = wellbeingSeries(logs, today, 'month')
    expect(s.map((p) => p.label)).toEqual(['июн', 'июл', 'авг', 'сен', 'окт', 'ноя'])
    expect(s.at(-1)!.mood).toBeCloseTo(6)
  })
  it('intake bands overlay the buckets they touch', () => {
    const s = wellbeingSeries(logs, today, 'day')
    expect(intakeBands([{ name: 'D3', start_date: '2026-11-09', end_date: null }], s, today)).toEqual([{ from: '2026-11-09', to: today, label: 'D3' }])
    expect(intakeBands([{ name: 'old', start_date: '2026-01-01', end_date: '2026-02-01' }], s, today)).toEqual([])
  })
})

describe('habit calendar, activity weeks, reps', () => {
  it('13 weeks × 7 days, future null, level = counted habits', () => {
    const cells = habitCalendar([{ date: '2026-11-10', morning: true, water: true, outside: false, minimum_mode: false }], [], today)
    expect(cells).toHaveLength(91)
    expect(cells.find((c) => c.key === '2026-11-10')!.level).toBe(2)
    expect(cells.find((c) => c.key === '2026-11-12')!.level).toBeNull()
    expect(cells.find((c) => c.key === today)!.current).toBe(true)
  })
  it('activity points per week with the target of that week', () => {
    const w = activityWeeks([{ date: '2026-11-10', type_id: 't', minutes: 30 }], [{ id: 't', points_per_10min: 2 }], [], today, () => 20)
    expect(w).toHaveLength(8)
    expect(w.at(-1)).toMatchObject({ key: '2026-11-09', points: 6, target: 20 })
  })
  it('reps: total per day for one exercise', () => {
    const sets = [
      { date: '2026-11-03', exercise: 'Squat', reps: [10, 10] },
      { date: '2026-11-10', exercise: 'Squat', reps: [12, 10] },
      { date: '2026-11-10', exercise: 'Row', reps: [8] },
    ]
    expect(repsSeries(sets, 'Squat').map((p) => p.reps)).toEqual([20, 22])
  })
})

describe('study heat map (П2: thresholds from the week capacity)', () => {
  const weeks = [
    { id: 'a', start_date: '2026-11-02', study_week: 'Н03', place_mode: null, capacity_base_h: 27, capacity_max_h: 36 },
    { id: 'b', start_date: '2026-11-09', study_week: 'Н04', place_mode: null, capacity_base_h: 27, capacity_max_h: 36 },
    { id: 'c', start_date: '2026-11-16', study_week: 'Н05', place_mode: 'Кипр (½)', capacity_base_h: null, capacity_max_h: null },
    { id: 'd', start_date: '2026-11-23', study_week: 'Н06', place_mode: null, capacity_base_h: 27, capacity_max_h: 36 },
  ]
  const it_ = (week: string, h: number, status = 'открыто') => ({ sphere: 'study', week_id: week, hours_est: h, status, done_at: null })
  const cells = studyHeatmap([it_('a', 27), it_('b', 30), it_('c', 15), it_('b', 5, 'снято')], weeks, today)
  it('ок ≤ base, нужен Do/Sa ½ ≤ max, перегруз above (½ week: 13,5 / 18), not planned = null', () => {
    expect(cells.map((c) => c.level)).toEqual([1, 2, 2, null])
  })
  it('tips name the status and «сейчас»; снято is not counted', () => {
    expect(cells[1]!.tip).toBe('Н04 · 30 ч из 27 · нужен Do/Sa ½ · сейчас')
    expect(cells[3]!.tip).toBe('Н06 · ещё не спланирована')
  })
})

describe('erfolge, balance line', () => {
  it('erfolge per month from the first record; a month is needed for the chart', () => {
    expect(erfolgeByMonth(['2026-09-14', '2026-11-05', '2026-11-06'], today).map((m) => [m.label, m.count])).toEqual([
      ['сен', 1],
      ['окт', 0],
      ['ноя', 2],
    ])
    expect(enoughForMonths(['2026-11-01'], today)).toBe(false)
    expect(enoughForMonths(['2026-10-01'], today)).toBe(true)
  })
  it('balance line: plan everywhere, fact only up to today', () => {
    const txs = [
      { date: '2026-10-13', amount_eur: 1000, kind: 'opening', category: null, envelope_id: null, is_planned: false, confirmed_at: null },
      { date: '2026-11-20', amount_eur: 200, kind: 'expense', category: null, envelope_id: null, is_planned: true, confirmed_at: null },
    ]
    const line = balanceLine(txs, '2026-11-01', '2026-12-31', today, 10)
    expect(line[0]).toMatchObject({ plan: 1000, fact: 1000 })
    expect(line.find((p) => p.key === today)).toMatchObject({ fact: 1000 })
    expect(line.at(-1)).toMatchObject({ key: '2026-12-31', plan: 800, fact: null })
  })
})

describe('calendar', () => {
  const items = [
    { id: '1', sphere: 'work', title: 'Abstimmung', status: 'Offen', done_at: null, due_date: null, due_time: null, happens_on: '2026-11-12', happens_time: '15:00:00' },
    { id: '2', sphere: 'study', title: 'HA', status: 'открыто', done_at: null, due_date: '2026-12-15', due_time: null, starts_on: '2026-12-01' },
    { id: '3', sphere: 'body', title: 'Termin', status: 'Отменено', done_at: null, due_date: '2026-11-20', due_time: null },
  ]
  const txs = [
    { id: 't1', date: '2026-11-27', title: 'Gehalt', amount_eur: 1120, kind: 'income', is_planned: true },
    { id: 't2', date: '2026-11-28', title: 'Old', amount_eur: 10, kind: 'expense', is_planned: true, cancelled_at: '2026-11-11T00:00:00Z' },
  ]
  it('items by deadline, day and start; planned operations; cancelled left out', () => {
    const e = calendarEvents(items, txs, parseFilters(null))
    expect(e.map((x) => [x.date, x.kind, x.title])).toEqual([
      ['2026-11-12', 'day', 'Abstimmung'],
      ['2026-11-27', 'money', 'Gehalt'],
      ['2026-12-01', 'start', 'HA'],
      ['2026-12-15', 'due', 'HA'],
    ])
    expect(e[0]!.time).toBe('15:00')
    expect(e[1]!.amountCents).toBe(112000)
  })
  it('filters by sphere', () => {
    expect(calendarEvents(items, txs, ['study']).every((x) => x.sphere === 'study')).toBe(true)
  })
  it('bands: consecutive weeks with the same place merge; stages with Тело; intake only with its filter', () => {
    const weeks = [
      { start_date: '2026-11-09', place_mode: 'у сестры' },
      { start_date: '2026-11-16', place_mode: 'у сестры' },
      { start_date: '2026-11-23', place_mode: null },
      { start_date: '2026-12-21', place_mode: 'Казахстан' },
    ]
    const stages = [{ name: '1 · Старт', start_date: '2026-11-09', end_date: '2026-11-22', sphere: 'body' }]
    const intake = [{ name: 'D3', start_date: '2026-11-01', end_date: null }]
    const b = calendarBands(weeks, stages, intake, parseFilters(null), today)
    expect(b.map((x) => [x.kind, x.from, x.to])).toEqual([
      ['place', '2026-11-09', '2026-11-22'],
      ['place', '2026-12-21', '2026-12-27'],
      ['stage', '2026-11-09', '2026-11-22'],
    ])
    expect(calendarBands(weeks, stages, intake, [...parseFilters(null), 'intake'], today).some((x) => x.kind === 'intake')).toBe(true)
    expect(bandsOn(b, '2026-11-15').map((x) => x.kind)).toEqual(['place', 'stage'])
  })
  it('month grid Mon–Sun', () => {
    const g = monthGrid('2026-11')
    expect(g[0]![0]).toBe('2026-10-26')
    expect(g.at(-1)!.at(-1)).toBe('2026-12-06')
    expect(g.flat()).toContain('2026-11-30')
  })
  it('filters from storage: unknown dropped, default all spheres without intake', () => {
    expect(parseFilters('["work","zzz"]')).toEqual(['work'])
    expect(parseFilters('oops')).toEqual(['money', 'work', 'study', 'body', 'personal'])
  })
})
