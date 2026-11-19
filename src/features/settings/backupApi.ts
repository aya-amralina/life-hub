import { supabase } from '@/lib/supabase'
import { fetchAllPages } from '@/lib/paging'
import { BACKUP_FORMAT, BACKUP_TABLES, BACKUP_VERSION, exportFileName, restoreRow, type Backup, type BackupTable, type Row } from '@/lib/backup'

async function allRows(table: BackupTable): Promise<Row[]> {
  // (created_at, id): imported rows share created_at, so id keeps the pages stable
  return fetchAllPages((from, to) =>
    supabase
      .from(table as 'items')
      .select('*')
      .order('created_at')
      .order('id')
      .range(from, to),
  ) as unknown as Promise<Row[]>
}

/** Everything of the signed-in user (RLS: own rows only), in the backup format. */
export async function exportAll(): Promise<Backup> {
  const tables: Backup['tables'] = {}
  for (const t of BACKUP_TABLES) tables[t] = await allRows(t)
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: new Date().toISOString(), tables }
}

export async function exportTable(table: BackupTable): Promise<Row[]> {
  return allRows(table)
}

/** Ids already in the base, per table — for the preview. */
export async function existingIds(tables: readonly BackupTable[]): Promise<Partial<Record<BackupTable, Set<string>>>> {
  const out: Partial<Record<BackupTable, Set<string>>> = {}
  for (const t of tables) {
    const rows = await fetchAllPages((from, to) =>
      supabase
        .from(t as 'items')
        .select('id')
        .order('id')
        .range(from, to),
    )
    const ids = new Set(rows.map((r) => r.id))
    out[t] = ids
  }
  return out
}

/** Restore: upsert by id, parents first, in chunks. Rows of the base that are not in the file stay. */
export async function restore(backup: Backup, onTable?: (t: BackupTable) => void): Promise<number> {
  let n = 0
  // the accounts of the base once «accounts» (the first table) is back: old files name an account by its text
  let accountIds: Map<string, string> | null = null
  for (const t of BACKUP_TABLES) {
    if (t !== 'accounts' && accountIds === null) {
      const { data, error } = await supabase.from('accounts').select('id, name')
      if (error) throw error
      accountIds = new Map(data.map((a) => [a.name, a.id]))
    }
    const rows = (backup.tables[t] ?? []).map((r) => restoreRow(t, r, accountIds ?? undefined))
    if (!rows.length) continue
    onTable?.(t)
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from(t as 'items').upsert(rows.slice(i, i + 500) as never, { onConflict: 'id' })
      if (error) throw error
    }
    n += rows.length
  }
  return n
}

/** Save a file: the share sheet on the phone (PWA), a download elsewhere. */
export async function saveFile(name: string, type: string, content: string) {
  const file = new File([content], name, { type })
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name })
      return
    } catch {
      // cancelled or not allowed — fall back to a download
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const LAST_EXPORT = 'lifehub.lastExport'

/** When this device last exported a JSON backup (a per-device convenience; null if unknown). */
export function lastExport(): string | null {
  try {
    return localStorage.getItem(LAST_EXPORT)
  } catch {
    return null
  }
}

/** Export everything and save the file; remembers the time for the review reminder. Returns the row count. */
export async function downloadBackup(): Promise<number> {
  const backup = await exportAll()
  const rows = Object.values(backup.tables).reduce((s, r) => s + (r?.length ?? 0), 0)
  await saveFile(exportFileName(backup.exported_at), 'application/json', JSON.stringify(backup))
  try {
    localStorage.setItem(LAST_EXPORT, backup.exported_at)
  } catch {
    // storage blocked — the reminder just shows again
  }
  return rows
}
