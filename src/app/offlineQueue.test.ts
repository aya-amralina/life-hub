import { afterEach, describe, expect, it, vi } from 'vitest'
import { confirmPatch } from '@/lib/rules/operation'
import { flush, isNetworkError, write } from './offlineQueue'

// In-memory stand-ins: IndexedDB for the queue, Supabase for the server (records what reached it).
const store = vi.hoisted(() => ({ queue: [] as Record<string, unknown>[], seq: 0, sent: [] as { table: string; values: unknown; id: unknown }[] }))
vi.mock('./idb', () => ({
  idb: {
    add: async (v: Record<string, unknown>) => void store.queue.push({ ...v, seq: ++store.seq }),
    all: async () => [...store.queue],
    remove: async (seq: number) => void (store.queue = store.queue.filter((q) => q.seq !== seq)),
  },
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      update: (values: unknown) => ({ eq: async (_: string, id: unknown) => (store.sent.push({ table, values, id }), { error: null }) }),
    }),
  },
}))

afterEach(() => vi.unstubAllGlobals())

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

describe('offline queue: a confirmation made offline', () => {
  it('keeps the plan amount and the corrected amount until it reaches the server', async () => {
    const tx = { id: 't1', is_planned: true, confirmed_at: null, amount_eur: 650, planned_amount_eur: null }
    const patch = confirmPatch(tx, 67250, '2026-11-16T09:00:00.000Z')

    vi.stubGlobal('navigator', { onLine: false })
    expect(await write({ table: 'transactions', action: 'update', id: tx.id, values: patch })).toBe('queued')
    expect(store.sent).toEqual([])

    vi.stubGlobal('navigator', { onLine: true })
    expect(await flush()).toEqual({ sent: 1, dropped: 0 })
    expect(store.sent).toEqual([
      { table: 'transactions', id: 't1', values: { confirmed_at: '2026-11-16T09:00:00.000Z', amount_eur: 672.5, planned_amount_eur: 650 } },
    ])
    expect(store.queue).toEqual([])
  })
})
