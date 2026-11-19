-- Life Hub · 0025 · money, phase 1 of docs/money-redesign.md: an envelope is paid from the money of a period.
-- A period runs from one day of money (the salary) to the next and is named by the month it covers
-- (27.11–27.12 = «Декабрь»). An envelope of a period that has not started sets nothing aside yet
-- («Запланировано»); «Отложить сейчас» (reserved_early) sets it aside from the money of today's period.
-- The status itself is computed (src/lib/rules/periods.ts), never stored. Only adds columns.

alter table public.envelopes
  add column pay_month      date check (pay_month is null or extract(day from pay_month) = 1),  -- null — set aside at once, as before
  add column reserved_early boolean not null default false;

-- Existing envelopes by their «Когда»: a month named in the text («декабрь», «конец декабря», «конец ноября»)
-- → that month, in the year of the envelope or the next one if the month is already behind it. Dates like
-- «27.10–4.11» (trips that are spent) and empty texts stay null — nothing changes for them.
update public.envelopes e
set pay_month = make_date(
      extract(year from e.created_at at time zone 'Europe/Berlin')::int
        + case when m.n < extract(month from e.created_at at time zone 'Europe/Berlin')::int then 1 else 0 end,
      m.n, 1)
from (
  select id,
         case
           when lower(when_text) ~ 'янв' then 1
           when lower(when_text) ~ 'фев' then 2
           when lower(when_text) ~ 'мар' then 3
           when lower(when_text) ~ 'апр' then 4
           when lower(when_text) ~ 'ма[йяе]' then 5
           when lower(when_text) ~ 'июн' then 6
           when lower(when_text) ~ 'июл' then 7
           when lower(when_text) ~ 'авг' then 8
           when lower(when_text) ~ 'сен' then 9
           when lower(when_text) ~ 'окт' then 10
           when lower(when_text) ~ 'ноя' then 11
           when lower(when_text) ~ 'дек' then 12
         end as n
  from public.envelopes
  where type = 'envelope' and when_text is not null
) m
where e.id = m.id and m.n is not null;
