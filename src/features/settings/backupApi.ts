import { supabase } from '@/lib/supabase'
import { BACKUP_FORMAT, BACKUP_TABLES, BACKUP_VERSION, restoreRow, type Backup, type BackupTable, type Row } from '@/lib/backup'

async function allRows(table: BackupTable): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table as 'items')
      .select('*')
      .order('created_at')
      .range(from, from + 999)
    if (error) throw error
    out.push(...(data as unknown as Row[]))
    if (data.length < 1000) return out
  }
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
    const ids = new Set<string>()
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from(t as 'items')
        .select('id')
        .range(from, from + 999)
      if (error) throw error
      data.forEach((r) => ids.add(r.id))
      if (data.length < 1000) break
    }
    out[t] = ids
  }
  return out
}

/** Restore: upsert by id, parents first, in chunks. Rows of the base that are not in the file stay. */
export async function restore(backup: Backup, onTable?: (t: BackupTable) => void): Promise<number> {
  let n = 0
  for (const t of BACKUP_TABLES) {
    const rows = (backup.tables[t] ?? []).map((r) => restoreRow(t, r))
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
  await saveFile(`lifehub-export-${backup.exported_at.slice(0, 10)}.json`, 'application/json', JSON.stringify(backup))
  try {
    localStorage.setItem(LAST_EXPORT, backup.exported_at)
  } catch {
    // storage blocked — the reminder just shows again
  }
  return rows
}
