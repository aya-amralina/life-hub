import { describe, expect, it } from 'vitest'
import { authMessage } from './authMessage'

describe('authMessage', () => {
  it('wrong password', () => {
    expect(authMessage({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' })).toBe(
      'Неверная почта или пароль.',
    )
  })
  it('rate limit', () => {
    expect(authMessage({ status: 429, message: 'email rate limit exceeded' })).toMatch(/Слишком часто/)
    expect(authMessage({ code: 'over_email_send_rate_limit' })).toMatch(/Слишком часто/)
  })
  it('unknown address for the magic link (signups disabled)', () => {
    expect(authMessage({ code: 'otp_disabled', message: 'Signups not allowed for otp' })).toBe('Этот адрес не подключён к Life Hub.')
  })
  it('network', () => {
    expect(authMessage({ message: 'Failed to fetch' })).toMatch(/Нет сети/)
  })
  it('never echoes server text', () => {
    expect(authMessage({ message: 'some internal detail 123' })).toBe('Не получилось. Попробуй ещё раз.')
  })
})
