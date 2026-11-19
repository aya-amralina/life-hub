import { describe, expect, it } from 'vitest'
import { blockFolded, blockOf, strengthCard, strengthDays, strengthWeek, templateTitle, weekLine } from './bodyDay'

const queue = [
  { starts_on: '2026-11-09', position: 1, template_id: 'A' },
  { starts_on: '2026-11-09', position: 2, template_id: 'B' },
  { starts_on: '2027-01-11', position: 1, template_id: 'A' },
  { starts_on: '2027-01-11', position: 2, template_id: 'B' },
  { starts_on: '2027-01-11', position: 3, template_id: 'A' },
]

describe('body day: blocks', () => {
  it('by the time of day; «любое» is the day', () => {
    expect(['morning', 'day', 'evening', 'any', null].map(blockOf)).toEqual(['morning', 'day', 'evening', 'day', 'day'])
  })
  it('a block folds when all is done; an empty one never', () => {
    expect(blockFolded(2, 2)).toBe(true)
    expect(blockFolded(1, 2)).toBe(false)
    expect(blockFolded(0, 0)).toBe(false)
  })
})

describe('body day: the week line', () => {
  it('«Силовые 1 из 2, кор 3 из 7»; the target from the queue', () => {
    expect(weekLine(strengthWeek(queue, ['2026-11-17', '2026-11-17', '2026-11-10'], '2026-11-19'), { done: 3, of: 7 })).toBe('Силовые 1 из 2, кор 3 из 7')
    expect(weekLine(strengthWeek(queue, [], '2027-01-12'), null)).toBe('Силовые 0 из 3')
    expect(weekLine({ done: 0, target: 0 }, { done: 1, of: 4 })).toBe('Кор 1 из 4')
    expect(strengthDays(['2026-11-16', '2026-11-22', '2026-11-23'], '2026-11-19')).toEqual(['2026-11-16', '2026-11-22'])
  })
})

describe('body day: the next strength session', () => {
  it('next in the queue, a soft note after yesterday; done today; hidden for today; the week full', () => {
    expect(strengthCard(queue, [], '2026-11-19', null)).toMatchObject({ kind: 'next', slot: { template_id: 'A' }, afterYesterday: false })
    expect(strengthCard(queue, ['2026-11-18'], '2026-11-19', null)).toMatchObject({ kind: 'next', slot: { template_id: 'B' }, afterYesterday: true })
    expect(strengthCard(queue, ['2026-11-19'], '2026-11-19', null)).toEqual({ kind: 'done' })
    expect(strengthCard(queue, [], '2026-11-19', '2026-11-19')).toBeNull()
    // «Не сегодня» yesterday: today it is back, still the next one
    expect(strengthCard(queue, [], '2026-11-20', '2026-11-19')).toMatchObject({ kind: 'next', slot: { template_id: 'A' } })
    expect(strengthCard(queue, ['2026-11-16', '2026-11-18'], '2026-11-20', null)).toBeNull()
  })
  it('a short title', () => {
    expect(templateTitle({ focus: 'lower', code: 'A' })).toBe('Низ A')
    expect(templateTitle({ focus: 'upper', code: 'B' })).toBe('Верх B')
  })
})
