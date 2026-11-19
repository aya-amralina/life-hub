import { expect, test } from '@playwright/test'
import { NEEDS, berlinDate, cleanupTestUser, live, login, more, plus, tab, testClient } from './helpers'

// The start by accounts (decision 18.11.2026): «Деньги» count «Баланс» from the start; the quick expense goes only
// from «Баланс»; a goal alone on its account shows that account's balance. Seeded by the test user's own client.
test.beforeEach(cleanupTestUser)
test.afterAll(cleanupTestUser)

async function seed() {
  const sb = await testClient()
  const { data: accs } = await sb.from('accounts').select('id, name, source_id')
  const id = (sid: string) => accs!.find((a) => a.source_id === sid)!.id
  const ins = async (row: Record<string, unknown>) => expect((await sb.from('transactions').insert(row as never)).error).toBeNull()
  const start = berlinDate(-2)
  // the common pot before the start
  await ins({ date: berlinDate(-20), amount_eur: 1000, kind: 'opening', title: 'Старт' })
  await ins({ date: berlinDate(-5), amount_eur: 100, kind: 'expense', grp: 'Жизнь', title: 'Einkauf' })
  // the start: «Баланс» 300 on the main account, «Подушка» 500
  await ins({ date: start, amount_eur: 300, kind: 'opening', title: 'Старт по счетам', account_id: id('acct:revolut-main') })
  await ins({ date: start, amount_eur: 500, kind: 'opening', title: 'Старт по счетам', account_id: id('acct:revolut-cushion') })
  // after it: an expense from «Баланс» and a transfer «Баланс» → «Подушка»
  await ins({ date: berlinDate(-1), amount_eur: 20, kind: 'expense', grp: 'Жизнь', category: 'Продукты', title: 'Продукты', account_id: id('acct:revolut-main') })
  await ins({ date: berlinDate(-1), amount_eur: 50, kind: 'transfer', title: 'В подушку', account_id: id('acct:revolut-main'), to_account_id: id('acct:revolut-cushion') })
  return { sb, id, accs: accs! }
}

test('Месяц: «Баланс» со старта по счетам, сверка по счетам, «Месяцы» с отметкой', async ({ page }) => {
  test.skip(!live, NEEDS)
  const { sb, accs } = await seed()
  // real balances of every account of «Баланс» today: 300 − 20 − 50 = 230 on the main one
  for (const a of accs.filter((x) => ['acct:revolut-main', 'acct:revolut-month', 'acct:sparkasse', 'acct:cash'].includes(x.source_id!))) {
    const amount = a.source_id === 'acct:revolut-main' ? 230 : 0
    expect((await sb.from('actual_balances').insert({ date: berlinDate(), account_id: a.id, account: a.name, amount_eur: amount })).error).toBeNull()
  }
  await sb.auth.signOut()

  await login(page)
  await tab(page, 'Деньги')
  await more(page, 'Месяц')
  await expect(page.getByText('230 €').first()).toBeVisible() // not the pot (900 + 300 + 500 …)
  await expect(page.getByText(/^«Баланс»: Основной, На месяц, Sparkasse, Наличные · счета с /)).toBeVisible()
  await expect(page.getByText(/«Баланс» 230\s€, по расчёту 230\s€ — сходится\. Не внесены: Подушка, Казахстанская карта, Депозит и ещё 2\./)).toBeVisible()
  await expect(page.getByText(/доходы, расходы и остаток — только «Баланс»/)).toBeVisible()
})

test('быстрая трата: только счета «Баланса», начинает с Revolut · Основной', async ({ page }) => {
  test.skip(!live, NEEDS)
  await login(page)
  await tab(page, 'Деньги')
  await plus(page)
  const add = page.getByRole('dialog', { name: 'Трата' })
  const accounts = add.getByRole('group', { name: 'Счёт' })
  await expect(accounts.getByRole('button')).toHaveText(['Revolut · Основной', 'Revolut · На месяц', 'Sparkasse', 'Наличные'])
  await expect(accounts.getByRole('button', { name: 'Revolut · Основной' })).toHaveAttribute('aria-pressed', 'true')
  for (const k of ['2', ',', '5']) await add.getByRole('button', { name: k, exact: true }).click()
  await add.getByRole('button', { name: /^Продукты/ }).click()
  await expect(add).toBeHidden()

  const sb = await testClient()
  await expect
    .poll(async () => (await sb.from('transactions').select('amount_eur, accounts!transactions_account_id_fkey(source_id)')).data)
    .toEqual([{ amount_eur: 2.5, accounts: { source_id: 'acct:revolut-main' } }])
  await sb.auth.signOut()
})

test('цель одна на своём счёте: «сейчас» — остаток счёта, вносить нечего', async ({ page }) => {
  test.skip(!live, NEEDS)
  const { sb, id } = await seed()
  expect((await sb.from('envelopes').insert({ name: 'Подушка e2e', type: 'goal', goal_eur: 1000, account_id: id('acct:revolut-cushion') })).error).toBeNull()
  await sb.auth.signOut()

  await login(page)
  await tab(page, 'Деньги')
  await more(page, 'Конверты и долги')
  await expect(page.getByText('550 €')).toBeVisible() // 500 + 50 from «Баланс»
  await expect(page.getByText('остаток счёта Revolut · Подушка')).toBeVisible()
  await expect(page.getByRole('button', { name: /Внести остаток|Обновить остаток/ })).toBeHidden()
})
