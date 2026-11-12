-- Life Hub · 0012 · 0010 cleared the accounts guessed from «Календарь» in the base; the importer's baseline still
-- remembers them. Clear them there too, or the first import with a «Счёт» column would see an app edit on every
-- operation that had a guessed account. Bookkeeping table only — no data the app shows.
update public.import_baseline
set data = jsonb_set(data, '{fields,account}', 'null'::jsonb)
where table_name = 'transactions' and data -> 'fields' ->> 'account' is not null;
