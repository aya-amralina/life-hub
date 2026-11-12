import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { NEEDS, cleanupTestUser, live, login, tab, testClient } from './helpers'

test.beforeEach(cleanupTestUser)
test.afterAll(cleanupTestUser)

test('экспорт JSON → удалённый пункт возвращается восстановлением; CSV скачивается', async ({ page }) => {
  test.skip(!live, NEEDS)
  const sb = await testClient()
  const ins = await sb.from('items').insert({ sphere: 'personal', title: 'Backup e2e' }).select('id').single()
  expect(ins.error).toBeNull()

  await login(page)
  await page.getByRole('link', { name: 'Настройки' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Экспорт JSON' }).click()])
  const file = await download.path()
  const backup = JSON.parse(readFileSync(file, 'utf8'))
  expect(backup.format).toBe('life-hub-backup')
  expect(backup.tables.items.some((i: { title: string }) => i.title === 'Backup e2e')).toBe(true)

  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^CSV:/ }).click()])
  expect(csv.suggestedFilename()).toMatch(/^lifehub-transactions-.*\.csv$/)

  expect((await sb.from('items').delete().eq('id', ins.data!.id)).error).toBeNull()
  await page.getByLabel('Файл экспорта').setInputFiles(file)
  const sheet = page.getByRole('dialog', { name: 'Восстановление' })
  await expect(sheet.getByRole('row', { name: /Пункты/ })).toBeVisible()
  await sheet.getByRole('button', { name: 'Восстановить' }).click()
  await expect(page.getByText(/Восстановлено \d+ строк/)).toBeVisible()
  const back = await sb.from('items').select('id').eq('id', ins.data!.id)
  expect(back.data).toHaveLength(1)
  await sb.auth.signOut()
})

test('воскресный обзор: пять шагов, «Пропустить», завершение сохраняется', async ({ page }) => {
  test.skip(!live, NEEDS)
  await login(page)
  await page.goto('/review')
  await expect(page.getByRole('heading', { name: 'Воскресный обзор' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Разделы' })).toBeHidden() // full-screen, no tab bar
  await expect(page.getByRole('heading', { name: 'Деньги', level: 2 })).toBeVisible()
  await page.getByLabel('Импульсные траты — были?').fill('кофе по дороге')
  await page.getByLabel('Остаток Revolut').fill('742,10')
  await page.getByRole('button', { name: /Дальше: Тело/ }).click()
  await expect(page.getByRole('heading', { name: 'Тело', level: 2 })).toBeVisible()
  await page.getByRole('button', { name: 'Пропустить шаг' }).click()
  await expect(page.getByRole('heading', { name: 'Учёба', level: 2 })).toBeVisible()
  await expect(page.getByText('Ничего не ждёт', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: /Дальше: Работа/ }).click()
  await page.getByRole('button', { name: /Дальше: Вперёд/ }).click()
  await expect(page.getByRole('heading', { name: 'Неделя вперёд' })).toBeVisible()
  // no export from this device yet → the last step reminds to download a backup
  const reminder = page.getByRole('region', { name: 'Бэкап' })
  await expect(reminder.getByText('Скачать бэкап (JSON)')).toBeVisible()
  const [file] = await Promise.all([page.waitForEvent('download'), reminder.getByRole('button', { name: 'Скачать бэкап' }).click()])
  expect(file.suggestedFilename()).toMatch(/^lifehub-export-.*\.json$/)
  await expect(reminder).toBeHidden()
  await page.getByLabel('Мысль на неделю').fill('Спокойно и по одному')
  await page.getByRole('button', { name: 'Завершить обзор' }).click()
  await expect(page.getByText('Обзор недели готов. Хорошей недели!')).toBeVisible()

  const sb = await testClient()
  const { data } = await sb.from('reviews').select('completed_at, impulse_note, week_thought, answers').single()
  expect(data?.completed_at).toBeTruthy()
  expect(data?.impulse_note).toBe('кофе по дороге')
  expect(data?.week_thought).toBe('Спокойно и по одному')
  expect((data?.answers as { skipped?: string[] }).skipped).toEqual(['body'])
  const bal = await sb.from('actual_balances').select('account, amount_eur, origin')
  expect(bal.data).toEqual([{ account: 'Revolut', amount_eur: 742.1, origin: 'review' }]) // the review writes to «Остатки»
  await sb.auth.signOut()
})

test('хотелка: ждёт 48 часов, потом «Всё ещё нужно?» на «Сегодня»', async ({ page }) => {
  test.skip(!live, NEEDS)
  const sb = await testClient()
  const old = new Date(Date.now() - 50 * 3_600_000).toISOString()
  expect((await sb.from('wishlist').insert({ title: 'Kopfhörer e2e', price_eur: 79, added_at: old })).error).toBeNull()
  await sb.auth.signOut()

  await login(page)
  const card = page.getByRole('region', { name: 'Всё ещё нужно? Kopfhörer e2e' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Не покупать' }).click()
  await expect(card).toBeHidden()

  await tab(page, 'Деньги')
  await page.getByRole('tab', { name: 'Хотелки' }).click()
  await page.getByLabel('Что хочется').fill('Buch e2e')
  await page.getByLabel('Цена').fill('20')
  await page.getByRole('button', { name: 'Отложить на 48 часов' }).click()
  await expect(page.getByText('ещё 48 часов')).toBeVisible()
  await expect(page.getByText('не потрачено 79 €')).toBeVisible()
})

test('без сети: отметка встаёт в очередь и уходит, когда сеть вернулась', async ({ page, context }) => {
  test.skip(!live, NEEDS)
  await login(page)
  const habit = page.getByRole('checkbox', { name: /Вода/ })
  await expect(habit).toHaveAttribute('aria-checked', 'false')

  await context.setOffline(true)
  await habit.click()
  await expect(habit).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('Офлайн · 1 изменение ждёт сети')).toBeVisible()

  await context.setOffline(false)
  await expect(page.getByText(/ждёт сети|Отправляю/)).toBeHidden({ timeout: 15_000 })
  await page.reload()
  await expect(page.getByRole('checkbox', { name: /Вода/ })).toHaveAttribute('aria-checked', 'true')
})
