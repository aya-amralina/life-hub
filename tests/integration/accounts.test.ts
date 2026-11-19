import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ACCOUNT_SEED } from '../../src/lib/constants'
import { supabaseConfigured, testUser } from '../testUser'

// Migrations 0016–0019 on the live base: the seeded accounts, the checks of the triggers and of transfers, the old
// text «Счёт» gone. Writes only as the test user and removes its rows; the secret key only reads counts.
const url = process.env.VITE_SUPABASE_URL
const publishable = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const secret = process.env.SUPABASE_SECRET_KEY
const realEmail = process.env.LIFEHUB_EMAIL
const user = testUser()
const ready = supabaseConfigured() && Boolean(publishable && user)
const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const

describe.skipIf(!ready)('live: accounts (0016–0019)', () => {
  let sb: SupabaseClient
  const id: Record<string, string> = {}
  const made: { table: string; id: string }[] = []
  const keep = <T extends { id: string }>(table: string, row: T | null): T | null => {
    if (row) made.push({ table, id: row.id })
    return row
  }

  beforeAll(async () => {
    sb = createClient(url!, publishable!, noSession)
    expect((await sb.auth.signInWithPassword(user!)).error).toBeNull()
    const { data, error } = await sb.from('accounts').select('id, source_id')
    expect(error).toBeNull()
    for (const a of data ?? []) if (a.source_id) id[a.source_id] = a.id
  })

  afterAll(async () => {
    for (const m of made.reverse()) await sb.from(m.table).delete().eq('id', m.id)
    await sb.auth.signOut()
  })

  it('the test user has the nine seeded accounts', () => {
    expect(Object.keys(id).sort()).toEqual(ACCOUNT_SEED.map((a) => a.source_id).sort())
  })

  it('the old text «Счёт» is gone (0019): a row cannot carry it', async () => {
    const r = await sb.from('transactions').insert({ date: '2026-11-20', amount_eur: 1, kind: 'expense', title: 'it-accounts', account: 'Revolut' } as never)
    expect(r.error?.code).toBe('PGRST204') // no such column
  })

  it('a transfer after the start is «откуда → куда» in the base too (0019); history is free', async () => {
    const transfer = (date: string, to: string | null, from = id['acct:revolut-main']!) =>
      sb.from('transactions').insert({ date, amount_eur: 1, kind: 'transfer', title: 'it-accounts', account_id: from, to_account_id: to }).select('id').single()
    expect((await transfer('2026-11-20', null)).error?.code).toBe('23514')
    expect((await transfer('2026-11-20', id['acct:revolut-main']!)).error?.code).toBe('23514')
    keep('transactions', (await transfer('2026-11-20', id['acct:revolut-cushion']!)).data)
    keep('transactions', (await transfer('2026-11-18', null)).data)
    const rule = await sb.from('recurring').insert({ title: 'it-accounts', amount_eur: 1, kind: 'transfer', freq: 'monthly', anchor_date: '2026-12-01', account_id: id['acct:revolut-main'] }).select('id').single()
    expect(rule.error?.code).toBe('23514')
  })

  it('after the start an expense only from «Баланс»; history and income are free', async () => {
    const expense = (date: string, account_id: string, kind = 'expense') => sb.from('transactions').insert({ date, amount_eur: 1, kind, title: 'it-accounts', account_id }).select('id').single()
    expect((await expense('2026-11-20', id['acct:revolut-cushion']!)).error?.code).toBe('23514')
    keep('transactions', (await expense('2026-11-18', id['acct:revolut-cushion']!)).data)
    keep('transactions', (await expense('2026-11-20', id['acct:revolut-cushion']!, 'income')).data)
    expect(made.filter((m) => m.table === 'transactions')).toHaveLength(4)
  })

  it('a goal only on «Подушка»; below zero only on «Баланс»', async () => {
    const goal = (account_id: string) => sb.from('envelopes').insert({ name: `it-accounts-${account_id.slice(0, 6)}`, type: 'goal', goal_eur: 10, account_id }).select('id').single()
    expect((await goal(id['acct:revolut-main']!)).error?.code).toBe('23514')
    keep('envelopes', (await goal(id['acct:revolut-cushion']!)).data)
    const balance = (account_id: string) => sb.from('actual_balances').insert({ date: '2026-11-20', account_id, amount_eur: -5, origin: 'review' }).select('id').single()
    expect((await balance(id['acct:revolut-cushion']!)).error?.code).toBe('23514')
    keep('actual_balances', (await balance(id['acct:sparkasse']!)).data)
    expect(made.filter((m) => m.table !== 'transactions')).toHaveLength(2) // the goal on «Подушка» and Sparkasse below zero
  })

  it.skipIf(!secret || !realEmail)('the real user: nine accounts, every transfer after the start «откуда → куда» (counts only)', async () => {
    const admin = createClient(url!, secret!, noSession)
    const users = await admin.auth.admin.listUsers({ perPage: 100 })
    const realId = users.data.users.find((u) => u.email?.toLowerCase() === realEmail!.toLowerCase())!.id
    const accounts = await admin.from('accounts').select('id', { count: 'exact', head: true }).eq('user_id', realId)
    expect(accounts.count).toBe(9)
    const loose = await admin.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', realId).eq('kind', 'transfer').gt('date', '2026-11-18').or('account_id.is.null,to_account_id.is.null')
    expect(loose.error).toBeNull()
    expect(loose.count).toBe(0)
  })
})
