import { expect, test } from '@playwright/test'
import { NEEDS, berlinDate, berlinMonday, cleanupTestUser, live, login, tab, testClient } from './helpers'

test.beforeEach(cleanupTestUser)
test.afterAll(cleanupTestUser)

test('календарь: пункт на день в месяце и в листе дня, «+ пункт на этот день», фильтр из сферы', async ({ page }) => {
  test.skip(!live, NEEDS)
  const sb = await testClient()
  const ins = await sb.from('items').insert({ sphere: 'work', title: 'Kalender e2e', happens_on: berlinDate(2), happens_time: '15:00', status: 'Offen' })
  expect(ins.error).toBeNull()
  await sb.auth.signOut()

  await login(page)
  await page.getByRole('link', { name: 'Календарь' }).click()
  await expect(page.getByRole('heading', { name: 'Календарь' })).toBeVisible()
  await page.getByRole('button', { name: /1 в плане/ }).first().click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Kalender e2e')).toBeVisible()
  await expect(sheet.getByText('15:00')).toBeVisible()
  await sheet.getByRole('button', { name: 'Пункт на этот день' }).click()
  const add = page.getByRole('dialog', { name: 'Добавить' })
  await add.getByLabel('Что сделать').fill('Termin e2e')
  await add.getByRole('button', { name: 'Сохранить' }).click()
  await expect(add).toBeHidden()
  await expect(page.getByRole('button', { name: /2 в плане/ })).toBeVisible()

  // from a sphere the calendar is filtered by it
  await tab(page, 'Учёба')
  await page.getByRole('link', { name: 'Календарь' }).click()
  await expect(page.getByRole('button', { name: 'Учёба', pressed: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /в плане/ })).toHaveCount(0)
})

test('графики: Тело → Графики и тепловая карта Учёбы', async ({ page }) => {
  test.skip(!live, NEEDS)
  const sb = await testClient()
  const week = await sb.from('weeks').insert({ start_date: berlinMonday(0), study_week: 'Н04', capacity_base_h: 27, capacity_max_h: 36 }).select('id').single()
  expect(week.error).toBeNull()
  expect((await sb.from('items').insert({ sphere: 'study', title: 'Blatt e2e', area: 'GLET', week_id: week.data!.id, hours_est: 30, status: 'открыто' })).error).toBeNull()
  for (let d = 0; d < 4; d++) expect((await sb.from('daily_logs').insert({ date: berlinDate(-d), mood: 6 + d, energy: 5, sleep_h: 7, water: true })).error).toBeNull()
  await sb.auth.signOut()

  await login(page)
  await tab(page, 'Тело')
  await page.getByRole('tab', { name: 'Графики' }).click()
  await expect(page.getByRole('figure', { name: 'Настроение, энергия и сон' })).toBeVisible()
  await expect(page.getByText('Мало данных', { exact: false }).first()).toBeVisible() // reps/activity are empty
  await page.getByRole('tab', { name: 'Неделя' }).click()
  await expect(page.getByText('средние за неделю')).toBeVisible()
  await expect(page.getByRole('grid', { name: 'Календарь привычек' })).toBeVisible()

  await tab(page, 'Учёба')
  await page.getByRole('tab', { name: 'Предметы' }).click()
  const heat = page.getByRole('grid', { name: 'Загрузка по неделям' })
  await heat.getByRole('button', { name: /Н04/ }).click()
  await expect(page.getByText('Н04 · 30 ч из 27 · нужен Do/Sa ½ · сейчас')).toBeVisible()
})
