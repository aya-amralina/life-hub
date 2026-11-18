import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, BACKUP_TABLES, BACKUP_VERSION, parseBackup, restorePlan, restoreRow, toCsv, type Backup } from './backup'

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
    expect(parseBackup(JSON.stringify({ ...backup, version: 4 }))).toEqual({ ok: false, reason: 'Версия файла 4 — читаются версии 1–3.' })
    expect(parseBackup(JSON.stringify({ ...backup, tables: { secrets: [] } }))).toEqual({ ok: false, reason: 'Неизвестная таблица «secrets».' })
    expect(parseBackup(JSON.stringify({ ...backup, tables: { items: [{ title: 'no id' }] } })).ok).toBe(false)
  })
  it('v3 carries accounts; a v2 file (before them) is still read, but never with that table', () => {
    expect(BACKUP_VERSION).toBe(3)
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
