import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

const url = process.env.VITE_SUPABASE_URL
const publishable = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const secret = process.env.SUPABASE_SECRET_KEY
const email = process.env.LIFEHUB_EMAIL
const ready = Boolean(url && publishable && secret && email)

// Statuses and counts only — no row contents in output.
describe.skipIf(!ready)('live: supabase-js with sb_publishable_ / sb_secret_ keys', () => {
  it('keys have the new format', () => {
    expect(publishable!.startsWith('sb_publishable_')).toBe(true)
    expect(secret!.startsWith('sb_secret_')).toBe(true)
  })

  it('publishable key without a session has no privileges (anon: no GRANTs)', async () => {
    const sb = createClient(url!, publishable!, { auth: { persistSession: false, autoRefreshToken: false } })
    for (const table of ['weeks', 'items'] as const) {
      const { data, error } = await sb.from(table).select('id').limit(1)
      expect(data).toBeNull()
      expect(error?.code).toBe('42501') // permission denied
    }
  })

  it('signups are disabled', async () => {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publishable! } })
    expect(res.status).toBe(200)
    const settings = (await res.json()) as { disable_signup?: boolean }
    expect(settings.disable_signup).toBe(true)
  })

  it('secret key reaches Auth admin API and finds the user', async () => {
    const admin = createClient(url!, secret!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 100 })
    expect(error).toBeNull()
    expect(data.users.some((u) => u.email?.toLowerCase() === email!.toLowerCase())).toBe(true)
  })

  it('secret key bypasses RLS for the importer', async () => {
    const admin = createClient(url!, secret!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error, count } = await admin.from('weeks').select('id', { count: 'exact', head: true })
    expect(error).toBeNull()
    expect(typeof count).toBe('number')
  })
})
