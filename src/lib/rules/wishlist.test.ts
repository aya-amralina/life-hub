import { describe, expect, it } from 'vitest'
import { wishDue, wishHoursLeft, wishSavedCents } from './wishlist'

describe('rule 5: wishes wait 48 hours', () => {
  const now = new Date('2026-11-13T12:00:00Z')
  it('hours left, rounded up; due after 48 h without a decision', () => {
    expect(wishHoursLeft({ added_at: '2026-11-12T12:00:00Z', decision: null }, now)).toBe(24)
    expect(wishHoursLeft({ added_at: '2026-11-11T12:30:00Z', decision: null }, now)).toBe(1)
    expect(wishDue({ added_at: '2026-11-11T12:00:00Z', decision: null }, now)).toBe(true)
    expect(wishDue({ added_at: '2026-11-11T13:00:00Z', decision: null }, now)).toBe(false)
    expect(wishDue({ added_at: '2026-11-01T12:00:00Z', decision: 'buy' }, now)).toBe(false)
  })
  it('saved = wishes decided «не покупать»', () => {
    expect(
      wishSavedCents([
        { added_at: '', decision: 'skip', price_eur: 39.9 },
        { added_at: '', decision: 'buy', price_eur: 10 },
        { added_at: '', decision: 'skip', price_eur: null },
      ]),
    ).toBe(3990)
  })
})
