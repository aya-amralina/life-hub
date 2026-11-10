import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

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

  it('never grants anything to anon or public', () => {
    expect(sql).not.toMatch(/grant [^;]* to [^;]*\b(anon|public)\b/)
  })
})
