import { expect, test } from '@playwright/test'
import { NEEDS, cleanupTestUser, live, login, tab } from './helpers'

test.beforeAll(cleanupTestUser)
test.afterAll(cleanupTestUser)

test('Работа: новая задача → смена статуса → видна на «Сегодня»', async ({ page }) => {
  test.skip(!live, NEEDS)
  const title = `e2e Aufgabe ${Date.now()}`
  await login(page)
  await tab(page, 'Работа')

  await page.getByRole('button', { name: 'Добавить' }).click()
  const add = page.getByRole('dialog', { name: 'Добавить' })
  await expect(add.getByRole('button', { name: 'Работа', pressed: true })).toBeVisible() // sphere preselected
  await add.getByLabel('Что сделать').fill(title)
  await add.getByRole('button', { name: 'Без даты' }).click()
  await add.getByRole('button', { name: 'Сохранить' }).click()

  const offen = page.getByRole('region', { name: 'Offen' })
  await offen.getByRole('button', { name: new RegExp(title) }).click()
  await page.getByRole('dialog', { name: 'Статус' }).getByRole('button', { name: 'In Arbeit' }).click()
  await expect(page.getByRole('region', { name: 'In Arbeit' }).getByRole('button', { name: new RegExp(title) })).toBeVisible()

  await tab(page, 'Сегодня')
  await expect(page.getByText(title)).toBeVisible()
})

test('Учёба: пункт на сегодня попадает в неделю, «готово к» и чекбокс', async ({ page }) => {
  test.skip(!live, NEEDS)
  const title = `e2e HA ${Date.now()}`
  await login(page)
  await tab(page, 'Учёба')
  await expect(page.getByText('На эту неделю пунктов нет')).toBeVisible()

  await page.getByRole('button', { name: 'Добавить' }).click()
  const add = page.getByRole('dialog', { name: 'Добавить' })
  await add.getByLabel('Что сделать').fill(title)
  await add.getByRole('button', { name: 'Сохранить' }).click()

  const box = page.getByRole('checkbox', { name: title })
  await expect(box).toHaveAttribute('aria-checked', 'false')
  await box.click()
  await expect(box).toHaveAttribute('aria-checked', 'true')
})

test('Заметка из «+» появляется в сфере', async ({ page }) => {
  test.skip(!live, NEEDS)
  const title = `e2e заметка ${Date.now()}`
  await login(page)
  await tab(page, 'Тело')
  await page.getByRole('button', { name: 'Добавить' }).click()
  const add = page.getByRole('dialog', { name: 'Добавить' })
  await add.getByRole('tab', { name: 'Заметка' }).click()
  await expect(add.getByRole('button', { name: 'Тело', pressed: true })).toBeVisible() // sphere of the current screen
  await add.getByLabel('Заметка', { exact: true }).fill(`${title}\nподробности`)
  await add.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByRole('button', { name: title })).toBeVisible()
})
