import { expect, test } from '@playwright/test'
import { NEEDS, cleanupTestUser, eveningClock, live, login, plus, tab } from './helpers'

test.beforeAll(cleanupTestUser)
test.afterAll(cleanupTestUser)

test('день отмечается: привычка в 1 тап, энергия, активность — всё сохраняется само', async ({ page }) => {
  test.skip(!live, NEEDS)
  await eveningClock(page) // «Энергия» is in «Вечер», folded before 18:00
  await login(page)

  // «Утренний старт» is off: without stages the day has two habits
  await expect(page.getByRole('checkbox', { name: /Утренний старт/ })).toHaveCount(0)
  const habit = page.getByRole('checkbox', { name: /Вода/ })
  await expect(habit).toHaveAttribute('aria-checked', 'false')
  await habit.click()
  await expect(habit).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('1 из 2')).toBeVisible()

  await page.getByRole('button', { name: 'Энергия: 7' }).click()
  await expect(page.getByRole('button', { name: 'Энергия: 7' })).toHaveAttribute('aria-pressed', 'true')

  // «Движение»: several activities a day, score = minutes / 10 × points (средняя — 2)
  await tab(page, 'Тело')
  await plus(page) // «+» on Тело → День is a new activity on the day shown
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
  await expect(page.getByRole('checkbox', { name: /Вода/ })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('button', { name: 'Энергия: 7' })).toHaveAttribute('aria-pressed', 'true')
  await tab(page, 'Тело')
  await expect(page.getByText('скор дня 6')).toBeVisible()
  await tab(page, 'Сегодня')

  // Second tap unmarks
  await page.getByRole('checkbox', { name: /Вода/ }).click()
  await expect(page.getByRole('checkbox', { name: /Вода/ })).toHaveAttribute('aria-checked', 'false')
})

test('«Провал» и «Кофе» — [Нет | Да]: кофе по умолчанию «Нет», «Да» — 1 чашка', async ({ page }) => {
  test.skip(!live, NEEDS)
  await eveningClock(page)
  await login(page)
  const evening = page.getByRole('group', { name: 'Кофе' })
  await expect(evening.getByRole('button', { name: 'Кофе: нет' })).toHaveAttribute('aria-pressed', 'true')
  await evening.getByRole('button', { name: 'Кофе: да' }).click()
  await expect(page.getByText('чашка', { exact: true })).toBeVisible() // the counter starts at 1
  await page.getByRole('button', { name: 'Ещё чашка' }).click()
  await expect(page.getByText('чашки', { exact: true })).toBeVisible()
  const slump = page.getByRole('group', { name: 'Провал после обеда' })
  await expect(slump.getByRole('button', { name: /: (да|нет)$/, pressed: true })).toHaveCount(0) // no default
  await slump.getByRole('button', { name: 'Провал после обеда: нет' }).click()
  await page.reload()
  await expect(page.getByRole('group', { name: 'Провал после обеда' }).getByRole('button', { name: 'Провал после обеда: нет' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('чашки', { exact: true })).toBeVisible()
})

test('«Кор»: «Начать» → отметки, «Домик был?», «Готово» — засчитано', async ({ page }) => {
  test.skip(!live, NEEDS)
  await login(page)
  await page.getByRole('link', { name: 'Начать' }).click()
  await expect(page.getByText('Усилие на выдохе. Вставать через бок. Не тужиться.')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Дыхание 360°' }).click()
  await expect(page.getByRole('checkbox', { name: 'Дыхание 360°' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('button', { name: 'Готово' })).toBeDisabled()
  await page.getByRole('button', { name: 'Домик был?: нет' }).click()
  await page.getByRole('button', { name: 'Готово' }).click()
  await expect(page.getByRole('link', { name: 'Кор засчитан — открыть' })).toBeVisible()
})
