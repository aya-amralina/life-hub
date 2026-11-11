-- Life Hub · 0007 · care items as a per-stage list (like habits) and the importer's baseline.

-- Care checklist of «Отметка дня» comes from the stage, so changing products needs no code change.
alter table public.plan_stages add column care_items text[] not null default '{}';
update public.plan_stages set care_items = '{Крем для тела,Ниацинамид утром}' where sphere = 'body';

-- Marked care items of a day, by name. Old marks stay: body_cream is copied here, face_evening («Вечер: лицо»,
-- the former tracker column) is kept as it was and shown as a past mark.
alter table public.daily_logs add column care text[] not null default '{}';
update public.daily_logs set care = array['Крем для тела'] where body_cream;

-- What the last import took from Excel, per row (table + source_id). The update compares
-- old Excel ↔ new Excel ↔ the base: a row changed only in Excel is updated, changed in both is a conflict.
create table public.import_baseline (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  table_name  text not null,
  data        jsonb not null,
  removed     boolean not null default false,
  imported_at timestamptz not null default now(),
  source_id   text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, table_name, source_id)
);
alter table public.import_baseline enable row level security;
revoke all on table public.import_baseline from anon, public;
grant select, insert, update, delete on table public.import_baseline to authenticated;
grant select, insert, update, delete on table public.import_baseline to service_role;  -- secret key (import), bypasses RLS
call private.add_owner_policies('public.import_baseline');
