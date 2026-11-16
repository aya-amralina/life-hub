import { describe, expect, it } from 'vitest'
import { addFormFor, ownsAddAction } from './addTarget'

describe('«+» by screen', () => {
  it('sphere screens and sections own their «+»', () => {
    expect(ownsAddAction('/money')).toBe(true)
    expect(ownsAddAction('/body/strength')).toBe(true)
    expect(ownsAddAction('/')).toBe(false)
    expect(ownsAddAction('/calendar')).toBe(false)
    expect(ownsAddAction('/item/1')).toBe(false)
  })
  it('fallback: the sphere form, elsewhere the chooser', () => {
    expect(addFormFor('/money/envelopes')).toBe('expense')
    expect(addFormFor('/work')).toBe('work')
    expect(addFormFor('/study/tests')).toBe('study')
    expect(addFormFor('/body')).toBe('body')
    expect(addFormFor('/')).toBe('choose')
    expect(addFormFor('/journal')).toBe('choose')
  })
})
