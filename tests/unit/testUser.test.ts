import { describe, expect, it } from 'vitest'
import { supabaseConfigured, testUser } from '../testUser'

describe('test credentials', () => {
  it('returns the dedicated test user', () => {
    expect(testUser({ LIFEHUB_TEST_EMAIL: ' Test@Example.com ', LIFEHUB_TEST_PASSWORD: 'pw', LIFEHUB_EMAIL: 'me@example.com' })).toEqual({
      email: 'test@example.com',
      password: 'pw',
    })
  })
  it('null when not configured', () => {
    expect(testUser({})).toBeNull()
    expect(testUser({ LIFEHUB_TEST_EMAIL: 'test@example.com' })).toBeNull()
  })
  it('refuses to run as the real user', () => {
    expect(() => testUser({ LIFEHUB_TEST_EMAIL: 'ME@example.com', LIFEHUB_TEST_PASSWORD: 'pw', LIFEHUB_EMAIL: 'me@example.com' })).toThrow(
      /не входят под настоящим/,
    )
  })
  it('placeholder URL is not configured', () => {
    expect(supabaseConfigured({ VITE_SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co' })).toBe(false)
    expect(supabaseConfigured({ VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' })).toBe(true)
  })
})
