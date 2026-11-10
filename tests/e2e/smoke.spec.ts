import { expect, test } from '@playwright/test'

const url = process.env.VITE_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
const email = process.env.LIFEHUB_EMAIL

test('login screen', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Life Hub' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Отправить ссылку' })).toBeVisible()
})

test('magic link → «Сегодня»', async ({ page }) => {
  test.skip(!url || !secretKey || !email, 'needs VITE_SUPABASE_URL, SUPABASE_SECRET_KEY, LIFEHUB_EMAIL in .env.local')

  // Admin API issues a one-time magic link for the existing user (no e-mail is sent).
  // sb_secret_ keys are not JWTs: they go only in `apikey`, never as `Authorization: Bearer`.
  const res = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: secretKey!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email, redirect_to: 'http://localhost:5173' }),
  })
  expect(res.ok, `generate_link HTTP ${res.status}`).toBe(true)
  const { action_link } = (await res.json()) as { action_link: string }

  await page.goto(action_link)
  await expect(page.getByRole('navigation', { name: 'Разделы' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Настройки' })).toBeVisible()
  await expect(page.getByText(/Горит|Ничего не горит/).first()).toBeVisible()

  await page.getByRole('link', { name: 'Работа' }).click()
  await expect(page.getByRole('heading', { name: 'Работа' })).toBeVisible()
})
