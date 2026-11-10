import { describe, expect, it } from 'vitest'
import { newItem } from './newItem'

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
