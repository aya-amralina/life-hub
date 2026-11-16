import { expect, test } from '@playwright/test'
import { NEEDS, cleanupTestUser, live, login, more, plus, tab } from './helpers'

test.beforeAll(cleanupTestUser)
test.afterAll(cleanupTestUser)

test('Работа: новая задача → смена статуса → видна на «Сегодня»', async ({ page }) => {
  test.skip(!live, NEEDS)
  const title = `e2e Aufgabe ${Date.now()}`
  await login(page)
  await tab(page, 'Работа')

  await plus(page) // Работа's own form: a task for the board
  const add = page.getByRole('dialog', { name: 'Новая задача' })
  await add.getByLabel('Titel').fill(title)
  await add.getByRole('button', { name: 'Mittel' }).click()
  await expect(add.getByRole('button', { name: 'Без срока', pressed: true })).toBeVisible()
  await add.getByRole('button', { name: 'Сохранить' }).click()

  const offen = page.getByRole('region', { name: 'Offen' })
  await offen.getByRole('button', { name: new RegExp(title) }).click()
  await page.getByRole('dialog', { name: 'Статус' }).getByRole('button', { name: 'In Arbeit' }).click()
  await expect(page.getByRole('region', { name: 'In Arbeit' }).getByRole('button', { name: new RegExp(title) })).toBeVisible()

  await tab(page, 'Сегодня')
  await expect(page.getByText(title)).toBeVisible()
})

test('Учёба: пункт из «+» встаёт в эту неделю, чекбокс', async ({ page }) => {
  test.skip(!live, NEEDS)
  const title = `e2e HA ${Date.now()}`
  await login(page)
  await tab(page, 'Учёба')
  await expect(page.getByText(/пока пустой/)).toBeVisible()

  await plus(page)
  const add = page.getByRole('dialog', { name: 'Пункт учёбы' })
  await add.getByLabel('Что закрыть').fill(title)
  await expect(add.getByRole('button', { name: /^Эта/, pressed: true })).toBeVisible()
  await add.getByRole('button', { name: 'Больше на полчаса' }).click()
  await expect(add.getByText('1,5\u00a0ч')).toBeVisible()
  await add.getByRole('button', { name: 'Сохранить' }).click()

  const box = page.getByRole('checkbox', { name: title })
  await expect(box).toHaveAttribute('aria-checked', 'false')
  await box.click()
  // done rows fold under «Сделано · N» of the subject
  await expect(box).toBeHidden()
  await page.getByRole('button', { name: /Сделано\s*1/ }).click()
  await expect(box).toHaveAttribute('aria-checked', 'true')
})

test('Заметка из «+» в разделе заметок сферы', async ({ page }) => {
  test.skip(!live, NEEDS)
  const title = `e2e заметка ${Date.now()}`
  await login(page)
  await tab(page, 'Тело')
  await more(page, 'Справка и заметки')
  await expect(page.getByText('Заметок пока нет')).toBeVisible()
  await plus(page)
  const add = page.getByRole('dialog', { name: 'Заметка' })
  await expect(add.getByRole('button', { name: 'Тело', pressed: true })).toBeVisible() // sphere of the current screen
  await add.getByLabel('Заметка', { exact: true }).fill(`${title}\nподробности`)
  await add.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByRole('button', { name: title })).toBeVisible()
})
