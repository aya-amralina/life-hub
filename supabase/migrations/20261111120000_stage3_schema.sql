-- Life Hub · 0003 · stage 3 schema: deadline kinds and rollover on items, cancelled planned operations,
-- minimum set per glow-up stage, activities with score, intake, people, strength, measurements, wishlist, reviews.
-- Access rule (CLAUDE.md): RLS on; authenticated — CRUD on own rows; anon — nothing; service_role — importer.

-- ───────────────────────────── items: deadline kinds, rollover ─────────────────────────────
-- Kind is derived from the filled fields (SPEC §3): none — open; happens_on — on a day; starts_on — from a date;
-- due_date — deadline. starts_on can be combined with due_date.
alter table public.items
  add column starts_on      date,
  add column happens_on     date,
  add column happens_time   time,
  -- Study: null = automatic (fixed when there is an official deadline, rule 19), true/false = set on the card.
  add column is_fixed       boolean,
  add column rollover_count integer not null default 0 check (rollover_count >= 0),
  add constraint items_starts_before_due check (starts_on is null or due_date is null or starts_on <= due_date);

create index items_user_happens_idx on public.items (user_id, happens_on) where happens_on is not null;

-- ───────────────────────────── transactions: cancelled planned operation ─────────────────────────────
-- «Отменить» on «Пришло? / Списалось?» keeps the row (the importer upserts by source_id) but takes it out of the plan.
alter table public.transactions add column cancelled_at timestamptz;

-- ───────────────────────────── plan_stages: minimum set ─────────────────────────────
-- Rule 13: in «минимум» only these habits are shown; the day counts when all of them are marked.
alter table public.plan_stages add column minimum_habits text[] not null default '{water,outside}';

-- ───────────────────────────── activity_types ─────────────────────────────
-- Rule 25: score = minutes / 10 × points_per_10min. Defaults: лёгкая 1, средняя 2, интенсивная 3.
create table public.activity_types (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null check (length(btrim(name)) > 0),
  intensity         text not null default 'средняя' check (intensity in ('лёгкая', 'средняя', 'интенсивная')),
  points_per_10min  numeric(4, 1) not null default 2 check (points_per_10min >= 0),
  active            boolean not null default true,
  sort_order        integer not null default 0,
  source_id         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, name),
  unique (user_id, source_id)
);
alter table public.activity_types enable row level security;
revoke all on table public.activity_types from anon, public;
grant select, insert, update, delete on table public.activity_types to authenticated;
grant select, insert, update, delete on table public.activity_types to service_role;  -- secret key (import), bypasses RLS
call private.add_owner_policies('public.activity_types');

-- ───────────────────────────── activities ─────────────────────────────
-- Several per day. minutes null = not noted (scores 0).
create table public.activities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  type_id     uuid not null references public.activity_types (id) on delete restrict,
  minutes     integer check (minutes between 1 and 600),
  note        text,
  source_id   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, source_id)
);
alter table public.activities enable row level security;
revoke all on table public.activities from anon, public;
grant select, insert, update, delete on table public.activities to authenticated;
grant select, insert, update, delete on table public.activities to service_role;  -- secret key (import), bypasses RLS
call private.add_owner_policies('public.activities');
create index activities_user_date_idx on public.activities (user_id, date);
create index activities_type_idx on public.activities (type_id);

-- ───────────────────────────── intake ─────────────────────────────
-- Periods, not daily marks. Rule 26: active if start_date ≤ today and (end_date is null or ≥ today).
create table public.intake (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  kind        text not null default 'витамин' check (kind in ('витамин', 'лекарство', 'другое')),
  dose        text,
  schedule    text,
  start_date  date not null,
  end_date    date,
  note        text,
  source_id   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  unique (user_id, source_id)
);
alter table public.intake enable row level security;
revoke all on table public.intake from anon, public;
grant select, insert, update, delete on table public.intake to authenticated;
grant select, insert, update, delete on table public.intake to service_role;  -- secret key (import), bypasses RLS
call private.add_owner_policies('public.intake');

-- ───────────────────────────── people ─────────────────────────────
-- Work contacts («Legende»): rule 10 counts open waits per person.
create table public.people (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  role        text,
  source_id   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name),
  unique (user_id, source_id)
);
alter table public.people enable row level security;
revoke all on table public.people from anon, public;
grant select, insert, update, delete on table public.people to authenticated;
grant select, insert, update, delete on table public.people to service_role;  -- secret key (import), bypasses RLS
call private.add_owner_policies('public.people');

-- ───────────────────────────── strength_sets ─────────────────────────────
create table public.strength_sets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date         date not null,
  workout      text,                               -- A / B / …
  exercise     text not null check (length(btrim(exercise)) > 0),
  reps         integer[] not null default '{}',    -- reps per set
  load         text,                               -- «8 кг», «резинка» — as written
  hard_at_end  boolean,
  note         text,
  source_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, source_id)
);
alter table public.strength_sets enable row level security;
revoke all on table public.strength_sets from anon, public;
grant select, insert, update, delete on table public.strength_sets to authenticated;
grant select, insert, update, delete on table public.strength_sets to service_role;  -- secret key (import), bypasses RLS
call private.add_owner_policies('public.strength_sets');
create index strength_sets_user_date_idx on public.strength_sets (user_id, date);

-- ───────────────────────────── measurements ─────────────────────────────
-- Photos are never stored — only «photo taken» marks.
create table public.measurements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  waist_cm    numeric(5, 1) check (waist_cm > 0),
  hips_cm     numeric(5, 1) check (hips_cm > 0),
  thigh_cm    numeric(5, 1) check (thigh_cm > 0),
  arm_cm      numeric(5, 1) check (arm_cm > 0),
  weight_kg   numeric(5, 1) check (weight_kg > 0),
  photo_body  boolean not null default false,
  photo_face  boolean not null default false,
  photo_part  boolean not null default false,
  note        text,
  source_id   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, date),
  unique (user_id, source_id)
);
alter table public.measurements enable row level security;
revoke all on table public.measurements from anon, public;
grant select, insert, update, delete on table public.measurements to authenticated;
grant select, insert, update, delete on table public.measurements to service_role;  -- secret key (import), bypasses RLS
call private.add_owner_policies('public.measurements');

-- ───────────────────────────── wishlist ─────────────────────────────
-- Rule 5: 48 hours without a decision → «всё ещё нужно?».
create table public.wishlist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (length(btrim(title)) > 0),
  price_eur   numeric(10, 2) check (price_eur >= 0),
  added_at    timestamptz not null default now(),
  decision    text check (decision in ('buy', 'skip')),
  decided_at  timestamptz,
  source_id   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, source_id)
);
alter table public.wishlist enable row level security;
revoke all on table public.wishlist from anon, public;
grant select, insert, update, delete on table public.wishlist to authenticated;
grant select, insert, update, delete on table public.wishlist to service_role;  -- secret key (import), bypasses RLS
call private.add_owner_policies('public.wishlist');

-- ───────────────────────────── reviews ─────────────────────────────
create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_id       uuid not null references public.weeks (id) on delete cascade,
  answers       jsonb not null default '{}',
  balances      jsonb not null default '{}',
  impulse_note  text,
  week_thought  text,
  completed_at  timestamptz,
  source_id     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, week_id),
  unique (user_id, source_id)
);
alter table public.reviews enable row level security;
revoke all on table public.reviews from anon, public;
grant select, insert, update, delete on table public.reviews to authenticated;
grant select, insert, update, delete on table public.reviews to service_role;  -- secret key (import), bypasses RLS
call private.add_owner_policies('public.reviews');
