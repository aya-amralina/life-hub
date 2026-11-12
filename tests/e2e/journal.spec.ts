import { expect, test } from '@playwright/test'
import { NEEDS, berlinDate, cleanupTestUser, live, login, tab, testClient } from './helpers'

test.beforeEach(cleanupTestUser)
test.afterAll(cleanupTestUser)

test('заметка дня: «Сохранить» только после правки, черновик не теряется, журнал собирает записи', async ({ page }) => {
  test.skip(!live, NEEDS)
  const sb = await testClient()
  expect((await sb.from('daily_logs').insert({ date: berlinDate(-2), note: 'Старая запись про сон', mood: 6, sleep_h: 7 })).error).toBeNull()
  await sb.auth.signOut()

  await login(page)
  await tab(page, 'Тело')
  const note = page.getByRole('textbox', { name: 'Заметка дня' })
  await expect(note).toBeVisible()
  await expect(page.getByRole('button', { name: 'Сохранить' })).toBeHidden()

  // a draft survives a reload before it is saved
  await note.fill('Тревожка с утра, но справилась')
  await expect(page.getByRole('button', { name: 'Сохранить' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Заметка дня' })).toHaveValue('Тревожка с утра, но справилась')
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText('Сохранено в журнал')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Сохранить' })).toBeHidden()

  // the journal: newest first, the old entry with its quiet context line
  await page.getByRole('link', { name: /Заметка дня/ }).click()
  await expect(page.getByRole('heading', { name: 'Журнал' })).toBeVisible()
  const entries = page.getByRole('article')
  await expect(entries).toHaveCount(2)
  await expect(entries.first()).toContainText('Тревожка с утра')
  await expect(entries.nth(1)).toContainText('настроение 6 · сон 7 ч')
  await expect(page.getByText(/Сегодня ещё без записи/)).toBeHidden()

  // edit a past entry in place
  await entries.nth(1).getByRole('button', { name: /Изменить запись/ }).click()
  await entries.nth(1).getByRole('textbox', { name: 'Заметка дня' }).fill('Старая запись: спала плохо')
  await entries.nth(1).getByRole('button', { name: 'Сохранить' }).click()
  await expect(entries.nth(1)).toContainText('спала плохо')

  const check = await testClient()
  const { data } = await check.from('daily_logs').select('date, note').order('date')
  expect(data).toEqual([
    { date: berlinDate(-2), note: 'Старая запись: спала плохо' },
    { date: berlinDate(), note: 'Тревожка с утра, но справилась' },
  ])
  await check.auth.signOut()
})
