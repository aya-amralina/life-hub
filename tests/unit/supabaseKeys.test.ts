import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

// What supabase-js actually sends with new-format keys (no network: fetch is captured).
function capture() {
  const calls: Headers[] = []
  const fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push(new Headers(init?.headers))
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return { calls, fetch }
}

describe('supabase-js with new API keys', () => {
  it('publishable key goes in apikey for REST', async () => {
    const { calls, fetch } = capture()
    const sb = createClient('https://abc.supabase.co', 'sb_publishable_TEST', {
      global: { fetch },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    await sb.from('items').select('id')
    expect(calls[0]?.get('apikey')).toBe('sb_publishable_TEST')
  })

  it('a signed-in session sends the user JWT as Bearer, not the key', async () => {
    const { calls, fetch } = capture()
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.sig'
    const sb = createClient('https://abc.supabase.co', 'sb_publishable_TEST', {
      global: { fetch },
      accessToken: async () => jwt,
    })
    await sb.from('items').select('id')
    expect(calls[0]?.get('apikey')).toBe('sb_publishable_TEST')
    expect(calls[0]?.get('Authorization')).toBe(`Bearer ${jwt}`)
  })

  it('edge functions never get a new-format key as Bearer', async () => {
    const { calls, fetch } = capture()
    const sb = createClient('https://abc.supabase.co', 'sb_secret_TEST', {
      global: { fetch },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    await sb.functions.invoke('noop')
    expect(calls[0]?.get('apikey')).toBe('sb_secret_TEST')
    expect(calls[0]?.get('Authorization')).toBeNull()
  })
})
