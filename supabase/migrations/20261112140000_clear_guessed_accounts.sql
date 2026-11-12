-- Life Hub · 0010 · the account of an imported operation came from matching «Календарь» rows by amount and date —
-- a guess. «Статьи» has no account column yet (docs/EXCEL_FORMAT.md adds «Счёт»), so imported operations show no
-- account until the table says it. Expenses added in the app keep theirs.
update public.transactions set account = null where source_id like 'budget:%' and account is not null;
