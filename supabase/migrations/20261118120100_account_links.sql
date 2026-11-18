-- Life Hub · 0017 · accounts, expand step (decision 18.11.2026). Operations, rules, envelopes, debts and «Остатки»
-- get links to accounts; nothing is dropped or renamed, so the version before it keeps working until the phone is
-- updated. The old text «Счёт» (`account`) goes in 0018 (contract), together with the «откуда → куда» check of
-- transfers. A row with only the old text and no account_id counts as «Баланс».

-- ───────────────────────────── transactions ─────────────────────────────
alter table public.transactions
  add column account_id    uuid references public.accounts (id) on delete restrict,
  add column to_account_id uuid references public.accounts (id) on delete restrict;  -- a transfer: «куда»
-- Revolut → Revolut · Основной, the rest by name; rows without a «Счёт» stay without an account
update public.transactions t
set account_id = a.id
from public.accounts a
where a.user_id = t.user_id
  and a.name = case t.account when 'Revolut' then 'Revolut · Основной' else t.account end;
do $$ begin
  if exists (select 1 from public.transactions where account is not null and account_id is null) then
    raise exception 'transactions: a «Счёт» without an account';
  end if;
end $$;
alter table public.transactions
  add constraint transactions_to_account_check check (kind = 'transfer' or to_account_id is null);
-- Dispo: the start of an account of «Баланс» may be below zero (the group is checked by the trigger below)
alter table public.transactions drop constraint transactions_amount_eur_check;
alter table public.transactions
  add constraint transactions_amount_check check (amount_eur > 0 or (kind = 'opening' and amount_eur <> 0));
create index transactions_account_idx on public.transactions (account_id);
create index transactions_to_account_idx on public.transactions (to_account_id);

-- ───────────────────────────── recurring ─────────────────────────────
alter table public.recurring
  add column account_id    uuid references public.accounts (id) on delete restrict,
  add column to_account_id uuid references public.accounts (id) on delete restrict;
update public.recurring r
set account_id = a.id
from public.accounts a
where a.user_id = r.user_id
  and a.name = case r.account when 'Revolut' then 'Revolut · Основной' else r.account end;
do $$ begin
  if exists (select 1 from public.recurring where account is not null and account_id is null) then
    raise exception 'recurring: a «Счёт» without an account';
  end if;
end $$;
alter table public.recurring
  add constraint recurring_to_account_check check (kind = 'transfer' or to_account_id is null);

-- ───────────────────────────── where set-aside money lies ─────────────────────────────
-- A goal lives only on an account of «Подушка» (trigger below); an envelope or a debt («я должна») on any account.
alter table public.envelopes add column account_id uuid references public.accounts (id) on delete set null;
alter table public.debts     add column account_id uuid references public.accounts (id) on delete set null;

-- ───────────────────────────── actual_balances («Остатки») ─────────────────────────────
-- A new row is either an account (account_id) or a goal's share of its account (envelope_id, the account comes from
-- the goal) — «Внести остаток» for goals that share an account. Rows before the start keep their old label in
-- legacy_account: «Revolut» then was several of today's accounts, so it is not mapped. Until 0018 the old `account`
-- stays required and unique per day: the app writes the account's (or the goal's) name there too.
alter table public.actual_balances
  add column account_id     uuid references public.accounts (id) on delete cascade,
  add column legacy_account text;
update public.actual_balances set legacy_account = account;
alter table public.actual_balances
  add constraint actual_balances_account_day unique (user_id, date, account_id),
  add constraint actual_balances_envelope_day unique (user_id, date, envelope_id),
  add constraint actual_balances_one_target_check check (account_id is null or envelope_id is null);
-- Dispo: an account of «Баланс» may be below zero (trigger); 'start' — the balances on the start by accounts
alter table public.actual_balances drop constraint actual_balances_amount_eur_check;
alter table public.actual_balances drop constraint actual_balances_origin_check;
alter table public.actual_balances
  add constraint actual_balances_origin_check check (origin in ('excel', 'review', 'start'));
create index actual_balances_account_idx on public.actual_balances (account_id);

-- ───────────────────────────── checks across tables ─────────────────────────────
-- Trigger functions in `private` fire without schema USAGE for the caller and read `accounts` under its RLS;
-- the user_id condition keeps the secret key (no RLS) to the row's owner too.

-- 0018 drops the text «Счёт»: it replaces these two functions without the linking of the old text.

