-- Life Hub · 0019 · accounts, contract step (decision 18.11.2026; expand–contract, step three of three).
-- No version in use writes the old text «Счёт» any more (the app since 0018 writes account_id / envelope_id only):
-- the text columns go, with them the old unique of «Остатки» per day and text and the linking of the text in the
-- triggers. A transfer after the start by accounts (18.11) is «откуда → куда» in the base too.

-- ───────────────────────────── the triggers again, without the old text ─────────────────────────────
-- (their column lists named `account`: they are recreated before the column goes)
create or replace function private.check_transaction_accounts()
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
drop trigger transactions_check_accounts on public.transactions;
create trigger transactions_check_accounts
  before insert or update of kind, date, amount_eur, account_id, to_account_id on public.transactions
  for each row execute function private.check_transaction_accounts();

create or replace function private.check_recurring_accounts()
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
drop trigger recurring_check_accounts on public.recurring;
create trigger recurring_check_accounts
  before insert or update of kind, account_id, to_account_id on public.recurring
  for each row execute function private.check_recurring_accounts();

-- ───────────────────────────── the old text «Счёт» ─────────────────────────────
alter table public.transactions drop column account;
alter table public.recurring drop column account;
-- with it go the old unique per day and text and its non-empty check; rows before the start keep legacy_account
alter table public.actual_balances drop column account;
alter table public.actual_balances
  add constraint actual_balances_target_check check (account_id is not null or envelope_id is not null or legacy_account is not null);

-- ───────────────────────────── «откуда → куда» ─────────────────────────────
-- history up to the start (the end of 18.11) stays as it was
alter table public.transactions
  add constraint transactions_transfer_check check (
    kind <> 'transfer' or date <= date '2026-11-18'
    or (account_id is not null and to_account_id is not null and account_id <> to_account_id));
alter table public.recurring
  add constraint recurring_transfer_check check (
    kind <> 'transfer' or (account_id is not null and to_account_id is not null and account_id <> to_account_id));
