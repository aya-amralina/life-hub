import { expect, test } from '@playwright/test'
import { NEEDS, berlinDate, berlinMonday, cleanupTestUser, live, login, testClient } from './helpers'

test.beforeEach(cleanupTestUser)
test.afterAll(cleanupTestUser)

test('Месяц: «сейчас» по факту, ждут подтверждения, убранные скрыты, сверка с остатками обзора; панель не закрывает контент', async ({ page }) => {
  test.skip(!live, NEEDS)
  const sb = await testClient()
  const ins = async (row: Record<string, unknown>) => expect((await sb.from('transactions').insert(row as never)).error).toBeNull()
  await ins({ date: berlinDate(-10), amount_eur: 1000, kind: 'opening', title: 'Старт' })
  await ins({ date: berlinDate(-2), amount_eur: 100, kind: 'expense', grp: 'Жизнь', title: 'Einkauf', confirmed_at: new Date().toISOString() })
  await ins({ date: berlinDate(), amount_eur: 50, kind: 'expense', grp: 'Обязательное', title: 'Abo e2e', is_planned: true })
  await ins({ date: berlinDate(), amount_eur: 70, kind: 'expense', grp: 'Буфер', title: 'Буфер e2e', is_planned: true, cancelled_at: new Date().toISOString() })
  const week = (await sb.from('weeks').insert({ start_date: berlinMonday(0) }).select('id').single()).data!
  expect((await sb.from('reviews').insert({ week_id: week.id, balances: { Revolut: '900' } })).error).toBeNull()
  await sb.auth.signOut()

  await login(page)
  await page.goto('/money')
  await page.getByRole('tab', { name: 'Месяц' }).click()
  await expect(page.getByText('900 €').first()).toBeVisible() // 1000 − 100: the planned 50 is not in «сейчас»
  await expect(page.getByText('Ждут подтверждения: Abo e2e · −50 €')).toBeVisible()
  await expect(page.getByText(/по расчёту 900\s€ — сходится/)).toBeVisible()

  const removed = page.getByText('Буфер e2e')
  await expect(removed).toBeHidden()
  await page.getByRole('button', { name: 'Показать убранные · 1' }).click()
  await expect(removed).toHaveClass(/line-through/)

  // the last control of the page ends above the tab bar
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const gap = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Разделы"]')!.getBoundingClientRect().top
    const all = [...document.querySelectorAll('main button, main a')].map((e) => e.getBoundingClientRect().bottom)
    return nav - Math.max(...all)
  })
  expect(gap).toBeGreaterThanOrEqual(0)
})
