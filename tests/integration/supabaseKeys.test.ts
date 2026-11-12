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

// Every table of the schema: anon has no privileges, the test user sees only its own rows.
const TABLES = [
  'weeks',
  'items',
  'daily_logs',
  'plan_stages',
  'transactions',
  'week_limits',
  'envelopes',
  'notes',
  'activity_types',
  'activities',
  'intake',
  'people',
  'strength_sets',
  'measurements',
  'wishlist',
  'reviews',
] as const

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
    for (const table of TABLES) {
      const { data, error } = await sb.from(table).select('id').limit(1)
      expect(data).toBeNull()
      expect(error?.code).toBe('42501') // permission denied
    }
  })

  it('keep-alive: ping() answers 1 to the publishable key without a session — and only it', async () => {
    const res = await fetch(`${url}/rest/v1/rpc/ping`, { method: 'POST', headers: { apikey: publishable!, 'Content-Type': 'application/json' }, body: '{}' })
    expect(res.status).toBe(200)
    expect(await res.json()).toBe(1)
    const sb = createClient(url!, publishable!, noSession)
    expect((await sb.from('items').select('id').limit(1)).error?.code).toBe('42501')
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
    for (const table of TABLES) {
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
    for (const table of TABLES) {
      const res = await sb.from(table).select('id', { count: 'exact', head: true }).eq('user_id', realId!)
      expect(res.error).toBeNull()
      expect(res.count).toBe(0)
    }
    await sb.auth.signOut()
  })
})

describe.skipIf(!ready)('live: stage 3 tables — the test user writes and cleans up its own rows', () => {
  it('activity type + activity + intake: insert, read back, delete', async () => {
    const sb = createClient(url!, publishable!, noSession)
    expect((await sb.auth.signInWithPassword(user!)).error).toBeNull()
    const type = await sb.from('activity_types').insert({ name: `it-${Date.now()}`, intensity: 'лёгкая', points_per_10min: 1 }).select('id').single()
    expect(type.error).toBeNull()
    const act = await sb.from('activities').insert({ date: '2026-11-10', type_id: type.data!.id, minutes: 20 }).select('id').single()
    expect(act.error).toBeNull()
    const intake = await sb.from('intake').insert({ name: 'it', start_date: '2026-11-10' }).select('id').single()
    expect(intake.error).toBeNull()
    // the type is in use — deleting it first is refused (on delete restrict)
    expect((await sb.from('activity_types').delete().eq('id', type.data!.id)).error).not.toBeNull()
    expect((await sb.from('activities').delete().eq('id', act.data!.id)).error).toBeNull()
    expect((await sb.from('activity_types').delete().eq('id', type.data!.id)).error).toBeNull()
    expect((await sb.from('intake').delete().eq('id', intake.data!.id)).error).toBeNull()
    await sb.auth.signOut()
  })

  it('items: start after deadline is refused by the schema', async () => {
    const sb = createClient(url!, publishable!, noSession)
    expect((await sb.auth.signInWithPassword(user!)).error).toBeNull()
    const res = await sb.from('items').insert({ sphere: 'personal', title: 'it', starts_on: '2026-12-10', due_date: '2026-12-01' })
    expect(res.error?.code).toBe('23514') // check violation
    await sb.auth.signOut()
  })
})
