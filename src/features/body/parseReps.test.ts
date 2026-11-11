import { describe, expect, it } from 'vitest'
import { parseReps } from './parseReps'

describe('parseReps', () => {
  it('reads reps per set from spaces, commas, dots', () => {
    expect(parseReps('10 10 8')).toEqual([10, 10, 8])
    expect(parseReps('12, 10·8')).toEqual([12, 10, 8])
  })
  it('rejects empty and non-numbers', () => {
    expect(parseReps('')).toBeNull()
    expect(parseReps('10 x')).toBeNull()
    expect(parseReps('0')).toBeNull()
  })
})
