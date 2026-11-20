import { expect, test } from '@playwright/test'
import { addDaysISO, weekStart } from '../../src/lib/dates'
import { periodMonthOf } from '../../src/lib/rules/periods'
import { NEEDS, berlinDate, cleanupTestUser, live, login, tab, testClient } from './helpers'

// Money, phase 6 — «День денег»: the salary came, what it covers, the week limit; one button writes both.
test.beforeEach(cleanupTestUser)
test.afterAll(cleanupTestUser)

test('День денег: из «Пришло?» — распределить, подтвердить зарплату и лимиты недель', async ({ page }) => {
  test.skip(!live, NEEDS)
  const today = berlinDate()
  const sb = await testClient()
  const { data: accs } = await sb.from('accounts').select('id, source_id')
  const id = (sid: string) => accs!.find((a) => a.source_id === sid)!.id
  const ok = async (p: PromiseLike<{ error: unknown }>) => expect((await p).error).toBeNull()
  await ok(sb.from('transactions').insert({ date: berlinDate(-2), amount_eur: 300, kind: 'opening', title: 'Старт по счетам', account_id: id('acct:revolut-main') }))
  await ok(sb.from('recurring').insert({ title: 'Gehalt e2e', amount_eur: 1000, kind: 'income', grp: 'Доход', freq: 'monthly', anchor_date: today, account_id: id('acct:sparkasse') }))
  await ok(sb.from('transactions').insert({ date: berlinDate(10), amount_eur: 500, kind: 'expense', grp: 'Обязательное', title: 'Аренда e2e', is_planned: true, account_id: id('acct:revolut-main') }))
  await ok(sb.from('envelopes').insert({ name: 'Подарки e2e', type: 'envelope', planned_eur: 100, account_id: id('acct:revolut-main'), pay_month: `${periodMonthOf(today)}-01` }))
  // this week's limits give the shares: 20 : 5
  const week = await sb.from('weeks').upsert({ start_date: weekStart(today) }, { onConflict: 'user_id,start_date' }).select('id').single()
  await ok(sb.from('week_limits').insert({ week_id: week.data!.id, category: 'Продукты', limit_eur: 20 }))
  await ok(sb.from('week_limits').insert({ week_id: week.data!.id, category: 'Кофейни и перекусы', limit_eur: 5 }))
  await sb.auth.signOut()

  await login(page)
  await tab(page, 'Деньги')
  await expect(page.getByRole('region', { name: /Пришло\?/ }).first()).toBeVisible()
  await page.getByRole('link', { name: 'День денег — распределить' }).click()
  await expect(page.getByRole('heading', { name: 'День денег' })).toBeVisible()
  // 1000 + 300 left − Подарки 100 − Аренда 500 = 700 to live on
  await expect(page.getByText(/^700\s€$/)).toBeVisible()
  const weekly = Number((await page.getByLabel('Лимит недели, €').inputValue()).replace(',', '.'))
  expect(weekly).toBeGreaterThan(100)
  await page.screenshot({ path: '/tmp/claude-0/-root-life-hub/71da3f50-fd35-4dcb-8879-c93a76fb3cb0/scratchpad/payday.png', fullPage: true })
  await page.getByRole('button', { name: 'Подтвердить: зарплата и лимиты' }).click()
  await expect(page.getByText(/Gehalt e2e · 1\s000\s€ — пришла\. Лимит недели/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'День денег — распределить' })).toBeHidden()

  const check = await testClient()
  const salary = await check.from('transactions').select('date, confirmed_at').eq('title', 'Gehalt e2e')
  expect(salary.data).toHaveLength(1)
  expect(salary.data![0]!.confirmed_at).not.toBeNull()
  const next = await check.from('weeks').select('id, week_limits(category, limit_eur)').eq('start_date', addDaysISO(weekStart(today), 7)).single()
  const rows = (next.data!.week_limits as { category: string; limit_eur: number }[]).sort((a, b) => a.category.localeCompare(b.category))
  expect(rows.reduce((s, r) => s + Number(r.limit_eur), 0)).toBe(weekly)
  // the categories with a share get the money; the others are set to 0 (the week's limits are replaced as a whole)
  expect(rows.filter((r) => Number(r.limit_eur) > 0).map((r) => r.category)).toEqual(['Кофейни и перекусы', 'Продукты'])
  await check.auth.signOut()
})
