/// <reference lib="dom" />
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { NEEDS, berlinDate, berlinMonday, cleanupTestUser, live, login, testClient } from './helpers'

// Accessibility audit of the main screens with data, light and dark: axe (WCAG 2.1 AA incl. contrast) and
// tap zones ≥ 44px. Heat-map cells are smaller by design (the tapped cell's text shows in a line under the grid).
test.setTimeout(240_000)

const SCREENS: { name: string; go: (p: Page) => Promise<void> }[] = [
  { name: 'Сегодня', go: async (p) => void (await p.goto('/')) },
  { name: 'Деньги · Неделя', go: async (p) => void (await p.goto('/money')) },
  { name: 'Деньги · Месяц', go: async (p) => (await p.goto('/money'), await p.getByRole('tab', { name: 'Месяц' }).click()) },
  { name: 'Деньги · Хотелки', go: async (p) => (await p.goto('/money'), await p.getByRole('tab', { name: 'Хотелки' }).click()) },
  { name: 'Работа', go: async (p) => void (await p.goto('/work')) },
  { name: 'Работа · Архив', go: async (p) => (await p.goto('/work'), await p.getByRole('tab', { name: 'Архив' }).click()) },
  { name: 'Учёба', go: async (p) => void (await p.goto('/study')) },
  { name: 'Учёба · Предметы', go: async (p) => (await p.goto('/study'), await p.getByRole('tab', { name: 'Предметы' }).click()) },
  { name: 'Тело · День', go: async (p) => void (await p.goto('/body')) },
  { name: 'Тело · Графики', go: async (p) => (await p.goto('/body'), await p.getByRole('tab', { name: 'Графики' }).click()) },
  { name: 'Тело · Приём', go: async (p) => (await p.goto('/body'), await p.getByRole('tab', { name: 'Приём' }).click()) },
  { name: 'Календарь', go: async (p) => void (await p.goto('/calendar')) },
  { name: 'Журнал', go: async (p) => void (await p.goto('/journal')) },
  { name: 'Настройки', go: async (p) => void (await p.goto('/settings')) },
  { name: 'Обзор', go: async (p) => void (await p.goto('/review')) },
]

async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=checkbox], [role=switch], [role=tab], [role=radio]'
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (el.closest('[data-heatgrid]') || el.closest('.recharts-wrapper')) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      // the tap zone is the element or the label/button around it
      const zone = (el.closest('label, button') as HTMLElement | null) ?? el
      const z = zone.getBoundingClientRect()
      if (Math.max(r.height, z.height) < 43.5 || Math.max(r.width, z.width) < 43.5) {
        out.push(`${el.tagName.toLowerCase()} «${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}» ${Math.round(z.width)}×${Math.round(z.height)}`)
      }
    }
    return [...new Set(out)]
  })
}

test('доступность: контраст и роли (axe), зоны нажатия ≥ 44 px — светлая и тёмная', async ({ page }) => {
  test.skip(!live, NEEDS)
  await cleanupTestUser()
  const sb = await testClient()
  const week = (await sb.from('weeks').insert({ start_date: berlinMonday(0), study_week: 'Н04', budget_week_no: 5, capacity_base_h: 27, capacity_max_h: 36 }).select('id').single()).data!
  await sb.from('week_limits').insert({ week_id: week.id, category: 'Продукты', limit_eur: 30 })
  await sb.from('transactions').insert({ date: berlinDate(-1), amount_eur: 36.5, kind: 'expense', grp: 'Жизнь', title: 'Продукты', category: 'Продукты', confirmed_at: new Date().toISOString() })
  await sb.from('transactions').insert({ date: berlinDate(), amount_eur: 650, kind: 'expense', grp: 'Обязательное', title: 'Miete', is_planned: true })
  await sb.from('items').insert({ sphere: 'study', title: 'Übungsblatt 4', area: 'GLET', week_id: week.id, hours_est: 3, due_date: berlinDate(-1), status: 'открыто' })
  await sb.from('items').insert({ sphere: 'work', title: 'Release', status: 'In Arbeit', area: 'Kundendashboard', next_step: 'Changelog', due_date: berlinDate(2) })
  await sb.from('wishlist').insert({ title: 'Kopfhörer', price_eur: 79, added_at: new Date(Date.now() - 50 * 3_600_000).toISOString() })
  await sb.from('daily_logs').insert({ date: berlinDate(), mood: 7, energy: 6, sleep_h: 7.5, water: true, note: 'Спокойный день' })
  await sb.auth.signOut()

  const report: string[] = []
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await login(page)
    for (const s of SCREENS) {
      await s.go(page)
      await page.waitForTimeout(700)
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.recharts-wrapper').analyze()
      for (const v of axe.violations) report.push(`[${scheme}] ${s.name}: ${v.id} — ${v.nodes.length}× ${v.nodes[0]?.target.join(' ')} ${v.nodes[0]?.any[0]?.message ?? ''}`.slice(0, 260))
      for (const t of await smallTargets(page)) report.push(`[${scheme}] ${s.name}: tap ${t}`)
    }
    await page.evaluate(() => localStorage.clear())
    await page.context().clearCookies()
  }
  await cleanupTestUser()
  console.log(report.join('\n') || 'no findings')
  expect(report).toEqual([])
})
