import { describe, expect, it } from 'vitest'
import { NO_CONNECTION, REJECTED, rejectedText } from './rejectedWrites'

describe('a failed write is named', () => {
  it('the server said no (an error with a code)', () => {
    expect(rejectedText({ code: '23514', message: 'new row violates check constraint' })).toBe(REJECTED)
    expect(rejectedText({ code: '42501', message: 'permission denied for table items' })).toBe(REJECTED)
  })
  it('the request never reached the server', () => {
    expect(rejectedText({ message: 'TypeError: Failed to fetch' })).toBe(NO_CONNECTION)
    expect(rejectedText(new TypeError('Load failed'))).toBe(NO_CONNECTION)
  })
  it('anything else is the server', () => {
    expect(rejectedText('boom')).toBe(REJECTED)
    expect(rejectedText(null)).toBe(REJECTED)
  })
})
