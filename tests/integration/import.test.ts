import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { todayBerlin } from '../../src/lib/dates'
import { balanceAt, type TxLike } from '../../src/lib/rules/money'
import { supabaseConfigured } from '../testUser'

// SPEC §6 checks after the import, on the REAL user's base (LIFEHUB_EMAIL). Read-only with the secret key
// (bypasses RLS, filtered by user_id). Counts and sums only — no row contents in the output.
const url = process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const email = process.env.LIFEHUB_EMAIL
const ready = supabaseConfigured() && Boolean(secret && email)

// Control numbers from the Excel files (SPEC §6) — what the one-time import brought in.
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
  // Until 12.11.2026 this compared the balance of the imported operations with the last imported Excel. The app is
  // the source now (operations are created and edited in it), so the two legitimately differ: only the shape is checked.
  it('operations are there: one start row, a finite plan to 31.12', async () => {
    const { admin, uid } = await setup()
    const { data, error } = await admin
      .from('transactions')
      .select('date, amount_eur, kind, category, envelope_id, is_planned, confirmed_at, cancelled_at, entry_kind, grp')
      .eq('user_id', uid)
    expect(error).toBeNull()
    const txs = data as TxLike[]
    expect(txs.length).toBeGreaterThan(0)
    expect(txs.filter((t) => t.kind === 'opening' && !t.cancelled_at)).toHaveLength(1)
    expect(Number.isFinite(balanceAt(txs, '2026-12-31', 'plan', todayBerlin()))).toBe(true)
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
