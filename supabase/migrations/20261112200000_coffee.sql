-- Life Hub · 0013 · coffee in the evening block: null — not answered, 0 — no coffee today, N — cups.
alter table public.daily_logs
  add column coffee_cups smallint check (coffee_cups between 0 and 20);
