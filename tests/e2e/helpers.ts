import { createClient } from '@supabase/supabase-js'
import { expect, type Page } from '@playwright/test'
import { supabaseConfigured, testUser } from '../testUser'

export const user = testUser()
export const live = supabaseConfigured() && user !== null
export const NEEDS = 'needs VITE_SUPABASE_URL (real project), LIFEHUB_TEST_EMAIL, LIFEHUB_TEST_PASSWORD in .env.local'

/** Go to a section via the bottom tab bar (card headers on «Сегодня» are links with the same names). */
export async function tab(page: Page, name: 'Сегодня' | 'Деньги' | 'Работа' | 'Учёба' | 'Тело') {
  await page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name, exact: true }).click()
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
  'week_limits',
  'actual_balances',
  'transactions',
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
  await sb.auth.signOut()
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
