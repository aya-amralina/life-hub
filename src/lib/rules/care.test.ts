import { describe, expect, it } from 'vitest'
import { careChoice, careDone, careItems, careTitle, parseCare, toggleCare } from './care'

describe('care items by stage', () => {
  it('plain items and groups with one choice', () => {
    expect(parseCare('Крем для тела')).toEqual({ raw: 'Крем для тела', label: 'Крем для тела', options: null })
    expect(parseCare(' Вечер:  Ниацинамид | Азелаинка ')).toEqual({ raw: 'Вечер:  Ниацинамид | Азелаинка', label: 'Вечер', options: ['Ниацинамид', 'Азелаинка'] })
    expect(parseCare('Утро: только SPF').options).toBeNull() // a colon without options is a plain item
  })
  it('stage list, unique; the default without a list', () => {
    expect(careItems({ care_items: ['Крем для тела', 'Крем для тела'] }).map((e) => e.label)).toEqual(['Крем для тела'])
    expect(careItems(null).map(careTitle)).toEqual(['Утро — Ниацинамид или Глиняный стик', 'Вечер — Ниацинамид или Азелаинка', 'Крем для тела'])
  })
  it('a group keeps one choice: another option replaces it, the same clears it', () => {
    const evening = parseCare('Вечер: Ниацинамид | Азелаинка')
    let marks = toggleCare([], evening, 'Азелаинка')
    expect(marks).toEqual(['Вечер: Азелаинка'])
    marks = toggleCare(marks, evening, 'Ниацинамид')
    expect(marks).toEqual(['Вечер: Ниацинамид'])
    expect(careChoice(marks, evening)).toBe('Ниацинамид')
    expect(toggleCare(marks, evening, 'Ниацинамид')).toEqual([])
  })
  it('counts done entries; old marks are kept but not counted', () => {
    const entries = careItems(null)
    expect(careDone(['Крем для тела', 'Утро: Глиняный стик', 'Ретиноид'], entries)).toBe(2)
    expect(toggleCare(['Ретиноид'], parseCare('Крем для тела'))).toEqual(['Ретиноид', 'Крем для тела'])
  })
})
