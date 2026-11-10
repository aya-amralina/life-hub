import { expect, test } from '@playwright/test'
import { NEEDS, cleanupTestUser, live, login, tab } from './helpers'

test.beforeAll(cleanupTestUser)
test.afterAll(cleanupTestUser)

test('день отмечается: привычка в 1 тап, энергия, движение — всё сохраняется само', async ({ page }) => {
  test.skip(!live, NEEDS)
  await login(page)

  const habit = page.getByRole('checkbox', { name: /Утренний старт/ })
  await expect(habit).toHaveAttribute('aria-checked', 'false')
  await habit.click()
  await expect(habit).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('1 из 3')).toBeVisible()

  await page.getByRole('button', { name: 'Энергия: 7' }).click()
  await expect(page.getByRole('button', { name: 'Энергия: 7' })).toHaveAttribute('aria-pressed', 'true')

  await tab(page, 'Тело')
  await page.getByRole('button', { name: 'Силовая A' }).click()
  await page.getByRole('button', { name: '30 мин' }).click()
  await expect(page.getByText('Силовая A · 30 мин')).toBeVisible()

  // Reload = fresh data from the server
  await page.reload()
  await expect(page.getByRole('checkbox', { name: /Утренний старт/ })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('button', { name: 'Энергия: 7' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Силовая A' })).toHaveAttribute('aria-pressed', 'true')

  // Second tap unmarks
  await page.getByRole('checkbox', { name: /Утренний старт/ }).click()
  await expect(page.getByRole('checkbox', { name: /Утренний старт/ })).toHaveAttribute('aria-checked', 'false')
})
