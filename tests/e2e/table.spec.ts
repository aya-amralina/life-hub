import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { NEEDS, berlinMonday, cleanupTestUser, live, login, testClient } from './helpers'

// laptop: the side rail and the table view of Work and Study
test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false })
test.beforeEach(cleanupTestUser)
test.afterAll(cleanupTestUser)

test('Работа · таблица: правка в ячейке, массовая смена статуса и одно «Отменить»', async ({ page }) => {
  test.skip(!live, NEEDS)
  const sb = await testClient()
  for (const [title, area] of [['Alpha e2e', 'Export'], ['Beta e2e', 'Auth'], ['Gamma e2e', 'Export']]) {
    expect((await sb.from('items').insert({ sphere: 'work', title, area, status: 'Offen' })).error).toBeNull()
  }
  await sb.auth.signOut()

  await login(page)
  await page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Работа' }).click()
  await page.getByRole('radio', { name: 'Таблица' }).click()
  const grid = page.getByRole('grid', { name: 'Задачи Работы' })
  await expect(grid.getByText('Alpha e2e')).toBeVisible()

  // a cell: click → edit, Enter saves
  await grid.getByRole('gridcell', { name: 'Alpha e2e' }).click()
  await grid.getByRole('textbox', { name: 'Значение' }).fill('Alpha e2e renamed')
  await page.keyboard.press('Enter')
  await expect(grid.getByText('Alpha e2e renamed')).toBeVisible()
  // Esc cancels
  await grid.getByRole('gridcell', { name: 'Beta e2e' }).click()
  await grid.getByRole('textbox', { name: 'Значение' }).fill('nope')
  await page.keyboard.press('Escape')
  await expect(grid.getByText('Beta e2e')).toBeVisible()

  // sort by Titel, then Shift-click a range of three rows
  await grid.getByRole('button', { name: 'Titel' }).click()
  const boxes = grid.getByRole('checkbox', { name: 'Выбрать строку' })
  await boxes.nth(0).click()
  await boxes.nth(2).click({ modifiers: ['Shift'] })
  await expect(page.getByText('Выбрано: 3')).toBeVisible()
  await page.getByRole('toolbar', { name: 'Действия с выбранными' }).getByRole('combobox', { name: 'Статус' }).selectOption('In Arbeit')
  await expect(page.getByText('Изменено: 3 пункта')).toBeVisible()
  await expect(grid.getByRole('gridcell', { name: 'In Arbeit' })).toHaveCount(3)
  await page.getByRole('button', { name: 'Отменить' }).click()
  await expect(grid.getByRole('gridcell', { name: 'Offen' })).toHaveCount(3)

  // the change reached the base
  const check = await testClient()
  const { data } = await check.from('items').select('title, status').eq('sphere', 'work').order('title')
  expect(data).toEqual([
    { title: 'Alpha e2e renamed', status: 'Offen' },
    { title: 'Beta e2e', status: 'Offen' },
    { title: 'Gamma e2e', status: 'Offen' },
  ])
  await check.auth.signOut()

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([])
})

test('Учёба · таблица: неделя, часы и ✓ правятся, группировка по предмету', async ({ page }) => {
  test.skip(!live, NEEDS)
  const sb = await testClient()
  const week = (await sb.from('weeks').insert({ start_date: berlinMonday(0), study_week: 'Н04' }).select('id').single()).data!
  await sb.from('weeks').insert({ start_date: berlinMonday(1), study_week: 'Н05' })
  expect((await sb.from('items').insert({ sphere: 'study', title: 'Blatt e2e', area: 'GLET', week_id: week.id, hours_est: 2, status: 'открыто' })).error).toBeNull()
  expect((await sb.from('items').insert({ sphere: 'study', title: 'VL e2e', area: 'TI', week_id: week.id, status: 'открыто' })).error).toBeNull()
  await sb.auth.signOut()

  await login(page)
  await page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Учёба' }).click()
  await page.getByRole('radio', { name: 'Таблица' }).click()
  const grid = page.getByRole('grid', { name: 'Пункты Учёбы' })
  await expect(grid.getByText('Blatt e2e')).toBeVisible()

  await page.getByRole('combobox', { name: 'Группировать' }).selectOption('subject')
  await expect(grid.getByRole('columnheader', { name: /GLET · 1/ })).toBeVisible()

  // hours: «1,5» saves, a word is refused
  const hours = grid.getByRole('row').filter({ hasText: 'Blatt e2e' }).getByRole('gridcell').nth(5) // checkbox, Неделя, Предмет, Тип, Что закрыть, Часы
  await hours.click()
  await grid.getByRole('textbox', { name: 'Значение' }).fill('zwei')
  await page.keyboard.press('Enter')
  await expect(grid.getByRole('textbox', { name: 'Значение' })).toHaveAttribute('aria-invalid', 'true')
  await grid.getByRole('textbox', { name: 'Значение' }).fill('1,5')
  await page.keyboard.press('Enter')
  await expect(hours).toHaveText(/1,5/)

  // ✓ with the keyboard: arrows to the last column, Space
  await page.keyboard.press('End')
  await page.keyboard.press(' ')
  const sb2 = await testClient()
  await expect.poll(async () => (await sb2.from('items').select('status, hours_est').eq('title', 'Blatt e2e').single()).data).toEqual({ status: 'готово', hours_est: 1.5 })
  await sb2.auth.signOut()
})
