import { expect, test } from '@playwright/test'
import { supabaseConfigured, testUser } from '../testUser'

// Signs in only as the dedicated test user (LIFEHUB_TEST_*), never as the real account.
const user = testUser()
const live = supabaseConfigured()
const NEEDS = 'needs VITE_SUPABASE_URL (real project), LIFEHUB_TEST_EMAIL, LIFEHUB_TEST_PASSWORD in .env.local'

test('login screen', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Life Hub' })).toBeVisible()

  // Password managers (iPhone Keychain) rely on these hints.
  await expect(page.getByLabel('E-mail')).toHaveAttribute('autocomplete', 'username')
  await expect(page.getByLabel('Пароль')).toHaveAttribute('autocomplete', 'current-password')
  await expect(page.getByLabel('Пароль')).toHaveAttribute('type', 'password')

  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Войти по ссылке из письма' })).toBeVisible()
})

test('wrong password shows a calm error', async ({ page }) => {
  test.skip(!live || !user, NEEDS)
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(user!.email)
  await page.getByLabel('Пароль').fill('definitely-not-the-password')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Неверная почта или пароль.')
})

test('e-mail + password → «Сегодня»', async ({ page }) => {
  test.skip(!live || !user, NEEDS)

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(user!.email)
  await page.getByLabel('Пароль').fill(user!.password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()

  await expect(page.getByRole('navigation', { name: 'Разделы' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Настройки' })).toBeVisible()
  await expect(page.getByText(/Горит|Ничего не горит/).first()).toBeVisible()

  await page.getByRole('link', { name: 'Работа' }).click()
  await expect(page.getByRole('heading', { name: 'Работа' })).toBeVisible()
})
