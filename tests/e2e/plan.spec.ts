import { expect, test, type Page } from '@playwright/test'
import { addMonthsISO, formatDayMonth } from '../../src/lib/dates'
import { periodMonthOf, periodName } from '../../src/lib/rules/periods'
import { NEEDS, berlinDate, cleanupTestUser, live, login, more, plus, tab, testClient } from './helpers'

// Money, phase 3 — «План»: periods from the day of money, «на жизнь», «не сходится», one form, «Когда-нибудь», «Готово».
test.beforeEach(cleanupTestUser)
test.afterAll(cleanupTestUser)

const payday = () => berlinDate(7)
const nextMonth = () => periodMonthOf(payday())
const afterMonth = () => addMonthsISO(`${nextMonth()}-01`, 1).slice(0, 7)
const card = (page: Page, title: RegExp) => page.locator('section').filter({ has: page.getByRole('heading', { name: title }) })

async function seed() {
  const sb = await testClient()
  const { data: accs } = await sb.from('accounts').select('id, source_id')
  const id = (sid: string) => accs!.find((a) => a.source_id === sid)!.id
  const ok = async (p: PromiseLike<{ error: unknown }>) => expect((await p).error).toBeNull()
  await ok(sb.from('transactions').insert({ date: berlinDate(-2), amount_eur: 300, kind: 'opening', title: 'Старт по счетам', account_id: id('acct:revolut-main') }))
  // the salary: a monthly income rule into «Баланс» — its occurrences are the days of money
  await ok(sb.from('recurring').insert({ title: 'Gehalt e2e', amount_eur: 1000, kind: 'income', grp: 'Доход', freq: 'monthly', anchor_date: payday(), account_id: id('acct:sparkasse') }))
  await ok(sb.from('transactions').insert({ date: berlinDate(20), amount_eur: 1500, kind: 'expense', grp: 'Обязательное', title: 'Аренда e2e', is_planned: true, account_id: id('acct:revolut-main') }))
  await ok(sb.from('envelopes').insert({ name: 'Берлин e2e', type: 'envelope', planned_eur: 20, account_id: id('acct:revolut-main') }))
  await ok(sb.from('envelopes').insert({ name: 'Подарки e2e', type: 'envelope', planned_eur: 100, account_id: id('acct:revolut-main'), pay_month: `${nextMonth()}-01` }))
  await ok(sb.from('wishlist').insert({ title: 'Куртка e2e', price_eur: 80, decision: 'buy', decided_at: new Date().toISOString() }))
  await sb.auth.signOut()
}

test('План: периоды от дня денег, «не сходится», перенос, «Когда-нибудь» и «Готово»', async ({ page }) => {
  test.skip(!live, NEEDS)
  await seed()
  await login(page)
  await tab(page, 'Деньги')
  await more(page, 'План')

  // today's period runs to the day of money: «Берлин» is set aside, «Подарки» belong to the next one
  const now = card(page, new RegExp(`до ${formatDayMonth(payday()).replace('.', '\\.')}`))
  await expect(now.getByRole('button', { name: /Берлин e2e/ })).toBeVisible()
  await expect(now.getByText('сходится', { exact: true })).toBeVisible()
  await expect(now.getByText(/^280\s€$/)).toBeVisible() // 300 − 20

  // the next period: salary 1000 − rent 1500 − gifts 100 → does not add up by 600
  const next = card(page, new RegExp(`^${periodName(nextMonth(), berlinDate())} · с`))
  await expect(next.getByText(/^1\s000\s€$/)).toBeVisible()
  await expect(next.getByText(/не сходится на 600\s€/).first()).toBeVisible()

  // move «Подарки» a month on — the next period is short by 500 now
  await next.getByRole('button', { name: /Подарки e2e/ }).click()
  const form = page.getByRole('dialog', { name: 'Подарки e2e' })
  await form.getByRole('button', { name: periodName(afterMonth(), berlinDate()), exact: true }).click()
  await form.getByRole('button', { name: 'Сохранить' }).click()
  await expect(next.getByText(/не сходится на 500\s€/).first()).toBeVisible()
  await expect(card(page, new RegExp(`^${periodName(afterMonth(), berlinDate())} · с`)).getByRole('button', { name: /Подарки e2e/ })).toBeVisible()

  // «Когда-нибудь» → a period: the wish becomes a spending of that period, one item
  await page.getByRole('button', { name: /Куртка e2e/ }).click()
  const wish = page.getByRole('dialog', { name: 'Куртка e2e' })
  await wish.getByRole('button', { name: periodName(afterMonth(), berlinDate()), exact: true }).click()
  await wish.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByRole('button', { name: /Куртка e2e/ })).toHaveCount(1)
  await expect(card(page, new RegExp(`^${periodName(afterMonth(), berlinDate())} · с`)).getByRole('button', { name: /Куртка e2e/ })).toBeVisible()

  // close «Берлин»: what is left goes back into «свободно» at once
  await now.getByRole('button', { name: /Берлин e2e/ }).click()
  await page.getByRole('dialog', { name: 'Берлин e2e' }).getByRole('button', { name: 'Закрыть — готово' }).click()
  await expect(page.getByText(/вернулись в «свободно»/)).toBeVisible()
  await expect(now.getByText(/^300\s€$/)).toBeVisible()
  await page.getByRole('button', { name: /^Готово/ }).click()
  await expect(page.getByRole('button', { name: /^Берлин e2e/ })).toBeVisible()

  // «+» on «План» — a new spending into the plan
  await plus(page)
  const add = page.getByRole('dialog', { name: 'Новая трата в план' })
  await add.getByLabel('Название').fill('Ёлка e2e')
  await add.getByLabel('Сумма').fill('40')
  await add.getByRole('button', { name: 'Когда-нибудь', exact: true }).click()
  await add.getByRole('button', { name: 'Сохранить' }).click()
  await expect(card(page, /^Когда-нибудь/).getByRole('button', { name: /Ёлка e2e/ })).toBeVisible()
})
