import { describe, expect, it } from 'vitest'
import { isIntakeActive } from './intake'

describe('rule 26: intake is active', () => {
  const today = '2026-11-10'
  it('started and not finished', () => expect(isIntakeActive({ start_date: '2026-11-01', end_date: null }, today)).toBe(true))
  it('ends today — still active', () => expect(isIntakeActive({ start_date: '2026-11-01', end_date: today }, today)).toBe(true))
  it('ended yesterday — archive', () => expect(isIntakeActive({ start_date: '2026-11-01', end_date: '2026-11-09' }, today)).toBe(false))
  it('starts tomorrow — not yet', () => expect(isIntakeActive({ start_date: '2026-11-11', end_date: null }, today)).toBe(false))
})
