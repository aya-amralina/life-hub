import { expect, test } from '@playwright/test'
import { addDaysISO, addMonthsISO } from '../../src/lib/dates'
import { NEEDS, berlinDate, cleanupTestUser, live, login, more, plus, tab, testClient } from './helpers'

test.beforeEach(cleanupTestUser) // each test starts with no rules
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

// «Регулярные»: a new rule from «+»; after an answer a new rhythm closes the old rule and starts after the answer
test('«Регулярные»: правило через «+», смена расписания после ответа — новое правило с следующего периода', async ({ page }) => {
  test.skip(!live, NEEDS)
  const today = berlinDate()
  const next = addMonthsISO(today, 1)
  const sb = await testClient()
  const rules = async () => (await sb.from('recurring').select('id, title, freq, anchor_date, end_date').eq('title', 'Gehalt e2e').order('anchor_date')).data ?? []

  await login(page)
  await tab(page, 'Деньги')
  await more(page, 'Регулярные')
  await expect(page.getByText('Регулярных пока нет')).toBeVisible()
  await plus(page)
  const sheet = page.getByRole('dialog', { name: 'Новый регулярный платёж' })
  await sheet.getByRole('tab', { name: 'Доход' }).click()
  await sheet.getByLabel('Название').fill('Gehalt e2e')
  await sheet.getByLabel('Сумма').fill('2000')
  await sheet.getByRole('button', { name: 'Сохранить' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('button', { name: /Gehalt e2e/ })).toBeVisible()
  await expect.poll(async () => (await rules()).map((r) => [r.freq, r.anchor_date, r.end_date])).toEqual([['monthly', today, null]])

  // today's occurrence answered (as «Пришло?» would) → a new rhythm starts in the next period
  const ruleId = (await rules())[0]!.id
  const answer = await sb.from('transactions').insert({ date: today, amount_eur: 2000, kind: 'income', grp: 'Доход', title: 'Gehalt e2e', is_planned: true, confirmed_at: new Date().toISOString(), recurring_id: ruleId, occurrence_date: today })
  expect(answer.error).toBeNull()
  await page.reload()
  await page.getByRole('button', { name: /Gehalt e2e/ }).click()
  const edit = page.getByRole('dialog', { name: 'Регулярный платёж' })
  await expect(edit.getByRole('button', { name: 'Удалить' })).toBeHidden() // answered: ended by a last date, not deleted
  await edit.getByRole('tab', { name: 'Неделя' }).click()
  await expect(edit.getByLabel('Первая дата')).toHaveValue(next)
  await expect(edit.getByText(/остаются при старом расписании/)).toBeVisible()
  await edit.getByRole('button', { name: 'Сохранить' }).click()
  await expect(edit).toBeHidden()
  await expect
    .poll(async () => (await rules()).map((r) => [r.freq, r.anchor_date, r.end_date]))
    .toEqual([
      ['monthly', today, addDaysISO(next, -1)],
      ['weekly', next, null],
    ])

  // «Ещё» on «Деньги» says how many and when next
  await tab(page, 'Деньги')
  await expect(page.getByRole('navigation', { name: 'Ещё' }).getByRole('link', { name: /^Регулярные.*2 · след\./ })).toBeVisible()
  await sb.auth.signOut()
})
