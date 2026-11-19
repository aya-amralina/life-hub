import { createClient } from '@supabase/supabase-js'
import { expect, type Page } from '@playwright/test'
import { ACCOUNT_SEED } from '../../src/lib/constants'
import { addDaysISO, hourBerlin, todayBerlin, type ISODate } from '../../src/lib/dates'
import { supabaseConfigured, testUser } from '../testUser'

export const user = testUser()
export const live = supabaseConfigured() && user !== null
export const NEEDS = 'needs VITE_SUPABASE_URL (real project), LIFEHUB_TEST_EMAIL, LIFEHUB_TEST_PASSWORD in .env.local'

/** The instant of `hour`:00 Berlin time on `day`. */
export function berlinAt(day: ISODate, hour: number): Date {
  const [y, m, d] = day.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, hour)
  const offset = (hourBerlin(new Date(guess)) - hour + 24) % 24 // 1 (CET) or 2 (CEST)
  return new Date(guess - offset * 3_600_000)
}

/**
 * Pin the page's clock to 20:00 Berlin yesterday, so «Вечер» is open whatever the real hour. Call before login.
 * Always behind the real time, never ahead: a clock ahead of the server makes the fresh session look expired.
 * The clock keeps running from there, timers work as usual.
 */
export async function eveningClock(page: Page) {
  await page.clock.install({ time: berlinAt(addDaysISO(todayBerlin(), -1), 20) })
}

/** Go to a section via the bottom tab bar (card headers on «Сегодня» are links with the same names). */
export async function tab(page: Page, name: 'Сегодня' | 'Деньги' | 'Работа' | 'Учёба' | 'Тело') {
  await page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name, exact: true }).click()
}

/** Open a section of the current sphere from its «Ещё» list (a row may carry a hint after the name). */
export async function more(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Ещё' }).getByRole('link', { name: new RegExp(`^${name}`) }).click()
}

/** «+» of the current screen. */
export async function plus(page: Page) {
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
}

/** «+» on «Сегодня» → the chooser → one of its forms (e.g. 'Дело'). */
export async function addFromToday(page: Page, choice: string) {
  await plus(page)
  await page.getByRole('dialog', { name: 'Добавить' }).getByRole('button', { name: new RegExp(`^${choice}`) }).click()
}

export async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(user!.email)
  await page.getByLabel('Пароль').fill(user!.password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Разделы' })).toBeVisible()
}

// Child tables first (FKs).
const TABLES = [
  'core_sessions',
  'core_tests',
  'week_limits',
  'actual_balances',
  'transactions',
  'recurring',
  'debts',
  'items',
  'daily_logs',
  'activities',
  'activity_types',
  'intake',
  'strength_sets',
  'measurements',
  'people',
  'wishlist',
  'reviews',
  'import_baseline',
  'notes',
  'plan_stages',
  'envelopes',
  'weeks',
] as const

/**
 * Remove everything the TEST user owns. Signs in as the test user (publishable key), so RLS limits
 * the delete to its own rows; additionally refuses to run unless the session e-mail is the test one.
 */
export async function cleanupTestUser() {
  if (!live) return
  const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await sb.auth.signInWithPassword(user!)
  if (error) throw new Error(`cleanup sign-in failed: ${error.code}`)
  if (data.user?.email?.toLowerCase() !== user!.email) throw new Error('cleanup: not the test user — refusing')
  for (const table of TABLES) {
    const del = await sb.from(table).delete().not('id', 'is', null)
    if (del.error) throw new Error(`cleanup ${table} failed: ${del.error.code}`)
  }
  await resetAccounts(sb)
  await resetCore(sb)
  await sb.auth.signOut()
}

/**
 * Accounts come from migration 0016, not from the tests: after the operations that point to them are gone, the
 * accounts a test added are deleted and the nine seeded ones are back as seeded (name, group, order, not archived).
 */
async function resetAccounts(sb: Awaited<ReturnType<typeof testClient>>) {
  const seeded = ACCOUNT_SEED.map((a) => a.source_id)
  const del = await sb.from('accounts').delete().or(`source_id.is.null,source_id.not.in.(${seeded.join(',')})`)
  if (del.error) throw new Error(`cleanup accounts failed: ${del.error.code}`)
  const up = await sb.from('accounts').upsert(
    ACCOUNT_SEED.map((a) => ({ ...a, archived: false })),
    { onConflict: 'user_id,source_id' },
  )
  if (up.error) throw new Error(`reset accounts failed: ${up.error.code}`)
}

/** «Кор» comes from migration 0020, like the accounts: its sessions and tests are gone, the program is back on stage 1. */
async function resetCore(sb: Awaited<ReturnType<typeof testClient>>) {
  const up = await sb.from('core_programs').update({ stage: 1, stage_since: '2026-11-19', offer_after: null }).eq('source_id', 'core:program')
  if (up.error) throw new Error(`reset core failed: ${up.error.code}`)
}

/** Signed-in client of the TEST user — for seeding rows a scenario needs (RLS keeps them its own). */
export async function testClient() {
  const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await sb.auth.signInWithPassword(user!)
  if (error) throw new Error(`seed sign-in failed: ${error.code}`)
  if (data.user?.email?.toLowerCase() !== user!.email) throw new Error('seed: not the test user — refusing')
  return sb
}

/** Berlin calendar date with an offset in days, as the app computes «сегодня». */
export function berlinDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Monday of the Berlin week containing the date, shifted by whole weeks. */
export function berlinMonday(weeks = 0): string {
  const today = berlinDate()
  const [y, m, d] = today.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!))
  const dow = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dow + weeks * 7)
  return date.toISOString().slice(0, 10)
}
