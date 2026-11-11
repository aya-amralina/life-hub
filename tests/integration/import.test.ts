import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { todayBerlin } from '../../src/lib/dates'
import { balanceAt, signedCents, type TxLike } from '../../src/lib/rules/money'
import { supabaseConfigured } from '../testUser'

// SPEC §6 checks after the import, on the REAL user's base (LIFEHUB_EMAIL). Read-only with the secret key
// (bypasses RLS, filtered by user_id). Counts and sums only — no row contents in the output.
const url = process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const email = process.env.LIFEHUB_EMAIL
const ready = supabaseConfigured() && Boolean(secret && email)

// Control numbers from the Excel files (dry-run 11.11.2026; SPEC §6).
const BALANCE_END_CENTS = 178814
const WORK_TASKS = 31 // non-empty rows of «Dev Aufgaben»
const CHECKLIST_ITEMS = 254 // rows of «Чеклист» (without the 2 instruction rows)
const H04_HOURS = 27.5

async function setup() {
  const admin = createClient(url!, secret!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 100 })
  expect(error).toBeNull()
  const uid = data.users.find((u) => u.email?.toLowerCase() === email!.toLowerCase())?.id
  expect(uid).toBeTruthy()
  return { admin, uid: uid! }
}

describe.skipIf(!ready)('import checks (SPEC §6)', () => {
  it('balance on 31.12.2026 of the imported operations = 1788,14 € (Excel and the app forecast)', async () => {
    const { admin, uid } = await setup()
    const { data, error } = await admin
      .from('transactions')
      .select('date, amount_eur, kind, category, envelope_id, is_planned, confirmed_at, cancelled_at, week_budget, grp, source_id')
      .eq('user_id', uid)
      .not('source_id', 'is', null)
    expect(error).toBeNull()
    const txs = data as (TxLike & { source_id: string })[]
    expect(txs.length).toBeGreaterThan(0)
    // as in the «Обзор» sheet: every imported operation with its sign
    const excel = txs.filter((t) => !t.cancelled_at && t.date <= '2026-12-31').reduce((s, t) => s + signedCents(t), 0)
    expect(excel).toBe(BALANCE_END_CENTS)
    // as the app shows it in the import week (rule 26: the current week costs its budget when nothing is spent yet)
    if (todayBerlin() <= '2026-11-15') expect(balanceAt(txs, '2026-12-31', 'plan', todayBerlin())).toBe(BALANCE_END_CENTS)
  })

  it('work tasks = non-empty rows of «Dev Aufgaben»', async () => {
    const { admin, uid } = await setup()
    const { count, error } = await admin.from('items').select('id', { count: 'exact', head: true }).eq('user_id', uid).like('source_id', 'work:%')
    expect(error).toBeNull()
    expect(count).toBe(WORK_TASKS)
  })

  it('checklist items = rows of «Чеклист»', async () => {
    const { admin, uid } = await setup()
    const { data, error } = await admin.from('items').select('source_id').eq('user_id', uid).like('source_id', 'study:%')
    expect(error).toBeNull()
    expect((data ?? []).filter((r) => !r.source_id!.startsWith('study:dl:')).length).toBe(CHECKLIST_ITEMS)
  })

  it('study hours of Н04 = 27,5 h (items planned there, not rolled over from earlier weeks)', async () => {
    const { admin, uid } = await setup()
    const week = await admin.from('weeks').select('id').eq('user_id', uid).eq('study_week', 'Н04').single()
    expect(week.error).toBeNull()
    const { data, error } = await admin
      .from('items')
      .select('hours_est, source_id, rollover_count')
      .eq('user_id', uid)
      .eq('week_id', week.data!.id)
      .like('source_id', 'study:%')
    expect(error).toBeNull()
    const hours = (data ?? [])
      .filter((i) => !i.source_id!.startsWith('study:dl:') && i.rollover_count === 0)
      .reduce((s, i) => s + (Number(i.hours_est) || 0), 0)
    expect(hours).toBeCloseTo(H04_HOURS, 2)
  })
})
