import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, BACKUP_TABLES, BACKUP_VERSION, RESTORE_CONFLICT, exportFileName, parseBackup, restorePlan, restoreRow, toCsv, type Backup } from './backup'

const backup: Backup = {
  format: BACKUP_FORMAT,
  version: 1,
  exported_at: '2026-11-11T21:00:00Z',
  tables: {
    weeks: [{ id: 'w1', user_id: 'u', start_date: '2026-11-09', end_date: '2026-11-15' }],
    items: [
      { id: 'i1', title: 'A' },
      { id: 'i2', title: 'B' },
    ],
  },
}

describe('backup', () => {
  it('parses its own format and explains what is wrong otherwise', () => {
    expect(parseBackup(JSON.stringify(backup)).ok).toBe(true)
    expect(parseBackup('nope')).toEqual({ ok: false, reason: 'Это не JSON-файл.' })
    expect(parseBackup('{"format":"x"}')).toEqual({ ok: false, reason: 'Это не экспорт Life Hub.' })
    expect(parseBackup(JSON.stringify({ ...backup, version: 6 }))).toEqual({ ok: false, reason: 'Версия файла 6 — читаются версии 1–5.' })
    expect(parseBackup(JSON.stringify({ ...backup, tables: { secrets: [] } }))).toEqual({ ok: false, reason: 'Неизвестная таблица «secrets».' })
    expect(parseBackup(JSON.stringify({ ...backup, tables: { items: [{ title: 'no id' }] } })).ok).toBe(false)
  })
  it('v5 carries habits and workouts; a v4 file is read without them; marks restore before days, by their natural key', () => {
    expect(BACKUP_VERSION).toBe(5)
    const v4 = { ...backup, version: 4 }
    expect(parseBackup(JSON.stringify({ ...v4, tables: { habit_marks: [{ id: 'm1' }] } }))).toEqual({ ok: false, reason: 'Неизвестная таблица «habit_marks».' })
    expect(parseBackup(JSON.stringify({ ...backup, version: 5, tables: { habits: [{ id: 'h1' }], workout_queue: [{ id: 'q1' }] } })).ok).toBe(true)
    const order = BACKUP_TABLES as readonly string[]
    for (const [parent, child] of [['core_programs', 'habits'], ['habits', 'habit_plan'], ['habits', 'habit_marks'], ['habit_marks', 'daily_logs'], ['workout_templates', 'workout_queue']]) {
      expect(order.indexOf(parent!)).toBeLessThan(order.indexOf(child!))
    }
    expect(RESTORE_CONFLICT).toEqual({ daily_logs: 'user_id,date', habit_marks: 'user_id,habit_id,date' })
  })
  it('v4 carries «Кор»; a v3 file (before it) is still read, but never with those tables; the program before its sessions', () => {
    const v3 = { ...backup, version: 3 }
    expect(parseBackup(JSON.stringify(v3)).ok).toBe(true)
    expect(parseBackup(JSON.stringify({ ...v3, tables: { core_sessions: [{ id: 's1' }] } }))).toEqual({ ok: false, reason: 'Неизвестная таблица «core_sessions».' })
    expect(parseBackup(JSON.stringify({ ...backup, version: 4, tables: { core_programs: [{ id: 'p1' }], core_tests: [{ id: 't1' }] } })).ok).toBe(true)
    const order = BACKUP_TABLES as readonly string[]
    for (const t of ['core_sessions', 'core_tests']) expect(order.indexOf('core_programs')).toBeLessThan(order.indexOf(t))
  })
  it('v3 carries accounts; a v2 file (before them) is still read, but never with that table', () => {
    const v2 = { ...backup, version: 2 }
    expect(parseBackup(JSON.stringify(v2)).ok).toBe(true)
    expect(parseBackup(JSON.stringify({ ...v2, tables: { accounts: [{ id: 'a1' }] } }))).toEqual({ ok: false, reason: 'Неизвестная таблица «accounts».' })
    expect(parseBackup(JSON.stringify({ ...backup, version: 3, tables: { accounts: [{ id: 'a1' }] } })).ok).toBe(true)
  })
  it('accounts restore first: envelopes, debts, rules, operations and balances point to them', () => {
    const order = BACKUP_TABLES as readonly string[]
    for (const t of ['envelopes', 'debts', 'recurring', 'transactions', 'actual_balances']) expect(order.indexOf('accounts')).toBeLessThan(order.indexOf(t))
  })
  it('v2 carries recurring rules; a v1 file (before them) is still read, but never with that table', () => {
    const v1 = { ...backup, version: 1 }
    expect(parseBackup(JSON.stringify(v1)).ok).toBe(true)
    expect(parseBackup(JSON.stringify({ ...v1, tables: { recurring: [{ id: 'r1' }] } }))).toEqual({ ok: false, reason: 'Неизвестная таблица «recurring».' })
    expect(parseBackup(JSON.stringify({ ...backup, version: 2, tables: { recurring: [{ id: 'r1' }] } })).ok).toBe(true)
  })
  it('rules restore after envelopes and before the operations that point to them', () => {
    const order = BACKUP_TABLES as readonly string[]
    expect(order.indexOf('recurring')).toBeGreaterThan(order.indexOf('envelopes'))
    expect(order.indexOf('recurring')).toBeLessThan(order.indexOf('transactions'))
    const v2: Backup = { ...backup, version: 2, tables: { transactions: [{ id: 't1', recurring_id: 'r1' }], recurring: [{ id: 'r1' }] } }
    expect(restorePlan(v2, {}).map((l) => l.table)).toEqual(['recurring', 'transactions'])
  })
  it('the old text «Счёт» (files before 0019): operations and rules by account name, «Остатки» as the old label', () => {
    const ids = new Map([['Revolut · Основной', 'main'], ['Sparkasse', 'spark']])
    expect(restoreRow('transactions', { id: 't', account: 'Revolut' }, ids)).toEqual({ id: 't', account_id: 'main' })
    expect(restoreRow('recurring', { id: 'r', account: 'Sparkasse', account_id: null }, ids)).toEqual({ id: 'r', account_id: 'spark' })
    expect(restoreRow('transactions', { id: 't', account: 'Revolut', account_id: 'month' }, ids)).toEqual({ id: 't', account_id: 'month' }) // v3: the id wins
    expect(restoreRow('transactions', { id: 't', account: 'Банк X' }, ids)).toEqual({ id: 't', account_id: null })
    expect(restoreRow('transactions', { id: 't', account: null, account_id: 'main' }, ids)).toEqual({ id: 't', account_id: 'main' })
    expect(restoreRow('actual_balances', { id: 'b', account: 'Revolut', amount_eur: 1 }, ids)).toEqual({ id: 'b', legacy_account: 'Revolut', amount_eur: 1 })
    expect(restoreRow('actual_balances', { id: 'b', account: 'Revolut', legacy_account: 'Revolut' }, ids)).toEqual({ id: 'b', legacy_account: 'Revolut' })
    expect(restoreRow('items', { id: 'i', account: 'x' }, ids)).toEqual({ id: 'i', account: 'x' }) // other tables untouched
  })
  it('restore preview: rows in the file, updated by id, new — parents first', () => {
    expect(restorePlan(backup, { items: new Set(['i1']) })).toEqual([
      { table: 'weeks', inFile: 1, update: 0, insert: 1 },
      { table: 'items', inFile: 2, update: 1, insert: 1 },
    ])
  })
  it('restored rows lose user_id (the session owns them) and generated columns', () => {
    expect(restoreRow('weeks', backup.tables.weeks![0]!)).toEqual({ id: 'w1', start_date: '2026-11-09' })
  })
  it('CSV: «;», quoted when needed, JSON for arrays, BOM, no user_id', () => {
    const csv = toCsv([
      { id: '1', user_id: 'u', title: 'Miete; Nov', people: ['A', 'B'], amount_eur: 650 },
      { id: '2', title: 'Sag "hi"' },
    ])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.slice(1).split('\r\n')).toEqual(['id;title;people;amount_eur', '1;"Miete; Nov";"[""A"",""B""]";650', '2;"Sag ""hi""";;', ''])
  })
})

describe('backup reminder', async () => {
  const { backupDue } = await import('./backup')
  const now = new Date('2026-11-15T10:00:00Z')
  it('due after more than 7 days or without any export', () => {
    expect(backupDue(null, now)).toBe(true)
    expect(backupDue('2026-11-07T09:00:00Z', now)).toBe(true)
    expect(backupDue('2026-11-09T10:00:00Z', now)).toBe(false)
    expect(backupDue('garbage', now)).toBe(true)
  })
})

describe('export file name', () => {
  it('Berlin time to the second, winter and summer', () => {
    expect(exportFileName('2026-11-19T15:52:07.123Z')).toBe('lifehub-export-2026-11-19-165207.json')
    expect(exportFileName('2027-07-01T22:00:59Z')).toBe('lifehub-export-2027-07-02-000059.json')
  })
})
