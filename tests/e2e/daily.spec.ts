import { expect, test } from '@playwright/test'
import { NEEDS, cleanupTestUser, live, login, tab } from './helpers'

test.beforeAll(cleanupTestUser)
test.afterAll(cleanupTestUser)

test('день отмечается: привычка в 1 тап, энергия, активность — всё сохраняется само', async ({ page }) => {
  test.skip(!live, NEEDS)
  await login(page)

  const habit = page.getByRole('checkbox', { name: /Утренний старт/ })
  await expect(habit).toHaveAttribute('aria-checked', 'false')
  await habit.click()
  await expect(habit).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('1 из 3')).toBeVisible()

  await page.getByRole('button', { name: 'Энергия: 7' }).click()
  await expect(page.getByRole('button', { name: 'Энергия: 7' })).toHaveAttribute('aria-pressed', 'true')

  // «Движение»: several activities a day, score = minutes / 10 × points (средняя — 2)
  await tab(page, 'Тело')
  await page.getByRole('button', { name: 'Активность', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Активность' })
  await sheet.getByLabel('Новый тип').fill('Прогулка')
  await sheet.getByRole('button', { name: 'Добавить тип' }).click()
  await sheet.getByRole('button', { name: 'Прогулка', exact: true }).click()
  await sheet.getByRole('button', { name: '30', exact: true }).click()
  await sheet.getByRole('button', { name: 'Добавить · +6' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('скор дня 6')).toBeVisible()

  // «Уход»: a group keeps one choice, a plain item toggles
  const evening = page.getByRole('group', { name: 'Вечер' })
  await evening.getByRole('button', { name: 'Азелаинка' }).click()
  await evening.getByRole('button', { name: 'Ниацинамид' }).click()
  await expect(evening.getByRole('button', { name: 'Ниацинамид' })).toHaveAttribute('aria-pressed', 'true')
  await expect(evening.getByRole('button', { name: 'Азелаинка' })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'Крем для тела' }).click()
  await expect(page.getByText('2 из 3')).toBeVisible()

  // Reload = fresh data from the server
  await page.reload()
  await expect(page.getByRole('checkbox', { name: /Утренний старт/ })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('button', { name: 'Энергия: 7' })).toHaveAttribute('aria-pressed', 'true')
  await tab(page, 'Тело')
  await expect(page.getByText('скор дня 6')).toBeVisible()
  await tab(page, 'Сегодня')

  // Second tap unmarks
  await page.getByRole('checkbox', { name: /Утренний старт/ }).click()
  await expect(page.getByRole('checkbox', { name: /Утренний старт/ })).toHaveAttribute('aria-checked', 'false')
})
