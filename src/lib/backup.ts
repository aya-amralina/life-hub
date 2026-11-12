// Export / restore format, shared with `npm run backup` (scripts/import/backup.py).

/** Every user table, parents first — the restore goes in this order. */
export const BACKUP_TABLES = [
  'weeks',
  'plan_stages',
  'activity_types',
  'envelopes',
  'people',
  'items',
  'transactions',
  'week_limits',
  'daily_logs',
  'activities',
  'intake',
  'strength_sets',
  'measurements',
  'notes',
  'wishlist',
  'reviews',
  'import_baseline',
] as const
export type BackupTable = (typeof BACKUP_TABLES)[number]

export const BACKUP_FORMAT = 'life-hub-backup'
export const BACKUP_VERSION = 1

export type Row = Record<string, unknown> & { id: string }
export type Backup = { format: string; version: number; exported_at: string; tables: Partial<Record<BackupTable, Row[]>> }

export const TABLE_LABEL: Record<BackupTable, string> = {
  weeks: 'Недели',
  plan_stages: 'Этапы',
  activity_types: 'Типы активностей',
  envelopes: 'Конверты',
  people: 'Люди',
  items: 'Пункты',
  transactions: 'Операции',
  week_limits: 'Лимиты недель',
  daily_logs: 'Дни',
  activities: 'Активности',
  intake: 'Приём',
  strength_sets: 'Силовые',
  measurements: 'Замеры',
  notes: 'Заметки',
  wishlist: 'Хотелки',
  reviews: 'Обзоры',
  import_baseline: 'Базовая линия импорта',
}

/** Columns the base computes itself — never sent back. */
const GENERATED: Partial<Record<BackupTable, string[]>> = { weeks: ['end_date'] }

/** Parse a backup file; a readable reason when it is not one. */
export function parseBackup(text: string): { ok: true; backup: Backup } | { ok: false; reason: string } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'Это не JSON-файл.' }
  }
  const b = data as Partial<Backup>
  if (!b || b.format !== BACKUP_FORMAT) return { ok: false, reason: 'Это не экспорт Life Hub.' }
  if (b.version !== BACKUP_VERSION) return { ok: false, reason: `Версия файла ${String(b.version)} — ожидается ${BACKUP_VERSION}.` }
  if (!b.tables || typeof b.tables !== 'object') return { ok: false, reason: 'В файле нет таблиц.' }
  for (const [name, rows] of Object.entries(b.tables)) {
    if (!(BACKUP_TABLES as readonly string[]).includes(name)) return { ok: false, reason: `Неизвестная таблица «${name}».` }
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== 'object' || typeof (r as Row).id !== 'string')) {
      return { ok: false, reason: `Таблица «${name}» повреждена.` }
    }
  }
  return { ok: true, backup: b as Backup }
}

export type RestoreLine = { table: BackupTable; inFile: number; update: number; insert: number }

/** Preview before restoring: per table rows in the file, of them already in the base (updated by id) and new. */
export function restorePlan(backup: Backup, existing: Partial<Record<BackupTable, ReadonlySet<string>>>): RestoreLine[] {
  return BACKUP_TABLES.filter((t) => (backup.tables[t]?.length ?? 0) > 0).map((table) => {
    const rows = backup.tables[table]!
    const have = existing[table] ?? new Set<string>()
    const update = rows.filter((r) => have.has(r.id)).length
    return { table, inFile: rows.length, update, insert: rows.length - update }
  })
}

/** A row as it goes back: the owner comes from the session (RLS), generated columns are dropped. */
export function restoreRow(table: BackupTable, row: Row): Row {
  const out: Row = { ...row }
  delete out.user_id
  for (const c of GENERATED[table] ?? []) delete out[c]
  return out
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV for Excel: «;» separator (comma is the decimal in de/ru), header from all columns, UTF-8 with BOM. */
export function toCsv(rows: readonly Record<string, unknown>[]): string {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => c !== 'user_id')
  const lines = [cols.join(';'), ...rows.map((r) => cols.map((c) => cell(r[c])).join(';'))]
  return '﻿' + lines.join('\r\n') + '\r\n'
}

export const BACKUP_EVERY_DAYS = 7

/** The review reminds to download a backup when the last export is older than 7 days (or there was none). */
export function backupDue(lastExport: string | null, now: Date): boolean {
  if (!lastExport) return true
  const t = new Date(lastExport).getTime()
  return Number.isNaN(t) || now.getTime() - t > BACKUP_EVERY_DAYS * 86_400_000
}

/** Whole days since the last export (null if none). */
export function backupAgeDays(lastExport: string | null, now: Date): number | null {
  if (!lastExport) return null
  const t = new Date(lastExport).getTime()
  return Number.isNaN(t) ? null : Math.floor((now.getTime() - t) / 86_400_000)
}
