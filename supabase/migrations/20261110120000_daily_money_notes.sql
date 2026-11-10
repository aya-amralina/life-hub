-- Life Hub · 0002 · daily logs, glow-up stages, money (transactions, week limits, envelopes), notes
-- Access rule (CLAUDE.md): RLS on; authenticated — CRUD on own rows; anon — nothing; service_role — importer.

-- ───────────────────────────── daily_logs ─────────────────────────────
-- One row per day: habits, movement, care, how I feel. Rule 13: minimum_mode counts the day as done.
create table public.daily_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date          date not null,
  morning       boolean not null default false,   -- Утренний старт
  outside       boolean not null default false,   -- 10 мин на улице
  water         boolean not null default false,   -- Вода 1,5–2 л
  workout_type  text,                              -- Силовая A / Силовая B / Минимум 15 мин / Группа USC / …
  workout_min   integer check (workout_min between 0 and 600),
  body_cream    boolean not null default false,
  face_evening  text,                              -- Ретиноид / Азелаинка / Пропуск
  energy        smallint check (energy between 1 and 10),
  slump         boolean,                           -- провал после обеда
  sleep_h       numeric(3, 1) check (sleep_h between 0 and 24),
  mood          smallint check (mood between 1 and 10),
  minimum_mode  boolean not null default false,
  note          text,
  source_id     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, date),
  unique (user_id, source_id)
);
alter table public.daily_logs enable row level security;
revoke all on table public.daily_logs from anon, public;
grant select, insert, update, delete on table public.daily_logs to authenticated;
grant select, insert, update, delete on table public.daily_logs to service_role;  -- secret key (import), bypasses RLS
call private.add_owner_policies('public.daily_logs');

-- ───────────────────────────── plan_stages ─────────────────────────────
-- Rule 12: the stage is picked by date and defines the habits shown and the week targets.
create table public.plan_stages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sphere      text not null default 'body' check (sphere in ('work', 'study', 'body', 'money', 'personal')),
  name        text not null check (length(btrim(name)) > 0),
  start_date  date not null,
  end_date    date not null,
  habits      text[] not null default '{}',     -- keys: morning, outside, water
  targets     jsonb not null default '{}',
  source_id   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date >= start_date),
  unique (user_id, source_id)
);
alter table public.plan_stages enable row level security;
revoke all on table public.plan_stages from anon, public;
grant select, insert, update, delete on table public.plan_stages to authenticated;
grant select, insert, update, delete on table public.plan_stages to service_role;  -- secret key (import), bypasses RLS
call private.add_owner_policies('public.plan_stages');
create index plan_stages_user_dates_idx on public.plan_stages (user_id, start_date, end_date);

-- ───────────────────────────── envelopes ─────────────────────────────
-- Rule 4: envelopes / pots are outside the weekly limit.
create table public.envelopes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (length(btrim(name)) > 0),
  type         text not null default 'envelope' check (type in ('envelope', 'pot')),
  planned_eur  numeric(10, 2) check (planned_eur >= 0),
  when_text    text,
  note         text,
  archived     boolean not null default false,
  source_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, source_id)
);
alter table public.envelopes enable row level security;
revoke all on table public.envelopes from anon, public;
grant select, insert, update, delete on table public.envelopes to authenticated;
grant select, insert, update, delete on table public.envelopes to service_role;  -- secret key (import), bypasses RLS
call private.add_owner_policies('public.envelopes');

-- ───────────────────────────── transactions ─────────────────────────────
-- Amount is always positive; the sign comes from kind (rule 1).
create table public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date          date not null,
  amount_eur    numeric(10, 2) not null check (amount_eur > 0),
  kind          text not null check (kind in ('opening', 'income', 'expense', 'transfer')),
  grp           text check (grp in ('Доход', 'Обязательное', 'Поездки и события', 'Долги', 'Жизнь', 'Буфер')),
  category      text check (category in ('Продукты', 'Кофейни и перекусы', 'Выходы и еда вне дома', 'Мелочи', 'Шопинг', 'Доставка')),
  account       text,
  envelope_id   uuid references public.envelopes (id) on delete set null,
  title         text not null check (length(btrim(title)) > 0),
  is_planned    boolean not null default false,
  confirmed_at  timestamptz,
  note          text,
  source_id     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, source_id)
);
alter table public.transactions enable row level security;
revoke all on table public.transactions from anon, public;
grant select, insert, update, delete on table public.transactions to authenticated;
grant select, insert, update, delete on table public.transactions to service_role;  -- secret key (import), bypasses RLS
call private.add_owner_policies('public.transactions');
create index transactions_user_date_idx on public.transactions (user_id, date);
create index transactions_envelope_idx on public.transactions (envelope_id);

-- ───────────────────────────── week_limits ─────────────────────────────
create table public.week_limits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_id     uuid not null references public.weeks (id) on delete cascade,
  category    text not null check (category in ('Продукты', 'Кофейни и перекусы', 'Выходы и еда вне дома', 'Мелочи', 'Шопинг', 'Доставка')),
  limit_eur   numeric(10, 2) not null check (limit_eur >= 0),
  source_id   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, week_id, category),
  unique (user_id, source_id)
);
alter table public.week_limits enable row level security;
revoke all on table public.week_limits from anon, public;
grant select, insert, update, delete on table public.week_limits to authenticated;
grant select, insert, update, delete on table public.week_limits to service_role;  -- secret key (import), bypasses RLS
call private.add_owner_policies('public.week_limits');

-- ───────────────────────────── notes ─────────────────────────────
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sphere      text not null check (sphere in ('work', 'study', 'body', 'money', 'personal')),
  title       text not null check (length(btrim(title)) > 0),
  body_md     text,
  pinned      boolean not null default false,
  source_id   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, source_id)
);
alter table public.notes enable row level security;
revoke all on table public.notes from anon, public;
grant select, insert, update, delete on table public.notes to authenticated;
grant select, insert, update, delete on table public.notes to service_role;  -- secret key (import), bypasses RLS
call private.add_owner_policies('public.notes');
create index notes_user_sphere_idx on public.notes (user_id, sphere);
