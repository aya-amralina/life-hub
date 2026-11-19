-- Life Hub · 0018 · «Остатки»: the old text «Счёт» becomes optional (decision 18.11.2026, expand–contract).
-- The app from now on writes only account_id (an account) or envelope_id (a goal's share); the version before it
-- still writes the text too — both work. The text columns, the old unique per day and text, the linking of the old
-- text in the triggers and the «откуда → куда» check of transfers go in 0019, once no version in use needs them.
alter table public.actual_balances alter column account drop not null;
