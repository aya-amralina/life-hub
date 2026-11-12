import { expect, test } from '@playwright/test'
import { NEEDS, berlinDate, cleanupTestUser, live, login, testClient } from './helpers'

test.beforeEach(cleanupTestUser)
test.afterAll(cleanupTestUser)

test('Конверты: «Отложено» только по конвертам, цель из «Остатков», заём из копилки и долги', async ({ page }) => {
  test.skip(!live, NEEDS)
  const sb = await testClient()
  const one = async (t: string, row: Record<string, unknown>) => {
    const r = await sb.from(t as 'items').insert(row as never).select('id').single()
    expect(r.error).toBeNull()
    return r.data!.id as string
  }
  const gifts = await one('envelopes', { name: 'Подарки', type: 'envelope', planned_eur: 200 })
  const pillow = await one('envelopes', { name: 'Подушка', type: 'goal', planned_eur: 0, goal_eur: 1000, goal_date: '2027-03-31' })
  await one('transactions', { date: berlinDate(-1), amount_eur: 80, kind: 'expense', grp: 'Жизнь', title: 'Geschenk', envelope_id: gifts, confirmed_at: new Date().toISOString() })
  await one('actual_balances', { date: berlinDate(-3), account: 'E5', envelope_id: pillow, amount_eur: 300, origin: 'excel' })
  await one('actual_balances', { date: berlinDate(-1), account: 'E5', envelope_id: pillow, amount_eur: 390, origin: 'excel' })
  await one('debts', { who: 'Подушка', direction: 'from_pot', amount_eur: 150, repaid_eur: 50, status: 'open', pot_id: pillow, note: 'на Франкфурт' })
  await one('debts', { who: 'Жилец', direction: 'i_owe', amount_eur: 100, status: 'open', due_date: berlinDate(18) })
  await one('debts', { who: 'Сестра', direction: 'i_owe', amount_eur: 40, status: 'closed' })
  await sb.auth.signOut()

  await login(page)
  await page.goto('/money')
  await page.getByRole('tab', { name: 'Конверты' }).click()
  await expect(page.getByText('Отложено в конвертах')).toBeVisible()
  await expect(page.getByText('120 €', { exact: true })).toHaveCount(2) // total and the card: 200 − 80, the goal is not counted
  await expect(page.getByRole('progressbar', { name: 'Подушка: накоплено' })).toHaveAttribute('aria-valuenow', '39000')
  await expect(page.getByText(/Взято в долг из этой цели: 150\s€ · на Франкфурт/)).toBeVisible()
  await expect(page.getByText(/ещё не возвращено 100\s€/)).toBeVisible()
  await expect(page.getByText('открыто 2')).toBeVisible()
  await expect(page.getByText('Сестра')).toBeHidden()
  await page.getByRole('button', { name: /Закрытые/ }).click()
  await expect(page.getByText('Сестра')).toBeVisible()
})
