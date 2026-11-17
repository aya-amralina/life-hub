-- Life Hub · 0015 · recurring operations (decision 16.11.2026). A rule produces virtual planned operations up to
-- the forecast horizon; they are never stored. An answer to one («Пришло? / Списалось?», another date, out of the
-- plan, an edit) creates a real row of transactions with recurring_id + occurrence_date, which closes that
-- occurrence in any state, cancelled included.

-- ───────────────────────────── recurring ─────────────────────────────
create table public.recurring (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null check (length(btrim(title)) > 0),
  amount_eur   numeric(10, 2) not null check (amount_eur > 0),
  kind         text not null check (kind in ('income', 'expense', 'transfer')),
  grp          text check (grp in ('Доход', 'Обязательное', 'Поездки и события', 'Долги', 'Жизнь', 'Буфер')),
  account      text,
  envelope_id  uuid references public.envelopes (id) on delete set null,
  freq         text not null check (freq in ('weekly', 'monthly', 'yearly')),
  interval_n   integer not null default 1 check (interval_n > 0),  -- every N weeks / months / years
  anchor_date  date not null,                                        -- the first occurrence; the day of month / week comes from it
  end_date     date,                                                 -- the last day an occurrence may fall on; null — no end
  active       boolean not null default true,                        -- false — paused: no unanswered occurrences at all
  note         text,
  source_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_date is null or end_date >= anchor_date),
  check (kind = 'expense' or envelope_id is null),
  unique (user_id, source_id)
);
alter table public.recurring enable row level security;
revoke all on table public.recurring from anon, public;
grant select, insert, update, delete on table public.recurring to authenticated;
grant select, insert, update, delete on table public.recurring to service_role;  -- secret key (import, backup), bypasses RLS
call private.add_owner_policies('public.recurring');
create index recurring_envelope_idx on public.recurring (envelope_id);

-- ───────────────────────────── transactions: which occurrence a row answers ─────────────────────────────
-- Deleting a rule keeps its real rows as ordinary operations (recurring_id → null).
alter table public.transactions
  add column recurring_id    uuid references public.recurring (id) on delete set null,
  add column occurrence_date date,  -- the occurrence's own date; the row's date may differ (moved)
  add constraint transactions_occurrence_check check (recurring_id is null or occurrence_date is not null);
create unique index transactions_recurring_occurrence_key
  on public.transactions (user_id, recurring_id, occurrence_date) where recurring_id is not null;
create index transactions_recurring_idx on public.transactions (recurring_id);
