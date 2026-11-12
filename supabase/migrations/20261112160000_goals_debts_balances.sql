-- Life Hub · 0011 · money model of docs/EXCEL_FORMAT.md: envelope or goal, debts, real balances,
-- «Статус» / «Вид» / «Неделя» / «Долг» of operations. Changes data: pots become goals, week_budget becomes entry_kind.

-- ───────────────────────────── envelopes: envelope | goal ─────────────────────────────
alter table public.envelopes drop constraint envelopes_type_check;
update public.envelopes set type = 'goal' where type = 'pot';
alter table public.envelopes
  add constraint envelopes_type_check check (type in ('envelope', 'goal')),
  add column goal_eur  numeric(10, 2) check (goal_eur > 0),   -- «Цель»: the amount to save up to
  add column goal_date date;                                   -- «Срок»
-- «Сейчас на счету» of a goal is never stored here: the latest row of actual_balances for it.

-- ───────────────────────────── debts ─────────────────────────────
create table public.debts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  who         text not null check (length(btrim(who)) > 0),
  direction   text not null check (direction in ('i_owe', 'owed_to_me', 'from_pot')),  -- я должна / мне должны / заём из копилки
  amount_eur  numeric(10, 2) not null check (amount_eur > 0),
  repaid_eur  numeric(10, 2) check (repaid_eur >= 0),   -- «Возвращено» as written; operations linked by debt_id win
  due_date    date,
  status      text not null default 'open' check (status in ('open', 'closed')),
  pot_id      uuid references public.envelopes (id) on delete set null,  -- «Копилка» for «заём из копилки»
  note        text,
  source_id   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (direction <> 'from_pot' or pot_id is not null),
  unique (user_id, source_id)
);
alter table public.debts enable row level security;
revoke all on table public.debts from anon, public;
grant select, insert, update, delete on table public.debts to authenticated;
grant select, insert, update, delete on table public.debts to service_role;  -- secret key (import), bypasses RLS
call private.add_owner_policies('public.debts');

-- ───────────────────────────── actual_balances («Остатки») ─────────────────────────────
-- Real balances on a date — the one source for the reconciliation and for goals. An account (Revolut …)
-- or a pocket (envelope_id of a goal). The Sunday review writes here too.
create table public.actual_balances (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date         date not null,
  account      text not null check (length(btrim(account)) > 0),  -- account name, or the goal's Excel ID for a pocket
  envelope_id  uuid references public.envelopes (id) on delete cascade,
  amount_eur   numeric(10, 2) not null check (amount_eur >= 0),
  origin       text not null default 'review' check (origin in ('excel', 'review')),
  source_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, date, account),
  unique (user_id, source_id)
);
alter table public.actual_balances enable row level security;
revoke all on table public.actual_balances from anon, public;
grant select, insert, update, delete on table public.actual_balances to authenticated;
grant select, insert, update, delete on table public.actual_balances to service_role;  -- secret key (import), bypasses RLS
call private.add_owner_policies('public.actual_balances');
create index actual_balances_user_date_idx on public.actual_balances (user_id, date);

-- ───────────────────────────── transactions: «Вид», «Неделя», «Долг» ─────────────────────────────
-- «Статус» is is_planned / confirmed_at as before (факт = not planned or confirmed).
alter table public.transactions
  add column entry_kind text not null default 'one_off' check (entry_kind in ('one_off', 'week_budget', 'week_total')),
  add column week_no    integer check (week_no > 0),
  add column debt_id    uuid references public.debts (id) on delete set null;
update public.transactions
set entry_kind = case when is_planned and confirmed_at is null then 'week_budget' else 'week_total' end
where week_budget;
alter table public.transactions drop column week_budget;
