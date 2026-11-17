-- Life Hub · 0014 · the amount that was in the plan, stored when a planned operation is confirmed
-- (decision 16.11.2026). Null for operations confirmed before this column and for plain facts.
alter table public.transactions
  add column planned_amount_eur numeric(10, 2) check (planned_amount_eur > 0);