-- operations: own accounts; after the start (18.11) an expense only from «Баланс»; a start below zero only on «Баланс»
create or replace function private.check_transaction_accounts()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  g text;
begin
  -- the version before this one writes only the old text «Счёт»: link the account by the same mapping as above —
  -- a new row with the text only, or a row whose text it changed (the new version changes account_id, not the text).
  -- An unknown text, or none, leaves no account = «Баланс». 0018 drops the text and this linking with it.
  if (tg_op = 'INSERT' and new.account_id is null and new.account is not null)
     or (tg_op = 'UPDATE' and new.account is distinct from old.account and new.account_id is not distinct from old.account_id) then
    new.account_id := (
      select a.id from public.accounts a
      where a.user_id = new.user_id and a.name = case new.account when 'Revolut' then 'Revolut · Основной' else new.account end
    );
  end if;
  if new.account_id is not null then
    select a.grp into g from public.accounts a where a.id = new.account_id and a.user_id = new.user_id;
    if not found then raise exception 'account not found' using errcode = '23503'; end if;
  end if;
  if new.to_account_id is not null
     and not exists (select 1 from public.accounts a where a.id = new.to_account_id and a.user_id = new.user_id) then
    raise exception 'account not found' using errcode = '23503';
  end if;
  if new.kind = 'expense' and g is not null and g <> 'balance' and new.date > date '2026-11-18' then
    raise exception 'expenses only from «Баланс» accounts' using errcode = '23514';
  end if;
  if new.kind = 'opening' and new.amount_eur < 0 and g is distinct from 'balance' then
    raise exception 'below zero only on «Баланс» accounts' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger transactions_check_accounts
  before insert or update of kind, date, amount_eur, account, account_id, to_account_id on public.transactions
  for each row execute function private.check_transaction_accounts();

-- recurring operations: own accounts; an expense only from «Баланс»
create or replace function private.check_recurring_accounts()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  g text;
begin
  -- the version before this one writes only the old text «Счёт»: link the account by the same mapping as above —
  -- a new row with the text only, or a row whose text it changed (the new version changes account_id, not the text).
  -- An unknown text, or none, leaves no account = «Баланс». 0018 drops the text and this linking with it.
  if (tg_op = 'INSERT' and new.account_id is null and new.account is not null)
     or (tg_op = 'UPDATE' and new.account is distinct from old.account and new.account_id is not distinct from old.account_id) then
    new.account_id := (
      select a.id from public.accounts a
      where a.user_id = new.user_id and a.name = case new.account when 'Revolut' then 'Revolut · Основной' else new.account end
    );
  end if;
  if new.account_id is not null then
    select a.grp into g from public.accounts a where a.id = new.account_id and a.user_id = new.user_id;
    if not found then raise exception 'account not found' using errcode = '23503'; end if;
  end if;
  if new.to_account_id is not null
     and not exists (select 1 from public.accounts a where a.id = new.to_account_id and a.user_id = new.user_id) then
    raise exception 'account not found' using errcode = '23503';
  end if;
  if new.kind = 'expense' and g is not null and g <> 'balance' then
    raise exception 'expenses only from «Баланс» accounts' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger recurring_check_accounts
  before insert or update of kind, account, account_id, to_account_id on public.recurring
  for each row execute function private.check_recurring_accounts();

-- envelopes and goals: own account; a goal only on «Подушка»
create or replace function private.check_envelope_account()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  g text;
begin
  if new.account_id is not null then
    select a.grp into g from public.accounts a where a.id = new.account_id and a.user_id = new.user_id;
    if not found then raise exception 'account not found' using errcode = '23503'; end if;
    if new.type = 'goal' and g <> 'cushion' then
      raise exception 'a goal lives only on «Подушка» accounts' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger envelopes_check_account
  before insert or update of type, account_id on public.envelopes
  for each row execute function private.check_envelope_account();

-- debts: own account
create or replace function private.check_debt_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.account_id is not null
     and not exists (select 1 from public.accounts a where a.id = new.account_id and a.user_id = new.user_id) then
    raise exception 'account not found' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger debts_check_account
  before insert or update of account_id on public.debts
  for each row execute function private.check_debt_account();

-- «Остатки»: own account; below zero only for an account of «Баланс» (never for a goal's share)
create or replace function private.check_balance_account()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  g text;
begin
  if new.account_id is not null then
    select a.grp into g from public.accounts a where a.id = new.account_id and a.user_id = new.user_id;
    if not found then raise exception 'account not found' using errcode = '23503'; end if;
  end if;
  if new.amount_eur < 0 and g is distinct from 'balance' then
    raise exception 'below zero only on «Баланс» accounts' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger actual_balances_check_account
  before insert or update of amount_eur, account_id on public.actual_balances
  for each row execute function private.check_balance_account();
