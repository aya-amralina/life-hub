import { expect, test, type Page } from '@playwright/test'
import { NEEDS, addFromToday, cleanupTestUser, live, login, plus, tab } from './helpers'

test.beforeAll(cleanupTestUser)
test.afterAll(cleanupTestUser)

const REJECTED = 'Не сохранилось: сервер не принял изменение. На экране — то, что на сервере'

/** The server says no to writes of a table (a check fails) — the network is fine. */
async function rejectWrites(page: Page, table: string, method: 'POST' | 'PATCH') {
  await page.route(`**/rest/v1/${table}*`, (route) =>
    route.request().method() === method
      ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '23514', message: 'check violation', details: null, hint: null }) })
      : route.fallback(),
  )
}

test('отказ сервера не молчит: отметка дела возвращается, тост говорит почему', async ({ page }) => {
  test.skip(!live, NEEDS)
  const title = `e2e отказ ${Date.now()}`
  await login(page)
  await addFromToday(page, 'Дело')
  const sheet = page.getByRole('dialog', { name: 'Новое дело' })
  await sheet.getByLabel('Что сделать').fill(title)
  await sheet.getByRole('button', { name: 'Сохранить' }).click()
  await expect(sheet).toBeHidden()
  const box = page.getByRole('checkbox', { name: title })
  await expect(box).toHaveAttribute('aria-checked', 'false')

  await rejectWrites(page, 'items', 'PATCH')
  await box.click()
  await expect(page.getByText(REJECTED)).toBeVisible()
  await expect(box).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByText(/ждут? сети/)).toHaveCount(0) // rejected, not queued
})

test('отказ сервера на трате: трата уходит с экрана, тост говорит почему', async ({ page }) => {
  test.skip(!live, NEEDS)
  await login(page)
  await tab(page, 'Деньги')
  await rejectWrites(page, 'transactions', 'POST')
  await plus(page)
  const add = page.getByRole('dialog', { name: 'Трата' })
  for (const k of ['3', ',', '3']) await add.getByRole('button', { name: k, exact: true }).click()
  await add.getByRole('button', { name: /^Кофейни и перекусы/ }).click()
  await expect(page.getByText(REJECTED)).toBeVisible()
  await expect(page.getByText(/3,30 €/)).toHaveCount(0)
  await page.unroute('**/rest/v1/transactions*')
  await page.reload()
  await expect(page.getByText(/3,30 €/)).toHaveCount(0)
})
