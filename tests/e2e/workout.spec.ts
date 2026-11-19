import { expect, test } from '@playwright/test'
import { NEEDS, bodyTab, cleanupTestUser, live, login, tab } from './helpers'

test.beforeAll(cleanupTestUser)
test.afterAll(cleanupTestUser)

test('силовая: очередь недели → подход в 1 тап → кардио → «Готово» — в неделе и в активностях дня', async ({ page }) => {
  test.skip(!live, NEEDS)
  await login(page)
  await tab(page, 'Тело')
  await bodyTab(page, 'Тренировки')
  await expect(page.getByRole('list', { name: 'Очередь недели' })).toContainText('— следующая')
  await page.getByRole('link', { name: 'Начать силовую' }).click()

  await expect(page.getByRole('heading', { name: 'Низ A' })).toBeVisible()
  await expect(page.getByText('Усилие на выдохе. Не задерживать дыхание. Вставать через бок. Не тужиться.')).toBeVisible()
  const set1 = page.getByRole('group', { name: 'Болгарские выпады, подход 1' })
  await expect(set1.getByLabel('Повторы')).toHaveValue('8') // the first time — the bottom of the range
  await set1.getByLabel('Вес или резинка').fill('рюкзак')
  await set1.getByRole('checkbox', { name: 'Подход 1: сделан' }).click()
  await expect(set1.getByRole('checkbox', { name: 'Подход 1: сделан' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('checkbox', { name: 'Кардио: сделано' }).click()
  await page.getByRole('button', { name: 'Домик был?: нет' }).click()
  await page.getByRole('button', { name: 'Готово' }).click()

  await expect(page.getByText('Сегодня силовая засчитана.')).toBeVisible()
  await bodyTab(page, 'Сегодня')
  await expect(page.getByText(/\. Силовые 1 из \d/)).toBeVisible() // the header line of «Сегодня»
  await expect(page.getByText('Кардио · 15 мин', { exact: true })).toBeVisible()
})
