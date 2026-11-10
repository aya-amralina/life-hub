import { expect, test } from '@playwright/test'
import { NEEDS, cleanupTestUser, live, login } from './helpers'

test.beforeAll(cleanupTestUser)
test.afterAll(cleanupTestUser)

test('«+» → пункт на сегодня → в «Горит» → отметка видна на втором устройстве', async ({ page, browser }) => {
  test.skip(!live, NEEDS)
  const title = `e2e пункт ${Date.now()}`
  await login(page)

  await page.getByRole('button', { name: 'Добавить' }).click()
  const sheet = page.getByRole('dialog', { name: 'Добавить' })
  await sheet.getByRole('tab', { name: 'Пункт' }).click()
  await sheet.getByLabel('Что сделать').fill(title)
  await sheet.getByRole('button', { name: 'Сохранить' }).click()
  await expect(sheet).toBeHidden()

  const box = page.getByRole('checkbox', { name: title })
  await expect(box).toHaveAttribute('aria-checked', 'false')
  await box.click()
  await expect(box).toHaveAttribute('aria-checked', 'true')

  const other = await browser.newContext()
  const p2 = await other.newPage()
  await login(p2)
  await expect(p2.getByRole('checkbox', { name: title })).toHaveAttribute('aria-checked', 'true')
  await other.close()
})
