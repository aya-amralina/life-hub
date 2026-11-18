-- Life Hub · 0016 · accounts (decision 18.11.2026). Every Revolut pocket is an account of its own; accounts are in
-- groups: «Баланс» (balance — the plan and the forecast are counted on it), «Подушка» (cushion — its own forecast),
-- «Отдельно» (separate — overview only). Operations, rules, envelopes, debts and «Остатки» point at accounts in 0017.

create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  grp         text not null check (grp in ('balance', 'cushion', 'separate')),
  sort_order  integer not null default 0,
  archived    boolean not null default false,
  source_id   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name),
  unique (user_id, source_id)
);
alter table public.accounts enable row level security;
revoke all on table public.accounts from anon, public;
grant select, insert, update, delete on table public.accounts to authenticated;
grant select, insert, update, delete on table public.accounts to service_role;  -- secret key (import, backup), bypasses RLS
call private.add_owner_policies('public.accounts');

-- The nine accounts of the decision, for every user (the one user and the test user); the same list is
-- ACCOUNT_SEED in src/lib/constants.ts (tests/unit/migrations.test.ts keeps them equal).
insert into public.accounts (user_id, name, grp, sort_order, source_id)
select u.id, a.name, a.grp, a.sort_order, a.source_id
from auth.users u
cross join (values
  ('Revolut · Основной',  'balance',  10, 'acct:revolut-main'),
  ('Revolut · На месяц',  'balance',  20, 'acct:revolut-month'),
  ('Sparkasse',           'balance',  30, 'acct:sparkasse'),
  ('Наличные',            'balance',  40, 'acct:cash'),
  ('Revolut · Подушка',   'cushion',  50, 'acct:revolut-cushion'),
  ('Казахстанская карта', 'cushion',  60, 'acct:kz-card'),
  ('Revolut · Депозит',   'separate', 70, 'acct:revolut-deposit'),
  ('Revolut · Конверты',  'separate', 80, 'acct:revolut-envelopes'),
  ('Revolut · Поездки',   'separate', 90, 'acct:revolut-trips')
) as a (name, grp, sort_order, source_id)
on conflict (user_id, name) do nothing;
