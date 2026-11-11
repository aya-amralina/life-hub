import { describe, expect, it } from 'vitest'
import { isNetworkError } from './offlineQueue'

describe('offline queue: what counts as «no network»', () => {
  it('fetch failures without a server code are network errors', () => {
    expect(isNetworkError({ message: 'TypeError: Failed to fetch', code: '' })).toBe(true)
    expect(isNetworkError({ message: 'Load failed' })).toBe(true)
    expect(isNetworkError({ message: 'NetworkError when attempting to fetch resource.' })).toBe(true)
  })
  it('errors from the server are not queued', () => {
    expect(isNetworkError({ message: 'new row violates row-level security policy', code: '42501' })).toBe(false)
    expect(isNetworkError({ message: 'duplicate key', code: '23505' })).toBe(false)
    expect(isNetworkError(null)).toBe(false)
  })
})
