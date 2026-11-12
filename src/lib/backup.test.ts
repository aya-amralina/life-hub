import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, parseBackup, restorePlan, restoreRow, toCsv, type Backup } from './backup'

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
    expect(parseBackup(JSON.stringify({ ...backup, version: 2 })).ok).toBe(false)
    expect(parseBackup(JSON.stringify({ ...backup, tables: { secrets: [] } }))).toEqual({ ok: false, reason: 'Неизвестная таблица «secrets».' })
    expect(parseBackup(JSON.stringify({ ...backup, tables: { items: [{ title: 'no id' }] } })).ok).toBe(false)
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
