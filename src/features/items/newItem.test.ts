import { describe, expect, it } from 'vitest'
import { readyBy } from '@/lib/rules/study'
import { newBodyItem, newItem, newStudyItem, newWorkTask } from './newItem'

describe('newItem defaults per sphere', () => {
  it('work → Offen / Aufgabe', () => {
    expect(newItem('work', 'X', null)).toMatchObject({ sphere: 'work', status: 'Offen', type: 'Aufgabe', due_date: null })
  })
  it('study → «готово к» by rule 6', () => {
    expect(newItem('study', 'HA', '2026-10-28')).toMatchObject({ status: 'открыто', ready_by: '2026-10-24' })
    expect(newItem('study', 'HA', null).ready_by).toBeNull()
  })
  it('body → Не начато; personal plain', () => {
    expect(newItem('body', 'X', null).status).toBe('Не начато')
    expect(newItem('personal', 'X', '2026-11-10')).toEqual({ sphere: 'personal', title: 'X', due_date: '2026-11-10' })
  })
})

describe('sphere forms of «+»', () => {
  it('work task: Typ defaults to Aufgabe, empty texts are null', () => {
    expect(newWorkTask({ title: ' Login fixen ', area: 'LIS Front', priority: 'Hoch', due: '2026-11-20', nextStep: ' ', waitingOn: 'Max' })).toEqual({
      sphere: 'work',
      title: 'Login fixen',
      due_date: '2026-11-20',
      status: 'Offen',
      type: 'Aufgabe',
      area: 'LIS Front',
      priority: 'Hoch',
      next_step: null,
      waiting_on: 'Max',
    })
    expect(newWorkTask({ title: 'Bug', type: 'Bug' }).type).toBe('Bug')
  })
  it('study item: week, hours, «готово к» from the deadline; 0 h is no estimate', () => {
    expect(newStudyItem({ title: 'HA 3', area: 'Mathe', type: 'HA', hours: 2.5, weekId: 'w1', due: '2026-11-25' })).toMatchObject({
      sphere: 'study',
      status: 'открыто',
      week_id: 'w1',
      hours_est: 2.5,
      ready_by: readyBy('2026-11-25'),
    })
    expect(newStudyItem({ title: 'X', hours: 0, weekId: null }).hours_est).toBeNull()
  })
  it('body: a task gets a deadline, a visit — a day and time', () => {
    expect(newBodyItem({ title: 'Крем купить', kind: 'task', date: '2026-11-18' })).toMatchObject({ due_date: '2026-11-18', status: 'Не начато' })
    expect(newBodyItem({ title: 'Дерматолог', kind: 'visit', date: '2026-11-19', time: '10:30' })).toMatchObject({
      due_date: null,
      happens_on: '2026-11-19',
      happens_time: '10:30',
    })
    expect(newBodyItem({ title: 'Врач', kind: 'visit', date: null })).toMatchObject({ due_date: null })
  })
})
