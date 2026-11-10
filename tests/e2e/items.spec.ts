import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { supabaseConfigured, testUser } from '../testUser'

// Writes ONLY as the dedicated test user and removes its own rows afterwards.
const user = testUser()
const live = supabaseConfigured()
const PREFIX = 'e2e '

async function cleanup() {
  if (!live || !user) return
  const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await sb.auth.signInWithPassword(user)
  if (error) throw new Error(`cleanup sign-in failed: ${error.code}`)
  const del = await sb.from('items').delete().like('title', `${PREFIX}%`)
  if (del.error) throw new Error(`cleanup failed: ${del.error.code}`)
  await sb.auth.signOut()
}

test.beforeAll(cleanup)
test.afterAll(cleanup)

test('«+» → пункт на сегодня → в «Горит» → отметка сохраняется', async ({ page, browser }) => {
  test.skip(!live || !user, 'needs VITE_SUPABASE_URL (real project), LIFEHUB_TEST_EMAIL, LIFEHUB_TEST_PASSWORD in .env.local')
  const title = `${PREFIX}${Date.now()}`

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(user!.email)
  await page.getByLabel('Пароль').fill(user!.password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Разделы' })).toBeVisible()

  await page.getByRole('button', { name: 'Добавить' }).click()
  const sheet = page.getByRole('dialog', { name: 'Добавить' })
  await expect(sheet.getByRole('tab', { name: 'Пункт', selected: true })).toBeVisible()
  await sheet.getByLabel('Что сделать').fill(title)
  await sheet.getByRole('button', { name: 'Сохранить' }).click()
  await expect(sheet).toBeHidden()

  const box = page.getByRole('checkbox', { name: title })
  await expect(box).toHaveAttribute('aria-checked', 'false')
  await box.click()
  await expect(box).toHaveAttribute('aria-checked', 'true')

  // «Second device»: a fresh browser context sees the saved, checked item.
  const other = await browser.newContext()
  const p2 = await other.newPage()
  await p2.goto('/login')
  await p2.getByLabel('E-mail').fill(user!.email)
  await p2.getByLabel('Пароль').fill(user!.password)
  await p2.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(p2.getByRole('checkbox', { name: title })).toHaveAttribute('aria-checked', 'true')
  await other.close()
})
