import { expect, test } from '@playwright/test'
import { addMonthsISO } from '../../src/lib/dates'
import { NEEDS, berlinDate, cleanupTestUser, live, login, more, tab, testClient } from './helpers'

test.beforeAll(cleanupTestUser)
test.afterAll(cleanupTestUser)

// A recurring rule gives virtual planned operations: they ask in their day, show up in «Месяц», and an answer
// makes a real row bound to the occurrence; «Вернуть» deletes it and the occurrence is in the plan again.
test('регулярный платёж: вопрос в свой день, ответ — строка повторения, «Вернуть» — снова в плане', async ({ page }) => {
  test.skip(!live, NEEDS)
  const today = berlinDate()
  const next = addMonthsISO(today, 1)
  const sb = await testClient()
  const rule = await sb.from('recurring').insert({ title: 'Abo e2e', amount_eur: 40, kind: 'expense', grp: 'Обязательное', freq: 'monthly', anchor_date: today }).select('id').single()
  expect(rule.error).toBeNull()
  const rows = async () =>
    (await sb.from('transactions').select('occurrence_date, date, confirmed_at, cancelled_at, planned_amount_eur, is_planned').eq('recurring_id', rule.data!.id).order('occurrence_date')).data ?? []

  await login(page)
  const card = page.getByRole('region', { name: 'Списалось? Abo e2e' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Подтвердить' }).click()
  await expect(page.getByText('Abo e2e · 40 € — списано')).toBeVisible()
  await expect(card).toBeHidden()
  await expect.poll(async () => (await rows()).map((r) => [r.occurrence_date, Number(r.planned_amount_eur), r.confirmed_at !== null])).toEqual([[today, 40, true]])

  // «Вернуть»: the answered row goes, the occurrence asks again
  await page.getByRole('button', { name: 'Вернуть' }).click()
  await expect(card).toBeVisible()
  await expect.poll(async () => (await rows()).length).toBe(0)
  await card.getByRole('button', { name: 'Подтвердить' }).click()
  await expect(card).toBeHidden()
  await expect.poll(async () => (await rows()).length).toBe(1)

  // «Месяц»: next month's occurrence is in «Дальше по плану» and in the month's operations; out of the plan from the sheet
  await tab(page, 'Деньги')
  await more(page, 'Месяц')
  await expect(page.getByText('Abo e2e').first()).toBeVisible()
  await page.getByRole('button', { name: 'Вперёд' }).click()
  await page.getByRole('button', { name: /Abo e2e/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Операция' })
  await expect(sheet.getByText('Повторение регулярного платежа')).toBeVisible()
  await sheet.getByRole('button', { name: 'Убрать из плана' }).click()
  await expect.poll(async () => (await rows()).map((r) => [r.occurrence_date, r.cancelled_at !== null])).toEqual([
    [today, false],
    [next, true],
  ])
  await expect(page.getByRole('button', { name: /Abo e2e/ })).toBeHidden()
  await sb.auth.signOut()
})
