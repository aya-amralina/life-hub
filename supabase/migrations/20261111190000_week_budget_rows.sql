-- Life Hub · 0006 · planned weekly spending («Неделя N: …», group «Жизнь») is a budget for the week, not one debit:
-- no «Списалось?», it leaves the plan when its week is over (the week's fact = expenses from the app),
-- and in the current week the forecast takes the larger of the plan and what is already spent.
alter table public.transactions add column week_budget boolean not null default false;
