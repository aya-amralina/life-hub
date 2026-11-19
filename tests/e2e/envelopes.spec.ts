import { expect, test } from '@playwright/test'
import { NEEDS, berlinDate, cleanupTestUser, live, login, more, plus, testClient } from './helpers'

/** The scenario «по плану» on the horizon (stage 2): its row of the table holds the sum. */
const planOn = (eur: number) => new RegExp(`^по плану.*${eur}\\s€`)

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
  await one('actual_balances', { date: berlinDate(-3), envelope_id: pillow, amount_eur: 300, origin: 'excel' })
  await one('actual_balances', { date: berlinDate(-1), envelope_id: pillow, amount_eur: 390, origin: 'excel' })
  await one('debts', { who: 'Подушка', direction: 'from_pot', amount_eur: 150, repaid_eur: 50, status: 'open', pot_id: pillow, note: 'на Франкфурт' })
  await one('debts', { who: 'Жилец', direction: 'i_owe', amount_eur: 100, status: 'open', due_date: berlinDate(18) })
  await one('debts', { who: 'Сестра', direction: 'i_owe', amount_eur: 40, status: 'closed' })
  await sb.auth.signOut()

  await login(page)
  await page.goto('/money')
  await more(page, 'Конверты и долги')
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

test('без Excel: плановая операция, её правка и долг заводятся в приложении', async ({ page }) => {
  test.skip(!live, NEEDS)
  const sb = await testClient()
  expect((await sb.from('transactions').insert({ date: '2026-10-13', amount_eur: 1000, kind: 'opening', title: 'Старт', confirmed_at: new Date().toISOString() })).error).toBeNull()
  await sb.auth.signOut()

  await login(page)
  await page.goto('/money')
  await more(page, 'Месяц')

  // a planned expense for today: «+» in «Месяц» is an operation; it joins the plan and asks «Списалось?»
  await plus(page)
  const sheet = page.getByRole('dialog', { name: 'Новая операция' })
  await sheet.getByLabel('Название').fill('Miete e2e')
  await sheet.getByLabel('Сумма').fill('650')
  await sheet.getByRole('button', { name: 'Sparkasse' }).click()
  await sheet.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText(/Ждут подтверждения: Miete e2e/)).toBeVisible()
  await expect(page.getByRole('row', { name: planOn(350) })).toBeVisible()

  // edit: another sum and status «факт» — it moves into «сейчас»
  await page.getByRole('button', { name: /Miete e2e/ }).click()
  const edit = page.getByRole('dialog', { name: 'Операция' })
  await edit.getByLabel('Сумма').fill('600')
  await edit.getByRole('tab', { name: 'Факт' }).click()
  await edit.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText(/Ждут подтверждения/)).toBeHidden()
  await expect(page.getByRole('row', { name: planOn(400) })).toBeVisible()

  // a debt
  await page.getByRole('link', { name: 'Назад: Деньги' }).click()
  await more(page, 'Конверты и долги')
  await plus(page)
  await page.getByRole('dialog', { name: 'Добавить' }).getByRole('button', { name: /^Долг/ }).click()
  const debt = page.getByRole('dialog', { name: 'Новый долг' })
  await debt.getByLabel('Кто').fill('Жилец e2e')
  await debt.getByLabel('Сумма долга').fill('100')
  await debt.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText('открыто 1')).toBeVisible()
  await page.getByRole('button', { name: 'Жилец e2e — изменить' }).click()
  await page.getByRole('dialog', { name: 'Долг' }).getByRole('button', { name: 'Закрыть долг' }).click()
  await expect(page.getByText('всё закрыто')).toBeVisible()
})
