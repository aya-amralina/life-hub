import { expect, test } from '@playwright/test'

const email = process.env.LIFEHUB_EMAIL
const password = process.env.LIFEHUB_PASSWORD
// Real project URL, not the .env.example placeholder.
const configured = /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(process.env.VITE_SUPABASE_URL ?? '')

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
  test.skip(!configured || !email, 'needs VITE_SUPABASE_URL (real project), LIFEHUB_EMAIL in .env.local')
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email!)
  await page.getByLabel('Пароль').fill('definitely-not-the-password')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Неверная почта или пароль.')
})

test('e-mail + password → «Сегодня»', async ({ page }) => {
  test.skip(!configured || !email || !password, 'needs VITE_SUPABASE_URL (real project), LIFEHUB_EMAIL, LIFEHUB_PASSWORD in .env.local')

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email!)
  await page.getByLabel('Пароль').fill(password!)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()

  await expect(page.getByRole('navigation', { name: 'Разделы' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Настройки' })).toBeVisible()
  await expect(page.getByText(/Горит|Ничего не горит/).first()).toBeVisible()

  await page.getByRole('link', { name: 'Работа' }).click()
  await expect(page.getByRole('heading', { name: 'Работа' })).toBeVisible()
})
