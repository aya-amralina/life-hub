import { expect, test } from '@playwright/test'
import { NEEDS, berlinDate, berlinMonday, cleanupTestUser, live, login, tab, testClient } from './helpers'

test.beforeEach(cleanupTestUser)
test.afterAll(cleanupTestUser)

test('«Списалось?»: плановый расход в свой день → подтвердить → факт', async ({ page }) => {
  test.skip(!live, NEEDS)
  const sb = await testClient()
  const ins = await sb.from('transactions').insert({ date: berlinDate(), amount_eur: 650, kind: 'expense', grp: 'Обязательное', title: 'Miete e2e', is_planned: true })
  expect(ins.error).toBeNull()
  await sb.auth.signOut()

  await login(page)
  const card = page.getByRole('region', { name: 'Списалось? Miete e2e' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Подтвердить' }).click()
  await expect(page.getByText('Miete e2e · 650 € — списано')).toBeVisible()
  await expect(card).toBeHidden()

  await tab(page, 'Деньги')
  await page.getByRole('tab', { name: 'Месяц' }).click()
  await expect(page.getByText(/^факт/).first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Списалось? Miete e2e' })).toBeHidden()
})

test('«Состоялось?» после прошедшего дня → «Да» убирает вопрос', async ({ page }) => {
  test.skip(!live, NEEDS)
  const sb = await testClient()
  const ins = await sb.from('items').insert({ sphere: 'personal', title: 'Встреча e2e', happens_on: berlinDate(-1), happens_time: '15:00' })
  expect(ins.error).toBeNull()
  await sb.auth.signOut()

  await login(page)
  const card = page.getByRole('region', { name: 'Состоялось? Встреча e2e' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Да', exact: true }).click()
  await expect(page.getByText('Встреча e2e — состоялось')).toBeVisible()
  await expect(card).toBeHidden()
})

test('карточка пункта: дедлайн → «С даты» убирает пункт из «Горит» в «Скоро»', async ({ page }) => {
  test.skip(!live, NEEDS)
  const title = `e2e срок ${Date.now()}`
  await login(page)
  await page.getByRole('button', { name: 'Добавить' }).click()
  const add = page.getByRole('dialog', { name: 'Добавить' })
  await add.getByRole('tab', { name: 'Пункт' }).click()
  await add.getByLabel('Что сделать').fill(title)
  await add.getByRole('button', { name: 'Сохранить' }).click()
  await expect(add).toBeHidden()
  await expect(page.getByRole('checkbox', { name: title })).toBeVisible()

  await page.getByText(title, { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Пункт' })).toBeVisible()
  await page.getByRole('radio', { name: /С даты/ }).click()
  // start in a week is after today's deadline — the card says so and waits
  await expect(page.getByText('Срок сдачи раньше старта — поправь одну из дат или убери срок.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
  await page.getByRole('button', { name: 'Убрать' }).click()
  await expect(page.getByText(/пункт ждёт в «Скоро» и не мешает. Срок сдачи можно не ставить./)).toBeVisible()
  await page.getByRole('button', { name: 'Сохранить' }).click()

  await expect(page.getByRole('heading', { name: /\d+ [а-я]+/ })).toBeVisible() // back on «Сегодня»
  await expect(page.getByRole('checkbox', { name: title })).toBeHidden()
})

test('режим «минимум»: видны только привычки набора, текст их называет', async ({ page }) => {
  test.skip(!live, NEEDS)
  await login(page)
  await tab(page, 'Тело')
  await page.getByRole('switch', { name: 'Режим минимум' }).click()
  await expect(page.getByText('Сегодня — минимум')).toBeVisible()
  await tab(page, 'Сегодня')
  await expect(page.getByText('Минимум: вода и 10 минут на улице. Остальное подождёт.')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /Утренний старт/ })).toBeHidden()
  await page.getByRole('checkbox', { name: /Вода/ }).click()
  await page.getByRole('checkbox', { name: /10 мин на улице/ }).click()
  await expect(page.getByText('минимум · засчитан')).toBeVisible()
})

test('автоперенос: гибкий пункт прошлой недели переезжает в текущую, «перенесено ×1»', async ({ page }) => {
  test.skip(!live, NEEDS)
  const sb = await testClient()
  const week = await sb.from('weeks').insert({ start_date: berlinMonday(-1), study_week: 'Н90' }).select('id').single()
  expect(week.error).toBeNull()
  const ins = await sb.from('items').insert({ sphere: 'study', title: 'Übungsblatt e2e nacharbeiten', area: 'Analysis II', week_id: week.data!.id, hours_est: 2, status: 'открыто' })
  expect(ins.error).toBeNull()
  await sb.auth.signOut()

  await login(page)
  await tab(page, 'Учёба')
  await expect(page.getByRole('checkbox', { name: 'Übungsblatt e2e nacharbeiten' })).toBeVisible()
  await expect(page.getByText('перенесено ×1')).toBeVisible()
  // a second open changes nothing (idempotent)
  await page.reload()
  await expect(page.getByText('перенесено ×1')).toBeVisible()
})
