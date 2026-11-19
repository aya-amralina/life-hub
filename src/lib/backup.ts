// Export / restore format, shared with `npm run backup` (scripts/import/backup.py).

/** Every user table, parents first — the restore goes in this order. */
export const BACKUP_TABLES = [
  'accounts',
  'weeks',
  'plan_stages',
  'activity_types',
  'envelopes',
  'debts',
  'recurring',
  'people',
  'items',
  'transactions',
  'actual_balances',
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
/**
 * v2 (16.11.2026) adds `recurring` and the columns of operations that link to it; v3 (18.11.2026) adds `accounts`.
 * Older files are still restored.
 */
export const BACKUP_VERSION = 3

/** Tables each readable version may hold. */
const TABLES_OF_VERSION: Record<number, readonly string[]> = {
  1: BACKUP_TABLES.filter((t) => t !== 'recurring' && t !== 'accounts'),
  2: BACKUP_TABLES.filter((t) => t !== 'accounts'),
  3: BACKUP_TABLES,
}

export type Row = Record<string, unknown> & { id: string }
export type Backup = { format: string; version: number; exported_at: string; tables: Partial<Record<BackupTable, Row[]>> }

export const TABLE_LABEL: Record<BackupTable, string> = {
  accounts: 'Счета',
  weeks: 'Недели',
  plan_stages: 'Этапы',
  activity_types: 'Типы активностей',
  envelopes: 'Конверты и цели',
  debts: 'Долги',
  recurring: 'Регулярные',
  actual_balances: 'Остатки',
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
  const known = typeof b.version === 'number' ? TABLES_OF_VERSION[b.version] : undefined
  if (!known) return { ok: false, reason: `Версия файла ${String(b.version)} — читаются версии 1–${BACKUP_VERSION}.` }
  if (!b.tables || typeof b.tables !== 'object') return { ok: false, reason: 'В файле нет таблиц.' }
  for (const [name, rows] of Object.entries(b.tables)) {
    if (!known.includes(name)) return { ok: false, reason: `Неизвестная таблица «${name}».` }
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

/** The old text «Счёт» (until migration 0019): Revolut was the main account, the rest keep their names. */
const legacyAccountName = (text: string) => (text === 'Revolut' ? 'Revolut · Основной' : text)

/**
 * A row as it goes back: the owner comes from the session (RLS), generated columns are dropped. The old text «Счёт»
 * of files made before migration 0019 (v1, v2 and early v3) is gone from the base: an operation or a rule gets the
 * account by its name (`accountIdByName` — the accounts of the base), «Остатки» keep it as `legacy_account`.
 */
export function restoreRow(table: BackupTable, row: Row, accountIdByName: ReadonlyMap<string, string> = new Map()): Row {
  const out: Row = { ...row }
  delete out.user_id
  for (const c of GENERATED[table] ?? []) delete out[c]
  if ('account' in out && (table === 'transactions' || table === 'recurring' || table === 'actual_balances')) {
    const text = typeof out.account === 'string' && out.account ? out.account : null
    delete out.account
    if (text && table === 'actual_balances') out.legacy_account ??= text
    else if (text && !out.account_id) out.account_id = accountIdByName.get(legacyAccountName(text)) ?? null
  }
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
