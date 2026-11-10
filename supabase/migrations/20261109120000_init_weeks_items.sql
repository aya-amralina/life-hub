-- Life Hub · 0001 · base helpers, weeks, items
-- Every user table: id, user_id (default auth.uid()), created_at, updated_at (trigger), source_id
-- (unique per user, for idempotent Excel import) and RLS «own rows only» for select/insert/update/delete.
-- Roles: the publishable key (sb_publishable_) runs as `anon`, a signed-in user as `authenticated`,
-- the secret key (sb_secret_, local import only) as `service_role`, which bypasses RLS.

-- Helpers live in a schema that PostgREST does not expose.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- updated_at = now() on every update, unless the writer sets updated_at explicitly
-- (the importer carries «Aktualisiert» from Excel, which drives rule 9 «Status alt»).
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- Standard owner-only setup for a user table: RLS on, 4 policies, updated_at trigger, no anon access.
create or replace procedure private.setup_owned_table(tbl regclass)
language plpgsql
set search_path = ''
as $$
declare
  t text := tbl::text;           -- e.g. public.items
  n text := split_part(t, '.', 2);
begin
  execute format('alter table %s enable row level security', t);
  execute format('revoke all on %s from anon', t);
  execute format('grant select, insert, update, delete on %s to authenticated', t);

  execute format('create policy %I on %s for select to authenticated using (user_id = (select auth.uid()))', n || '_select_own', t);
  execute format('create policy %I on %s for insert to authenticated with check (user_id = (select auth.uid()))', n || '_insert_own', t);
  execute format('create policy %I on %s for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', n || '_update_own', t);
  execute format('create policy %I on %s for delete to authenticated using (user_id = (select auth.uid()))', n || '_delete_own', t);

  execute format('create trigger %I before update on %s for each row execute function private.set_updated_at()', n || '_set_updated_at', t);
end;
$$;

-- ───────────────────────────── weeks ─────────────────────────────
-- One row per calendar week, strictly Mon–Sun. Budget / study / glow-up numbering are columns.
create table public.weeks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  start_date       date not null check (extract(isodow from start_date) = 1),
  end_date         date generated always as (start_date + 6) stored,
  place_mode       text,
  events           text,
  budget_week_no   integer check (budget_week_no > 0),
  study_week       text check (study_week ~ '^Н\d{2}$'),
  glowup_week_no   integer check (glowup_week_no > 0),
  capacity_base_h  numeric(5, 1) check (capacity_base_h >= 0),
  capacity_max_h   numeric(5, 1) check (capacity_max_h >= 0),
  source_id        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, start_date),
  unique (user_id, source_id)
);
call private.setup_owned_table('public.weeks');

-- ───────────────────────────── items ─────────────────────────────
-- Tasks / checklist points / visits across all spheres.
create table public.items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sphere       text not null check (sphere in ('work', 'study', 'body', 'money', 'personal')),
  title        text not null check (length(btrim(title)) > 0),
  type         text,
  status       text,
  priority     text,
  area         text,               -- Bereich (work) or subject (study)
  due_date     date,
  due_time     time,
  ready_by     date,
  week_id      uuid references public.weeks (id) on delete set null,
  hours_est    numeric(5, 2) check (hours_est >= 0),
  waiting_on   text,
  people       text[] not null default '{}',
  links        text[] not null default '{}',
  synergy      text,               -- ↔
  trap         text,               -- ⚠
  data_status  text check (data_status in ('confirmed', 'assumption', 'check')),
  next_step    text,
  clickup      text,
  notes        text,
  outcome      text,
  done_at      timestamptz,
  sort_order   integer not null default 0,
  source_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, source_id)
);
call private.setup_owned_table('public.items');

create index items_user_sphere_idx on public.items (user_id, sphere);
create index items_user_open_due_idx on public.items (user_id, coalesce(ready_by, due_date)) where done_at is null;
create index items_week_idx on public.items (week_id);
