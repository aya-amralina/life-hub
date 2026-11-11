import { describe, expect, it } from 'vitest'
import { careDone, careItems, toggleCare } from './care'

describe('care items by stage', () => {
  it('stage list, trimmed and unique; default without a list', () => {
    expect(careItems({ care_items: [' Крем для тела ', 'Ниацинамид утром', 'Крем для тела'] })).toEqual(['Крем для тела', 'Ниацинамид утром'])
    expect(careItems({ care_items: [] })).toEqual(['Крем для тела', 'Ниацинамид утром'])
    expect(careItems(null)).toEqual(['Крем для тела', 'Ниацинамид утром'])
  })
  it('marks count only items still on the list (old marks are kept, not counted)', () => {
    expect(careDone(['Крем для тела', 'Ретиноид'], ['Крем для тела', 'Ниацинамид утром'])).toBe(1)
  })
  it('toggle adds and removes', () => {
    expect(toggleCare([], 'SPF')).toEqual(['SPF'])
    expect(toggleCare(['SPF', 'Крем'], 'SPF')).toEqual(['Крем'])
  })
})
