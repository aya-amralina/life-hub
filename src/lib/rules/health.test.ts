import { describe, expect, it } from 'vitest'
import { chainSteps, courseEnding, intakeArchive, intakeList, repeatLine, seriesItemOn, taskGroups, type HealthItem, type SeriesLike } from './health'

const today = '2026-11-20'

describe('intake', () => {
  const row = (name: string, kind: string, p: Record<string, unknown> = {}) => ({ id: name, name, kind, start_date: '2026-10-01', end_date: null as string | null, course_until: null as string | null, ...p })
  const list = [row('Iron', 'витамин'), row('Velafee', 'другое'), row('Elopram', 'лекарство'), row('Old', 'витамин', { end_date: '2026-11-01' }), row('B12', 'витамин')]
  it('one list: medicines → other → vitamins; finished ones in the archive', () => {
    expect(intakeList(list, today).map((i) => i.name)).toEqual(['Elopram', 'Velafee', 'B12', 'Iron'])
    expect(intakeArchive(list, today).map((i) => i.name)).toEqual(['Old'])
  })
  it('«курс до» within 7 days — a reminder', () => {
    const c = [row('A', 'витамин', { course_until: '2026-11-27' }), row('B', 'витамин', { course_until: '2026-11-28' }), row('C', 'витамин', { course_until: '2026-11-19' })]
    expect(courseEnding(c, today).map((i) => i.name)).toEqual(['A'])
  })
})

const item = (id: string, p: Partial<HealthItem> = {}): HealthItem => ({ id, title: id, done_at: null, status: 'Не начато', due_date: null, ready_by: null, starts_on: null, happens_on: null, series_id: null, step: null, ...p })
const series = (id: string, kind: string, title: string): SeriesLike => ({ id, kind, title, cadence: kind === 'repeat' ? 'каждые 4 недели' : null, sort_order: 0, archived_at: null })

describe('tasks and visits', () => {
  it('groups: passed events wait for an answer, passed targets are overdue, 2 weeks, later; series stay apart', () => {
    const items = [
      item('start-photos', { happens_on: '2026-11-16' }),
      item('gyn', { due_date: '2026-11-14', series_id: 'gyn' }),
      item('thermo', { due_date: '2026-11-29' }),
      item('dumbbells', { due_date: '2026-12-13' }),
      item('old-task', { due_date: '2026-11-18' }),
      item('measure', { happens_on: '2026-12-17', series_id: 'm' }),
      item('measure-passed', { happens_on: '2026-11-19', series_id: 'm' }),
      item('done', { due_date: '2026-11-25', done_at: '2026-11-19T10:00:00Z' }),
    ]
    const g = taskGroups(items, today)
    expect(g.waiting.map((i) => i.id)).toEqual(['start-photos', 'measure-passed'])
    expect(g.overdue.map((i) => i.id)).toEqual(['old-task'])
    expect(g.soon.map((i) => i.id)).toEqual(['thermo'])
    expect(g.later.map((i) => i.id)).toEqual(['dumbbells'])
  })
  it('a repeat in one line: next dates and the past', () => {
    const m = series('m', 'repeat', 'Замеры')
    const items = [item('a', { happens_on: '2027-01-14', series_id: 'm' }), item('b', { happens_on: '2026-12-17', series_id: 'm' }), item('c', { happens_on: '2026-11-16', series_id: 'm', done_at: 'x' })]
    const l = repeatLine(m, items, today)
    expect(l.next.map((i) => i.happens_on)).toEqual(['2026-12-17', '2027-01-14'])
    expect(l.past.map((i) => i.id)).toEqual(['c'])
    expect(seriesItemOn([m], items, 'Замеры', '2026-12-17')?.id).toBe('b')
    expect(seriesItemOn([m], items, 'Замеры', '2026-12-18')).toBeNull()
  })
  it('a doctor: записаться → визит → анализы → результаты; the first open step is current, a cancelled one stays faded', () => {
    const h = series('h', 'chain', 'Hausarzt')
    const items = [
      item('results', { series_id: 'h', step: 'результаты', due_date: '2026-12-20' }),
      item('visit', { series_id: 'h', step: 'визит' }),
      item('book', { series_id: 'h', step: 'записаться', due_date: '2026-11-15' }),
      item('lab', { series_id: 'h', step: 'анализы', due_date: '2026-12-06' }),
    ]
    expect(chainSteps(h, items).map((s) => `${s.item.id}:${s.state}`)).toEqual(['book:current', 'visit:later', 'lab:later', 'results:later'])
    const hz = series('z', 'chain', 'Hautarzt')
    const z = [item('cancelled', { series_id: 'z', step: 'записаться', due_date: '2026-11-09', status: 'Отменено' }), item('book', { series_id: 'z', step: 'записаться' }), item('visit', { series_id: 'z', step: 'визит', due_date: '2026-12-20' })]
    expect(chainSteps(hz, z).map((s) => `${s.item.id}:${s.state}`)).toEqual(['cancelled:cancelled', 'book:current', 'visit:later'])
  })
  it('body comp twice: записаться → сделать by dates', () => {
    const b = series('b', 'chain', 'Body comp')
    const items = [
      item('april', { series_id: 'b', step: 'сделать', due_date: '2027-04-18' }),
      item('book1', { series_id: 'b', step: 'записаться', due_date: '2027-01-25' }),
      item('book2', { series_id: 'b', step: 'записаться', due_date: '2027-03-29' }),
      item('feb', { series_id: 'b', step: 'сделать', due_date: '2027-02-07' }),
    ]
    expect(chainSteps(b, items).map((s) => s.item.id)).toEqual(['book1', 'feb', 'book2', 'april'])
  })
})
