import { expect, test } from '@playwright/test'
import { NEEDS, berlinDate, bodyTab, cleanupTestUser, live, login, tab, testClient } from './helpers'

test.beforeAll(cleanupTestUser)
test.afterAll(cleanupTestUser)

test('приём: «+ Добавить» → строка → карточка → «Завершить приём» — в архиве с периодом', async ({ page }) => {
  test.skip(!live, NEEDS)
  await login(page)
  await tab(page, 'Тело')
  await bodyTab(page, 'Здоровье', 'Приём')
  await page.getByRole('button', { name: 'Добавить приём' }).click()
  const sheet = page.getByRole('dialog', { name: 'Приём' })
  await sheet.getByLabel('Название').fill('Магний e2e')
  await sheet.getByLabel('Доза').fill('200 мг')
  await sheet.getByLabel('С какого числа').fill(berlinDate(-3)) // started earlier — so it can end yesterday
  await sheet.getByRole('button', { name: 'Сохранить' }).click()
  await expect(sheet).toBeHidden()
  const row = page.getByRole('list', { name: 'Сейчас принимаю' }).getByRole('button', { name: /Магний e2e/ })
  await expect(row).toContainText('200 мг · утро · витамин')

  await row.click()
  const card = page.getByRole('dialog', { name: 'Магний e2e' })
  await card.getByLabel('Последний день приёма').fill(berlinDate(-1))
  await card.getByRole('button', { name: 'Завершить приём' }).click()
  await expect(card).toBeHidden()
  await page.getByRole('button', { name: /Архив/ }).click()
  await expect(page.getByRole('button', { name: /Магний e2e · 200 мг/ })).toBeVisible()
})

test('врач — карточка с цепочкой шагов: текущий шаг отмечается, следующий становится текущим', async ({ page }) => {
  test.skip(!live, NEEDS)
  const sb = await testClient()
  const series = await sb.from('item_series').insert({ kind: 'chain', title: 'Врач e2e' }).select('id').single()
  expect(series.error).toBeNull()
  for (const [title, step, due] of [
    ['Записаться e2e', 'записаться', berlinDate(3)],
    ['Визит e2e', 'визит', null],
  ] as const) {
    expect((await sb.from('items').insert({ sphere: 'body', title, step, series_id: series.data!.id, due_date: due, status: 'Не начато' })).error).toBeNull()
  }
  await sb.auth.signOut()

  await login(page)
  await tab(page, 'Тело')
  await bodyTab(page, 'Здоровье', 'Задачи')
  const steps = page.getByRole('list', { name: 'Врач e2e: шаги' })
  await expect(steps).toContainText('Записаться')
  await steps.getByRole('checkbox', { name: 'Записаться e2e: сделано' }).click()
  await expect(steps.getByRole('checkbox', { name: 'Визит e2e: сделано' })).toBeVisible()
})
