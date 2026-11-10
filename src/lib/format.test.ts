import { describe, expect, it } from 'vitest'
import { formatAmount, formatEur, formatHours, parseEurInput, toCents } from './format'

const NB = ' '

describe('formatEur', () => {
  it('formats cents as «32,50 €»', () => {
    expect(formatEur(3250)).toBe(`32,50${NB}€`)
    expect(formatEur(50)).toBe(`0,50${NB}€`)
  })
  it('groups thousands', () => {
    expect(formatEur(178814)).toBe(`1${NB}788,14${NB}€`)
  })
  it('never prints minus zero', () => {
    expect(formatEur(-0)).toBe(`0,00${NB}€`)
    expect(formatAmount(-0, { whole: true })).toBe('0')
  })
  it('negative', () => {
    expect(formatEur(-180)).toBe(`-1,80${NB}€`)
  })
  it('whole drops ,00 only for round sums', () => {
    expect(formatEur(2000, { whole: true })).toBe(`20${NB}€`)
    expect(formatEur(1620, { whole: true })).toBe(`16,20${NB}€`)
  })
})

describe('toCents / parseEurInput', () => {
  it('toCents avoids float drift', () => {
    expect(toCents('16.20')).toBe(1620)
    expect(toCents(0.1 + 0.2)).toBe(30)
  })
  it('parses user input', () => {
    expect(parseEurInput('4,6')).toBe(460)
    expect(parseEurInput('4.60')).toBe(460)
    expect(parseEurInput(' 12 ')).toBe(1200)
    expect(parseEurInput('4,605')).toBeNull()
    expect(parseEurInput('abc')).toBeNull()
    expect(parseEurInput('')).toBeNull()
  })
})

describe('formatHours', () => {
  it('uses comma', () => {
    expect(formatHours(27.5)).toBe(`27,5${NB}ч`)
    expect(formatHours(12)).toBe(`12${NB}ч`)
  })
})

describe('formatAmount', () => {
  it('without currency', () => {
    expect(formatAmount(1620)).toBe('16,20')
    expect(formatAmount(2000, { whole: true })).toBe('20')
    expect(formatAmount(1620, { whole: true })).toBe('16,20')
    expect(formatAmount(178814)).toBe(`1${NB}788,14`)
  })
})
