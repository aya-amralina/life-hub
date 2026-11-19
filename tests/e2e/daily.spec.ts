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

  await page.getByRole('button', { name: 'Энергия: 4' }).click()
  await expect(page.getByRole('button', { name: 'Энергия: 4' })).toHaveAttribute('aria-pressed', 'true')

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
  await expect(page.getByText('Прогулка · 30 мин', { exact: true })).toBeVisible()
  await expect(page.getByText('+6', { exact: true })).toBeVisible()

  // «Вечер» (after 18:00): a care group keeps one choice, a plain item toggles
  const evening = page.getByRole('region', { name: 'Вечер' })
  await evening.getByRole('checkbox', { name: 'Азелаинка' }).click()
  await evening.getByRole('checkbox', { name: 'Ниацинамид' }).click()
  await expect(evening.getByRole('checkbox', { name: 'Ниацинамид' })).toHaveAttribute('aria-checked', 'true')
  await expect(evening.getByRole('checkbox', { name: 'Азелаинка' })).toHaveAttribute('aria-checked', 'false')
  await evening.getByRole('checkbox', { name: 'Крем для тела' }).click()
  await expect(evening.getByText('2 из 2')).toBeVisible()

  // Reload = fresh data from the server
  await page.reload()
  await expect(page.getByRole('checkbox', { name: /Вода/ })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('button', { name: 'Энергия: 4' })).toHaveAttribute('aria-pressed', 'true')
  await tab(page, 'Тело')
  await expect(page.getByText('Прогулка · 30 мин', { exact: true })).toBeVisible()
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

test('сервер не принял отметку: она возвращается как была, и об этом сказано', async ({ page }) => {
  test.skip(!live, NEEDS)
  await login(page)
  // a server rejection (not a missing network): the check of the base says no (habits are marked in habit_marks)
  await page.route('**/rest/v1/habit_marks*', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '23514', message: 'check violation', details: null, hint: null }) })
      : route.fallback(),
  )
  const habit = page.getByRole('checkbox', { name: /Вода/ })
  await habit.click()
  await expect(page.getByText('Не сохранилось: сервер не принял изменение. На экране — то, что на сервере')).toBeVisible()
  await expect(habit).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByText(/ждут? сети/)).toHaveCount(0) // rejected, not queued
  await page.unroute('**/rest/v1/habit_marks*')
  await page.reload()
  await expect(page.getByRole('checkbox', { name: /Вода/ })).toHaveAttribute('aria-checked', 'false')
})
