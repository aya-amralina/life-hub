import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { todayBerlin } from '../../src/lib/dates'
import { fetchAllPages } from '../../src/lib/paging'
import { balanceAt, forecastEnd, type TxLike } from '../../src/lib/rules/money'
import { supabaseConfigured } from '../testUser'

// SPEC §6 checks of the import. Since 12.11.2026 the app is the source of the data: items are edited, rolled over
// and closed there, so the control numbers from Excel are checked against the ARCHIVE — the backup made right after
// the import (12.11.2026, data/backups, never in git) — not against the live base. Only the shape of the operations
// is checked live, read-only with the secret key (bypasses RLS, filtered by user_id). Counts and sums only — no row
// contents in the output.
const url = process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const email = process.env.LIFEHUB_EMAIL
const ready = supabaseConfigured() && Boolean(secret && email)

// Control numbers from the Excel files (SPEC §6) — what the one-time import brought in.
const WORK_TASKS = 31 // non-empty rows of «Dev Aufgaben»
const CHECKLIST_ITEMS = 254 // rows of «Чеклист» (without the 2 instruction rows)
const H04_HOURS = 27.5

/**
 * The archive: the last backup of 12.11.2026, the day the app became the source, kept apart from data/backups (which
 * may be cleaned) as data/archive/excel-final-2026-11-12.json — never in git. LIFEHUB_ARCHIVE_BACKUP points elsewhere.
 */
const ARCHIVE = resolve(process.env.LIFEHUB_ARCHIVE_BACKUP ?? 'data/archive/excel-final-2026-11-12.json')
const hasArchive = existsSync(ARCHIVE)
const NO_ARCHIVE = `Проверки архива пропущены: нет файла ${ARCHIVE} (бэкап 12.11.2026; другой путь — LIFEHUB_ARCHIVE_BACKUP).`

type ArchiveRow = { id: string; source_id?: string | null; week_id?: string | null; study_week?: string | null; hours_est?: number | string | null; rollover_count?: number }

function archive(): { items: ArchiveRow[]; weeks: ArchiveRow[] } {
  const tables = (JSON.parse(readFileSync(ARCHIVE, 'utf8')) as { tables: Record<string, ArchiveRow[]> }).tables
  return { items: tables.items ?? [], weeks: tables.weeks ?? [] }
}

const checklist = (rows: readonly ArchiveRow[]) => rows.filter((i) => i.source_id?.startsWith('study:') && !i.source_id.startsWith('study:dl:'))

async function setup() {
  const admin = createClient(url!, secret!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 100 })
  expect(error).toBeNull()
  const uid = data.users.find((u) => u.email?.toLowerCase() === email!.toLowerCase())?.id
  expect(uid).toBeTruthy()
  return { admin, uid: uid! }
}

describe.skipIf(!ready)('live base: the operations are in shape', () => {
  // Until 12.11.2026 this compared the balance of the imported operations with the last imported Excel. The app is
  // the source now (operations are created and edited in it), so the two legitimately differ: only the shape is checked.
  it('operations are there: one start row, a finite plan to the horizon', async () => {
    const { admin, uid } = await setup()
    // paged: more than max_rows (1000) operations must not be cut short
    const txs: (TxLike & { account_id: string | null })[] = await fetchAllPages((from, to) =>
      admin
        .from('transactions')
        .select('id, date, amount_eur, kind, category, envelope_id, is_planned, confirmed_at, cancelled_at, entry_kind, grp, account_id')
        .eq('user_id', uid)
        .order('date')
        .order('id')
        .range(from, to),
    )
    expect(txs.length).toBeGreaterThan(0)
    const openings = txs.filter((t) => t.kind === 'opening' && !t.cancelled_at)
    // the start of the pot (13.10, no account) and, from the start by accounts (SPEC rule 30), at most one per account, one day
    expect(openings.filter((t) => !t.account_id)).toHaveLength(1)
    const byAccount = openings.filter((t) => t.account_id)
    expect(new Set(byAccount.map((t) => t.account_id)).size).toBe(byAccount.length)
    expect(new Set(byAccount.map((t) => t.date)).size).toBeLessThanOrEqual(1)
    expect(Number.isFinite(balanceAt(txs, forecastEnd(todayBerlin()), 'plan', todayBerlin()))).toBe(true)
  })
})

describe('import checks (SPEC §6): the archive file', () => {
  it('is there, or the archive checks are skipped with a reason', (ctx) => {
    if (hasArchive) return
    console.warn(NO_ARCHIVE)
    ctx.skip(NO_ARCHIVE)
  })
})

describe.skipIf(!hasArchive)('import checks (SPEC §6) against the archive of 12.11.2026', () => {
  it('work tasks = non-empty rows of «Dev Aufgaben»', () => {
    expect(archive().items.filter((i) => i.source_id?.startsWith('work:'))).toHaveLength(WORK_TASKS)
  })

  it('checklist items = rows of «Чеклист»', () => {
    expect(checklist(archive().items)).toHaveLength(CHECKLIST_ITEMS)
  })

  it('study hours of Н04 = 27,5 h (items planned there, not rolled over from earlier weeks)', () => {
    const { items, weeks } = archive()
    const h04 = weeks.filter((w) => w.study_week === 'Н04').map((w) => w.id)
    expect(h04).toHaveLength(1)
    const hours = checklist(items)
      .filter((i) => i.week_id === h04[0] && i.rollover_count === 0)
      .reduce((s, i) => s + (Number(i.hours_est) || 0), 0)
    expect(hours).toBeCloseTo(H04_HOURS, 2)
  })
})
