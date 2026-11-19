import { expect, test } from '@playwright/test'
import { addDaysISO, addMonthsISO, formatDayMonth } from '../../src/lib/dates'
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

// «Уже есть в плане»: a new rule offers the similar operations; nothing is linked before «Привязать N»
test('«Уже есть в плане»: похожие операции привязываются только по «Привязать»', async ({ page }) => {
  test.skip(!live, NEEDS)
  const today = berlinDate()
  const next = addMonthsISO(today, 1)
  const sb = await testClient()
  const fact = await sb.from('transactions').insert({ date: today, amount_eur: 650, kind: 'expense', grp: 'Обязательное', title: 'Miete e2e', is_planned: true, confirmed_at: new Date().toISOString() }).select('id').single()
  const plan = await sb.from('transactions').insert({ date: addDaysISO(next, 2), amount_eur: 650, kind: 'expense', grp: 'Обязательное', title: 'Miete e2e', is_planned: true }).select('id').single()
  expect(fact.error ?? plan.error).toBeNull()
  const linked = async () =>
    Object.fromEntries(((await sb.from('transactions').select('id, occurrence_date').in('id', [fact.data!.id, plan.data!.id])).data ?? []).map((r) => [r.id, r.occurrence_date]))

  await login(page)
  await tab(page, 'Деньги')
  await more(page, 'Регулярные')
  await plus(page)
  const sheet = page.getByRole('dialog', { name: 'Новый регулярный платёж' })
  await sheet.getByLabel('Название').fill('Miete e2e')
  await sheet.getByLabel('Сумма').fill('650')
  await sheet.getByRole('button', { name: 'Сохранить' }).click()

  const link = page.getByRole('dialog', { name: 'Уже есть в плане' })
  await expect(link.getByRole('checkbox')).toHaveCount(2)
  await expect(link.getByText(`повторение ${formatDayMonth(next)}`)).toBeVisible() // the planned row is two days off its occurrence
  expect(await linked()).toEqual({ [fact.data!.id]: null, [plan.data!.id]: null }) // nothing written yet
  await link.getByRole('checkbox', { name: `${formatDayMonth(addDaysISO(next, 2))} Miete e2e` }).click()
  await link.getByRole('button', { name: 'Привязать 1' }).click()
  await expect(link).toBeHidden()
  await expect.poll(linked).toEqual({ [fact.data!.id]: today, [plan.data!.id]: null })

  // the rest — later, from the rule's sheet
  await page.getByRole('button', { name: /Miete e2e/ }).click()
  await page.getByRole('dialog', { name: 'Регулярный платёж' }).getByRole('button', { name: 'Уже есть в плане · 1' }).click()
  await link.getByRole('button', { name: 'Привязать 1' }).click()
  await expect.poll(linked).toEqual({ [fact.data!.id]: today, [plan.data!.id]: next })
  await sb.auth.signOut()
})

// «Сделать регулярным»: the rule from a planned operation; the operation is its first occurrence at once,
// the similar ones go through «Уже есть в плане»
test('«Сделать регулярным»: правило из плановой операции, она — первое повторение', async ({ page }) => {
  test.skip(!live, NEEDS)
  const today = berlinDate()
  const first = addDaysISO(today, 3)
  const sb = await testClient()
  const main = (await sb.from('accounts').select('id').eq('source_id', 'acct:revolut-main').single()).data!.id
  const row = (date: string) => ({ date, amount_eur: 13.99, kind: 'expense', grp: 'Жизнь', account_id: main, title: 'Netflix e2e', is_planned: true })
  const a = await sb.from('transactions').insert(row(first)).select('id').single()
  const b = await sb.from('transactions').insert(row(addDaysISO(addMonthsISO(today, 1), 3))).select('id').single()
  expect(a.error ?? b.error).toBeNull()
  const linked = async () =>
    Object.fromEntries(((await sb.from('transactions').select('id, occurrence_date').in('id', [a.data!.id, b.data!.id])).data ?? []).map((r) => [r.id, r.occurrence_date]))

  await login(page)
  await tab(page, 'Деньги')
  await more(page, 'Месяц')
  if (first.slice(0, 7) !== today.slice(0, 7)) await page.getByRole('button', { name: 'Вперёд' }).click()
  await page.getByRole('button', { name: /Netflix e2e/ }).click()
  await page.getByRole('dialog', { name: 'Операция' }).getByRole('button', { name: 'Сделать регулярным' }).click()
  const sheet = page.getByRole('dialog', { name: 'Новый регулярный платёж' })
  await expect(sheet.getByLabel('Название')).toHaveValue('Netflix e2e')
  await expect(sheet.getByLabel('Первая дата')).toHaveValue(first)
  // the rule takes the operation's account
  await expect(sheet.getByRole('button', { name: 'Revolut · Основной' })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'Сохранить' }).click()

  const link = page.getByRole('dialog', { name: 'Уже есть в плане' })
  await expect(link.getByRole('checkbox')).toHaveCount(1) // the operation itself is already the first occurrence
  await expect.poll(linked).toEqual({ [a.data!.id]: first, [b.data!.id]: null })
  await link.getByRole('button', { name: 'Привязать 1' }).click()
  await expect.poll(linked).toEqual({ [a.data!.id]: first, [b.data!.id]: addMonthsISO(first, 1) })
  const rules = (await sb.from('recurring').select('title, amount_eur, grp, anchor_date, accounts!recurring_account_id_fkey(source_id)').eq('title', 'Netflix e2e')).data ?? []
  expect(rules.map((r) => [Number(r.amount_eur), (r.accounts as unknown as { source_id: string } | null)?.source_id, r.grp, r.anchor_date])).toEqual([[13.99, 'acct:revolut-main', 'Жизнь', first]])
  await sb.auth.signOut()
})
