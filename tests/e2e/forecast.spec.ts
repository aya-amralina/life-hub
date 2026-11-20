import { expect, test } from '@playwright/test'
import { addDaysISO, formatDayMonth, weekStart } from '../../src/lib/dates'
import { NEEDS, berlinAt, berlinDate, cleanupTestUser, live, login, moneyTab, more, tab, testClient } from './helpers'

// Stage 2 — the forecast: «Свободно до …», the scenarios of «Месяц», goals, the pace of the week. Numbers and dates only.
test.beforeEach(cleanupTestUser)
test.afterAll(cleanupTestUser)

async function seed() {
  const sb = await testClient()
  const { data: accs } = await sb.from('accounts').select('id, source_id')
  const id = (sid: string) => accs!.find((a) => a.source_id === sid)!.id
  const ins = async (row: Record<string, unknown>) => expect((await sb.from('transactions').insert(row as never)).error).toBeNull()
  const monday = weekStart(berlinDate())
  // four full weeks of «Жизнь» before this one (the pot): 50 · 60 · 70 · 80 → median 65
  await ins({ date: addDaysISO(monday, -40), amount_eur: 1000, kind: 'opening', title: 'Старт' })
  for (const [i, sum] of [50, 60, 70, 80].entries()) await ins({ date: addDaysISO(monday, -7 * (i + 1)), amount_eur: sum, kind: 'expense', grp: 'Жизнь', entry_kind: 'week_total', title: 'Неделя (факт)' })
  // the start by accounts: «Баланс» 300 on the main one, «Подушка» 400
  await ins({ date: berlinDate(-2), amount_eur: 300, kind: 'opening', title: 'Старт по счетам', account_id: id('acct:revolut-main') })
  await ins({ date: berlinDate(-2), amount_eur: 400, kind: 'opening', title: 'Старт по счетам', account_id: id('acct:revolut-cushion') })
  await ins({ date: berlinDate(9), amount_eur: 1000, kind: 'income', grp: 'Доход', title: 'Gehalt e2e', is_planned: true, account_id: id('acct:sparkasse') })
  // an envelope on Основной: 100 set aside on «Баланс»; a goal alone on «Подушка»
  expect((await sb.from('envelopes').insert({ name: 'Подарки e2e', type: 'envelope', planned_eur: 100, account_id: id('acct:revolut-main') })).error).toBeNull()
  expect((await sb.from('envelopes').insert({ name: 'Подушка e2e', type: 'goal', goal_eur: 1000, goal_date: berlinDate(60), account_id: id('acct:revolut-cushion') })).error).toBeNull()
  await sb.auth.signOut()
}

test('«Свободно до …»: на «Сегодня» строкой, в «Деньгах» — с цифрами', async ({ page }) => {
  test.skip(!live, NEEDS)
  await seed()
  await login(page)
  // 300 on «Баланс» − 100 in the envelope; no limits — no «Жизнь» by plan; the salary goes to Sparkasse
  const row = new RegExp(`^Свободно до ${formatDayMonth(berlinDate(9)).replace('.', '\\.')} · 200\\s€`)
  await expect(page.getByRole('link', { name: row })).toBeVisible()
  // «Сейчас» (phase 4): the main number, and how it is counted
  await tab(page, 'Деньги')
  const hero = page.getByRole('region', { name: 'Свободно до дня денег' })
  await expect(hero.getByText(`Свободно до ${formatDayMonth(berlinDate(9))}`)).toBeVisible()
  await expect(hero.getByText(/^200\s€$/)).toBeVisible()
  const how = hero.getByRole('button', { name: 'как посчитано' })
  await how.click()
  await expect(how).toHaveAttribute('aria-expanded', 'true')
  await expect(hero.getByText('отложено на «Балансе»')).toBeVisible()
})

test('Месяц: три сценария на горизонте, темп «Жизни» и самая низкая точка; цель — сколько в месяц, темпа пока нет', async ({ page }) => {
  test.skip(!live, NEEDS)
  await seed()
  await login(page)
  await tab(page, 'Деньги')
  await more(page, 'Месяц')
  for (const name of [/^по плану/, /^по темпу/, /^осторожно/]) await expect(page.getByRole('row', { name })).toBeVisible()
  await expect(page.getByRole('row', { name: /^по темпу/ })).toContainText(/65\s€ в неделю/)
  await expect(page.getByRole('row', { name: /^по плану/ })).toContainText(/1\s300\s€/) // 300 + 1000, no «Жизнь» by plan
  await expect(page.getByText('коридор сценариев')).toBeVisible()

  await page.getByRole('link', { name: 'Назад: Деньги' }).click()
  await moneyTab(page, 'Счета')
  await expect(page.getByText(/нужно ≈ \d+\s€ в месяц до/)).toBeVisible()
  await expect(page.getByText('темпа пока нет')).toBeVisible()
})

test('темп недели: со среды, линейно по прошедшим дням', async ({ page }) => {
  test.skip(!live, NEEDS)
  // the last Thursday not after today (the clock only goes back): day 4 of its week
  const today = berlinDate()
  const back = (new Date(`${today}T12:00:00Z`).getUTCDay() + 7 - 4) % 7
  const thursday = addDaysISO(today, -back)
  const monday = weekStart(thursday)
  const sb = await testClient()
  const week = await sb.from('weeks').upsert({ start_date: monday }, { onConflict: 'user_id,start_date' }).select('id').single()
  expect(week.error).toBeNull()
  expect((await sb.from('week_limits').insert({ week_id: week.data!.id, category: 'Продукты', limit_eur: 25 })).error).toBeNull()
  expect((await sb.from('transactions').insert({ date: addDaysISO(monday, 1), amount_eur: 12, kind: 'expense', grp: 'Жизнь', category: 'Продукты', title: 'Продукты', confirmed_at: new Date().toISOString() })).error).toBeNull()
  await sb.auth.signOut()

  await page.clock.install({ time: berlinAt(thursday, 12) })
  await login(page)
  await tab(page, 'Деньги')
  await expect(page.getByText(/при таком темпе к воскресенью ≈ 21\s€ из лимита 25\s€/)).toBeVisible() // 12 € in 4 days → 21 €
})
