import { expect, test } from '@playwright/test'
import { NEEDS, cleanupTestUser, live, login, plus, tab } from './helpers'

test.beforeAll(cleanupTestUser)
test.afterAll(cleanupTestUser)

test('лимиты недели, быстрая трата за 3 тапа, «Отменить»', async ({ page }) => {
  test.skip(!live, NEEDS)
  await login(page)

  await tab(page, 'Деньги')
  await page.getByRole('button', { name: 'Задать лимиты' }).click()
  const sheet = page.getByRole('dialog', { name: 'Лимиты недели' })
  await sheet.getByLabel('Продукты').fill('20')
  await sheet.getByLabel('Кофейни и перекусы').fill('6')
  await sheet.getByRole('button', { name: 'Сохранить' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('из 26 €')).toBeVisible()

  // «+» → 4,60 → Кофейни: saved at once
  await plus(page) // on Деньги «+» is an expense right away
  const add = page.getByRole('dialog', { name: 'Трата' })
  for (const k of ['4', ',', '6']) await add.getByRole('button', { name: k, exact: true }).click()
  await add.getByRole('button', { name: /^Кофейни и перекусы/ }).click()
  await expect(add).toBeHidden()
  await expect(page.getByText('4,60 € · Кофейни и перекусы')).toBeVisible()

  await expect(page.getByText(/осталось 21,40/)).toBeVisible()

  // Second expense pushes Кофейни over the limit → amber caption
  await plus(page)
  for (const k of ['3']) await add.getByRole('button', { name: k, exact: true }).click()
  await add.getByRole('button', { name: /^Кофейни и перекусы/ }).click()
  await expect(page.getByText('+1,60 € сверх лимита')).toBeVisible()

  // Undo the last one
  await page.getByRole('button', { name: 'Отменить' }).click()
  await expect(page.getByText('+1,60 € сверх лимита')).toBeHidden()
  await expect(page.getByText(/осталось 21,40/)).toBeVisible()
})
