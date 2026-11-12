import { describe, expect, it } from 'vitest'
import { debtRow, debtValid, operationForm, operationRow, operationValid, type DebtForm, type OperationForm } from './operation'

const NOW = '2026-11-12T18:00:00.000Z'
const form = (p: Partial<OperationForm> = {}): OperationForm => ({
  kind: 'expense', title: ' Miete ', cents: 65000, date: '2026-12-01', status: 'plan', grp: 'Обязательное', category: null, account: 'Sparkasse', envelopeId: null, debtId: null, note: '', ...p,
})

describe('operation form → row', () => {
  it('valid: a name, a sum above zero, a date', () => {
    expect(operationValid(form())).toBe(true)
    expect(operationValid(form({ title: '  ' }))).toBe(false)
    expect(operationValid(form({ cents: 0 }))).toBe(false)
    expect(operationValid(form({ cents: null }))).toBe(false)
  })
  it('a new planned operation waits for its day', () => {
    expect(operationRow(form(), null, NOW)).toMatchObject({ title: 'Miete', amount_eur: 650, is_planned: true, confirmed_at: null, grp: 'Обязательное', note: null })
  })
  it('a new fact is a plain fact; a planned one turned to fact keeps its mark and is confirmed', () => {
    expect(operationRow(form({ status: 'fact' }), null, NOW)).toMatchObject({ is_planned: false, confirmed_at: NOW })
    expect(operationRow(form({ status: 'fact' }), { is_planned: true, confirmed_at: null }, NOW)).toMatchObject({ is_planned: true, confirmed_at: NOW })
    expect(operationRow(form({ status: 'fact' }), { is_planned: true, confirmed_at: 'earlier' }, NOW).confirmed_at).toBe('earlier')
  })
  it('back to plan clears the confirmation', () => {
    expect(operationRow(form({ status: 'plan' }), { is_planned: false, confirmed_at: 'x' }, NOW)).toMatchObject({ is_planned: true, confirmed_at: null })
  })
  it('group by kind; weekly category only for an expense of «Жизнь»; envelope only for an expense', () => {
    expect(operationRow(form({ kind: 'income', grp: 'Жизнь', envelopeId: 'e' }), null, NOW)).toMatchObject({ grp: 'Доход', envelope_id: null, category: null })
    expect(operationRow(form({ kind: 'transfer' }), null, NOW).grp).toBeNull()
    expect(operationRow(form({ grp: 'Жизнь', category: 'Продукты' }), null, NOW).category).toBe('Продукты')
    expect(operationRow(form({ grp: 'Обязательное', category: 'Продукты' }), null, NOW).category).toBeNull()
  })
  it('a stored row round-trips through the form', () => {
    const row = operationRow(form({ note: 'x', debtId: 'd' }), null, NOW)
    expect(operationRow(operationForm(row), row, NOW)).toEqual(row)
    expect(operationForm({ ...row, is_planned: true, confirmed_at: 't' }).status).toBe('fact')
  })
})

describe('debt form', () => {
  const debt = (p: Partial<DebtForm> = {}): DebtForm => ({ who: 'Жилец', direction: 'i_owe', cents: 10000, repaidCents: null, due: null, potId: null, note: '', ...p })
  it('needs a name and a sum; a loan from a pot needs the pot; repaid within the sum', () => {
    expect(debtValid(debt())).toBe(true)
    expect(debtValid(debt({ who: '' }))).toBe(false)
    expect(debtValid(debt({ direction: 'from_pot' }))).toBe(false)
    expect(debtValid(debt({ direction: 'from_pot', potId: 'g' }))).toBe(true)
    expect(debtValid(debt({ repaidCents: 10001 }))).toBe(false)
  })
  it('the pot is kept only for a loan from it', () => {
    expect(debtRow(debt({ potId: 'g' }))).toMatchObject({ who: 'Жилец', amount_eur: 100, pot_id: null, repaid_eur: null })
    expect(debtRow(debt({ direction: 'from_pot', potId: 'g', repaidCents: 5000 }))).toMatchObject({ pot_id: 'g', repaid_eur: 50 })
  })
})
