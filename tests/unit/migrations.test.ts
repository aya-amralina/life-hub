import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BACKUP_TABLES } from '../../src/lib/backup'
import { ACCOUNT_SEED } from '../../src/lib/constants'

// Static guard for the access rule in CLAUDE.md: the project has «Automatically expose new tables» off,
// so every public table must state its privileges explicitly in the migrations.
const dir = join(__dirname, '../../supabase/migrations')
const sql = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n')
  .replace(/--.*$/gm, '') // drop comments
  .toLowerCase()

const tables = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/g)].map((m) => m[1]!)

describe('migrations: explicit access for every public table', () => {
  it('finds the tables', () => {
    expect(tables).toEqual(expect.arrayContaining(['weeks', 'items']))
  })

  it.each(tables)('%s: RLS on, anon revoked, authenticated + service_role granted, owner policies', (t) => {
    expect(sql).toContain(`alter table public.${t} enable row level security;`)
    expect(sql).toContain(`revoke all on table public.${t} from anon`)
    expect(sql).toContain(`grant select, insert, update, delete on table public.${t} to authenticated;`)
    expect(sql).toContain(`grant select, insert, update, delete on table public.${t} to service_role;`)
    expect(sql).toContain(`call private.add_owner_policies('public.${t}');`)
  })

  it('add_owner_policies also sets the updated_at trigger — a new table needs no trigger of its own', () => {
    expect(sql).toMatch(/create or replace procedure private\.add_owner_policies[\s\S]*?create trigger %i before update on %s for each row execute function private\.set_updated_at\(\)/)
  })

  it('every table is in the backup (export, restore, npm run backup), in the same order in TS and Python', () => {
    expect([...tables].sort()).toEqual([...BACKUP_TABLES].sort())
    const py = readFileSync(join(__dirname, '../../scripts/import/backup.py'), 'utf8')
    const list = /^TABLES = \[([\s\S]*?)\]/m.exec(py)![1]!
    expect([...list.matchAll(/"(\w+)"/g)].map((m) => m[1])).toEqual([...BACKUP_TABLES])
  })

  it('never grants anything to anon or public — except execute on the keep-alive ping()', () => {
    const grants = [...sql.matchAll(/grant [^;]* to [^;]*\b(anon|public)\b[^;]*;/g)].map((m) => m[0].replace(/\s+/g, ' '))
    expect(grants).toEqual(['grant execute on function public.ping() to anon, authenticated;'])
  })

  it('the accounts seed of 0016 is ACCOUNT_SEED of the app', () => {
    const seed = /cross join \(values([\s\S]*?)\) as a/.exec(readFileSync(join(dir, '20261118120000_accounts.sql'), 'utf8'))![1]!
    const rows = [...seed.matchAll(/\('([^']+)',\s*'(\w+)',\s*(\d+),\s*'([^']+)'\)/g)].map((m) => ({ name: m[1], grp: m[2], sort_order: Number(m[3]), source_id: m[4] }))
    expect(rows).toEqual(ACCOUNT_SEED)
  })

  it('0017 only expands: the old version keeps working until 0018 drops `account` (decision 18.11.2026)', () => {
    const expand = readFileSync(join(dir, '20261118120100_account_links.sql'), 'utf8').replace(/--.*$/gm, '').toLowerCase()
    expect(expand).not.toMatch(/drop column|rename|drop table/)
    // only checks are relaxed or replaced, never a column or the old unique «Остатки» per day and text account
    expect([...expand.matchAll(/drop constraint (\w+)/g)].map((m) => m[1])).toEqual([
      'transactions_amount_eur_check',
      'actual_balances_amount_eur_check',
      'actual_balances_origin_check',
    ])
  })

  it('0017: rows of the old version (text «Счёт» only, or the text changed) get account_id in both triggers', () => {
    const expand = readFileSync(join(dir, '20261118120100_account_links.sql'), 'utf8').replace(/--.*$/gm, '').toLowerCase()
    for (const [fn, table] of [['check_transaction_accounts', 'transactions'], ['check_recurring_accounts', 'recurring']] as const) {
      const body = new RegExp(`function private\\.${fn}\\(\\)[\\s\\S]*?\\$\\$;`).exec(expand)![0]
      expect(body).toContain("tg_op = 'insert' and new.account_id is null and new.account is not null")
      expect(body).toContain("new.account is distinct from old.account and new.account_id is not distinct from old.account_id")
      expect(body).toContain("case new.account when 'revolut' then 'revolut · основной' else new.account end")
      expect(expand).toMatch(new RegExp(`before insert or update of [\\w, ]*\\baccount\\b[\\w, ]* on public\\.${table}\\b`))
    }
  })

  it('ping() reads no table', () => {
    expect(sql).toMatch(/create or replace function public\.ping\(\)[\s\S]*?as \$\$ select 1 \$\$;/)
  })
})
