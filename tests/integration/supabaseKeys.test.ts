import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { supabaseConfigured, testUser } from '../testUser'

const url = process.env.VITE_SUPABASE_URL
const publishable = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const secret = process.env.SUPABASE_SECRET_KEY
const realEmail = process.env.LIFEHUB_EMAIL // only to look up the real user's id, never to sign in
const user = testUser() // the only account tests sign in with
const ready = supabaseConfigured() && Boolean(publishable && secret && user)
const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const

async function adminFindUserId(email: string): Promise<string | undefined> {
  const admin = createClient(url!, secret!, noSession)
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 100 })
  expect(error).toBeNull()
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id
}

// Statuses and counts only — no row contents in output. Nothing is written.
describe.skipIf(!ready)('live: Supabase keys, privileges, test user', () => {
  it('keys have the new format', () => {
    expect(publishable!.startsWith('sb_publishable_')).toBe(true)
    expect(secret!.startsWith('sb_secret_')).toBe(true)
  })

  it('publishable key without a session has no privileges (anon: no GRANTs)', async () => {
    const sb = createClient(url!, publishable!, noSession)
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

  it('secret key reaches Auth admin API and finds the test user', async () => {
    expect(await adminFindUserId(user!.email)).toBeTruthy()
  })

  it('secret key bypasses RLS for the importer', async () => {
    const admin = createClient(url!, secret!, noSession)
    const { error, count } = await admin.from('weeks').select('id', { count: 'exact', head: true })
    expect(error).toBeNull()
    expect(typeof count).toBe('number')
  })

  it('test user signs in with password and reads own rows (authenticated GRANT + RLS)', async () => {
    const sb = createClient(url!, publishable!, noSession)
    const { data, error } = await sb.auth.signInWithPassword(user!)
    expect(error).toBeNull()
    expect(data.session?.access_token).toBeTruthy()
    for (const table of ['weeks', 'items'] as const) {
      const res = await sb.from(table).select('id', { count: 'exact', head: true })
      expect(res.error).toBeNull()
    }
    await sb.auth.signOut()
  })

  it.skipIf(!realEmail)('test user cannot see the real user’s rows (RLS isolation)', async () => {
    const realId = await adminFindUserId(realEmail!)
    expect(realId).toBeTruthy()
    const sb = createClient(url!, publishable!, noSession)
    expect((await sb.auth.signInWithPassword(user!)).error).toBeNull()
    for (const table of ['weeks', 'items'] as const) {
      const res = await sb.from(table).select('id', { count: 'exact', head: true }).eq('user_id', realId!)
      expect(res.error).toBeNull()
      expect(res.count).toBe(0)
    }
    await sb.auth.signOut()
  })
})
