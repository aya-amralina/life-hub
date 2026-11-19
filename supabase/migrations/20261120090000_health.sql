-- Life Hub · 0024 · «Тело», шаг 5: «Здоровье» (decisions of 19–20.11.2026).
--   intake  — the time of taking (утро / вечер; everything «утро» for now) and an optional «курс до»; doses in one
--             unit style (мкг, мг);
--   item_series + items.series_id / step — repeats («Замеры», каждые 4 недели) and chains of steps (body comp,
--             doctors: записаться → визит → анализы → результаты). Every event stays its own item («Состоялось?»,
--             the calendar and «Горит» are unchanged); the screen shows a series as one line, a doctor as one card;
--   «Замеры» move to the finger-test days (17.12, 14.01, 11.02, 11.03, 08.04; 18.04 stays — the body comp target);
--   «Начать ниацинамид (через утро)» is closed — it is a habit now.

-- ───────────────────────────── intake ─────────────────────────────
alter table public.intake
  add column time_of_day  text check (time_of_day in ('morning', 'evening')),
  add column course_until date,
  add constraint intake_course_check check (course_until is null or course_until >= start_date);

update public.intake set time_of_day = 'morning' where time_of_day is null;

-- «290microgramm» → «290 мкг», «3 microgramm» → «3 мкг», «14 mg» → «14 мг», «4,5 mg» → «4,5 мг»
update public.intake
set dose = btrim(regexp_replace(regexp_replace(dose, '\s*(microgramm|micrograms?|mcg|µg|ug)\y', ' мкг', 'gi'), '\s*mg\y', ' мг', 'gi'))
where dose ~* '(microgramm|microgram|mcg|µg|ug|mg)\y';

-- ───────────────────────────── item_series ─────────────────────────────
-- kind: repeat — the same event again and again (cadence in words: «каждые 4 недели»); chain — steps one after another.
create table public.item_series (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sphere       text not null default 'body',
  kind         text not null check (kind in ('repeat', 'chain')),
  title        text not null check (length(btrim(title)) > 0),
  cadence      text,
  sort_order   integer not null default 0,
  archived_at  timestamptz,
  source_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, source_id)
);
alter table public.item_series enable row level security;
revoke all on table public.item_series from anon, public;
grant select, insert, update, delete on table public.item_series to authenticated;
grant select, insert, update, delete on table public.item_series to service_role;  -- secret key (backup), bypasses RLS
call private.add_owner_policies('public.item_series');

alter table public.items
  add column series_id uuid references public.item_series (id) on delete set null,
  add column step      text check (step in ('записаться', 'визит', 'анализы', 'результаты', 'сделать'));
create index items_series_idx on public.items (series_id);

-- The series of the glow-up plan, for users who have its items.
insert into public.item_series (user_id, source_id, kind, title, cadence, sort_order)
select distinct i.user_id, s.source_id, s.kind, s.title, s.cadence, s.sort_order
from public.items i
join (values
  ('series:measure',      'repeat', 'Замеры',    'каждые 4 недели', 10, 'glow:measure-day:2026-12-06'),
  ('series:body-comp',    'chain',  'Body comp', null,              20, 'glow:task:22e32da408de'),
  ('series:hausarzt',     'chain',  'Hausarzt',  null,              30, 'glow:visit:479ed83e298c'),
  ('series:hautarzt',     'chain',  'Hautarzt',  null,              40, 'glow:visit:6b40a77ddb71'),
  ('series:psychiatrist', 'chain',  'Психиатр',  null,              60, 'glow:visit:83afda185797')
) as s (source_id, kind, title, cadence, sort_order, item_source) on i.source_id = s.item_source
on conflict (user_id, source_id) do nothing;

insert into public.item_series (user_id, source_id, kind, title, sort_order)
select distinct i.user_id, 'series:gynecologist', 'chain', 'Гинеколог', 50
from public.items i
where i.sphere = 'body' and i.title = 'Записаться к гинекологу и сделать тесты'
on conflict (user_id, source_id) do nothing;

-- Items → their series and step.
update public.items i
set series_id = s.id, step = m.step
from (values
  ('glow:measure-day:2026-12-06', 'series:measure',      null),
  ('glow:measure-day:2027-01-10', 'series:measure',      null),
  ('glow:measure-day:2027-02-07', 'series:measure',      null),
  ('glow:measure-day:2027-03-07', 'series:measure',      null),
  ('glow:measure-day:2027-04-04', 'series:measure',      null),
  ('glow:measure-day:2027-04-18', 'series:measure',      null),
  ('glow:task:22e32da408de',      'series:body-comp',    'записаться'),  -- Записаться на повторный body comp
  ('glow:task:db22f9cb6933',      'series:body-comp',    'сделать'),     -- Повторный body comp
  ('glow:task:1396ce172916',      'series:body-comp',    'записаться'),  -- Записаться на body comp в апреле
  ('glow:task:66a05406abb3',      'series:body-comp',    'сделать'),     -- Body comp: цель апреля
  ('glow:task:300165e2e1e7',      'series:hausarzt',     'записаться'),  -- Записаться к Hausarzt через Doctolib (анализы)
  ('glow:visit:479ed83e298c',     'series:hausarzt',     'визит'),       -- Hausarzt
  ('glow:task:a5ca18e747ba',      'series:hausarzt',     'анализы'),     -- Сдать анализы у Hausarzt
  ('glow:task:87b0ec843e96',      'series:hausarzt',     'результаты'),  -- Взять результаты анализов в Казахстан
  ('glow:visit:6b40a77ddb71',     'series:hautarzt',     'записаться'),  -- Hautarzt (визит без даты)
  ('glow:task:6b40a77ddb71',      'series:hautarzt',     'визит'),       -- Hautarzt до 20.12
  ('glow:task:95f3f9bbb21f',      'series:hautarzt',     'записаться'),  -- Записаться к Hautarzt через Doctolib (отменено — история)
  ('glow:visit:83afda185797',     'series:psychiatrist', 'записаться'),  -- Психиатр (визит без даты)
  ('glow:task:05a1ea53a9aa',      'series:psychiatrist', 'визит')        -- Психиатр в Казахстане
) as m (item_source, series_source, step)
join public.item_series s on s.source_id = m.series_source
where i.source_id = m.item_source and i.user_id = s.user_id;

update public.items i
set series_id = s.id, step = 'записаться'
from public.item_series s
where s.source_id = 'series:gynecologist' and s.user_id = i.user_id
  and i.sphere = 'body' and i.title = 'Записаться к гинекологу и сделать тесты';

-- «Замеры» on the finger-test days (only rows still on their old day; 18.04 stays).
update public.items i
set happens_on = m.new_day
from (values
  ('glow:measure-day:2026-12-06', date '2026-12-06', date '2026-12-17'),
  ('glow:measure-day:2027-01-10', date '2027-01-10', date '2027-01-14'),
  ('glow:measure-day:2027-02-07', date '2027-02-07', date '2027-02-11'),
  ('glow:measure-day:2027-03-07', date '2027-03-07', date '2027-03-11'),
  ('glow:measure-day:2027-04-04', date '2027-04-04', date '2027-04-08')
) as m (item_source, old_day, new_day)
where i.source_id = m.item_source and i.happens_on = m.old_day;

-- «Начать ниацинамид (через утро)» is a habit now.
update public.items
set status = 'Отменено',
    notes = concat_ws(E'\n', nullif(notes, ''), 'Теперь привычка (20.11.2026).')
where source_id = 'glow:task:77933eba64f2' and done_at is null and status <> 'Отменено';
