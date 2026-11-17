import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BACKUP_TABLES } from '../../src/lib/backup'

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

  it('ping() reads no table', () => {
    expect(sql).toMatch(/create or replace function public\.ping\(\)[\s\S]*?as \$\$ select 1 \$\$;/)
  })
})
