-- Life Hub · 0021 · «Тело», шаг 2: what was code becomes data (19.11.2026).
--   habits        — habits, care and programs («Кор») in one list: time of day, frequency, minimum, order, archive;
--   habit_plan    — when a habit is active (the «этапы» keep their name, period and week targets);
--   habit_marks   — one mark per habit and day; the old marks are copied in (daily_logs.outside / water / morning, care);
--   workout_templates, workout_queue — strength templates (home / gym, steps by the «Кор» stage) and the week queue.
-- Expand only: daily_logs.outside / water / morning / care and plan_stages.habits / minimum_habits / care_items stay
-- as a reserve. Until they are dropped, two triggers keep both sides equal: a mark written the old way (an older app,
-- an offline queue from before) reaches habit_marks, a mark in habit_marks reaches the old column.

-- ───────────────────────────── habits ─────────────────────────────
-- kind: habit — a daily habit; care — care, with a group («Утро», «Вечер»: one choice in the group); program — a
-- program with its own sessions (program_id; its mark is a finished session, not a row of habit_marks).
-- freq: daily · weekdays (freq_weekdays, 1 = Пн … 7 = Вс) · every_other_day (from starts_on) · per_week (freq_per_week).
-- in_minimum — part of «Режим минимум»; minimum_note — the minimal version («только дыхание 360°»), may be empty.
-- legacy_column / legacy_care — where the old marks of this habit lived (a daily_logs column / the text in daily_logs.care).
-- Never deleted (history in charts): archived_at; the app has no delete privilege on this table.
create table public.habits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('habit', 'care', 'program')),
  name            text not null check (length(btrim(name)) > 0),
  group_name      text check (group_name is null or length(btrim(group_name)) > 0),
  time_of_day     text not null default 'any' check (time_of_day in ('morning', 'day', 'evening', 'any')),
  freq            text not null default 'daily' check (freq in ('daily', 'weekdays', 'every_other_day', 'per_week')),
  freq_weekdays   smallint[],
  freq_per_week   smallint check (freq_per_week between 1 and 7),
  starts_on       date not null,
  in_minimum      boolean not null default false,
  minimum_note    text,
  sort_order      integer not null default 0,
  icon            text,
  phrase          text,
  program_id      uuid references public.core_programs (id) on delete restrict,
  legacy_column   text check (legacy_column in ('morning', 'outside', 'water')),
  legacy_care     text,
  archived_at     timestamptz,
  source_id       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (kind = 'care' or group_name is null),
  check ((kind = 'program') = (program_id is not null)),
  check (freq <> 'weekdays' or (cardinality(freq_weekdays) > 0 and freq_weekdays <@ '{1,2,3,4,5,6,7}'::smallint[])),
  check (freq <> 'per_week' or freq_per_week is not null),
  unique (user_id, source_id)
);
alter table public.habits enable row level security;
revoke all on table public.habits from anon, public;
grant select, insert, update, delete on table public.habits to authenticated;
grant select, insert, update, delete on table public.habits to service_role;  -- secret key (backup), bypasses RLS
call private.add_owner_policies('public.habits');
revoke delete on table public.habits from authenticated;  -- archive, never delete: the marks keep their history
create unique index habits_legacy_column_key on public.habits (user_id, legacy_column) where legacy_column is not null;
create unique index habits_legacy_care_key on public.habits (user_id, legacy_care) where legacy_care is not null;

-- ───────────────────────────── habit_plan ─────────────────────────────
-- A habit is active on a day inside one of its periods (null — open end). No period — never active.
create table public.habit_plan (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id     uuid not null references public.habits (id) on delete cascade,
  from_date    date,
  to_date      date,
  source_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (from_date is null or to_date is null or to_date >= from_date),
  unique (user_id, source_id)
);
alter table public.habit_plan enable row level security;
revoke all on table public.habit_plan from anon, public;
grant select, insert, update, delete on table public.habit_plan to authenticated;
grant select, insert, update, delete on table public.habit_plan to service_role;  -- secret key (backup), bypasses RLS
call private.add_owner_policies('public.habit_plan');
create index habit_plan_habit_idx on public.habit_plan (habit_id);

-- ───────────────────────────── habit_marks ─────────────────────────────
-- One row per habit and day; unmarking writes done = false (an upsert — works offline and in order, no server id needed).
create table public.habit_marks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id     uuid not null references public.habits (id) on delete cascade,
  date         date not null,
  done         boolean not null default true,
  source_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, habit_id, date),
  unique (user_id, source_id)
);
alter table public.habit_marks enable row level security;
revoke all on table public.habit_marks from anon, public;
grant select, insert, update, delete on table public.habit_marks to authenticated;
grant select, insert, update, delete on table public.habit_marks to service_role;  -- secret key (backup), bypasses RLS
call private.add_owner_policies('public.habit_marks');
create index habit_marks_date_idx on public.habit_marks (user_id, date);

-- ───────────────────────────── workout_templates · workout_queue ─────────────────────────────
-- exercises: [{ key, name, sets (null for cardio), reps, kind?: 'cardio', detail?,
--               variants: [{ from_core_stage, home, gym }] }] — the variant of the current «Кор» stage is the last one
-- with from_core_stage ≤ that stage. code — the label of the journal (strength_sets.workout).
create table public.workout_templates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code         text not null check (length(btrim(code)) > 0),
  name         text not null check (length(btrim(name)) > 0),
  focus        text not null check (focus in ('lower', 'upper')),
  exercises    jsonb not null default '[]' check (jsonb_typeof(exercises) = 'array'),
  rules        text[] not null default '{}',
  sort_order   integer not null default 0,
  archived_at  timestamptz,
  source_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, code),
  unique (user_id, source_id)
);
alter table public.workout_templates enable row level security;
revoke all on table public.workout_templates from anon, public;
grant select, insert, update, delete on table public.workout_templates to authenticated;
grant select, insert, update, delete on table public.workout_templates to service_role;  -- secret key (backup), bypasses RLS
call private.add_owner_policies('public.workout_templates');

-- The week queue from a day on: position → template, no fixed weekdays. The latest starts_on ≤ a day wins.
create table public.workout_queue (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  starts_on    date not null,
  position     smallint not null check (position >= 1),
  template_id  uuid not null references public.workout_templates (id) on delete restrict,
  source_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, starts_on, position),
  unique (user_id, source_id)
);
alter table public.workout_queue enable row level security;
revoke all on table public.workout_queue from anon, public;
grant select, insert, update, delete on table public.workout_queue to authenticated;
grant select, insert, update, delete on table public.workout_queue to service_role;  -- secret key (backup), bypasses RLS
call private.add_owner_policies('public.workout_queue');
create index workout_queue_template_idx on public.workout_queue (template_id);

-- ═════════════════════════════ seed: today's values, for every user ═════════════════════════════
-- «в минимуме» — from the body stage of today (Berlin); a user without one gets the default set (water, outside).
with u as (
  select usr.id as user_id,
         coalesce((
           select s.minimum_habits from public.plan_stages s
           where s.user_id = usr.id and s.sphere = 'body'
             and s.start_date <= (now() at time zone 'Europe/Berlin')::date
             and s.end_date >= (now() at time zone 'Europe/Berlin')::date
           order by s.start_date desc limit 1
         ), '{water,outside}') as minimum
  from auth.users usr
)
insert into public.habits (user_id, source_id, kind, name, group_name, time_of_day, freq, freq_per_week, starts_on,
                           in_minimum, sort_order, icon, phrase, legacy_column, legacy_care, archived_at)
select u.user_id, h.source_id, h.kind, h.name, h.group_name, h.time_of_day, h.freq, h.freq_per_week, h.starts_on,
       coalesce(h.legacy_column = any (u.minimum), false), h.sort_order, h.icon, h.phrase, h.legacy_column, h.legacy_care,
       h.archived_at
from u
cross join (values
  ('habit:morning',           'habit', 'Утренний старт',  null,    'morning', 'daily',           null::smallint, date '2026-11-09',  5, 'sunrise', 'утренний старт',    'morning', null,                  timestamptz '2026-11-19 00:00+01'),
  ('habit:outside',           'habit', '10 мин на улице', null,    'day',     'daily',           null,           date '2026-11-09', 10, 'leaf',    '10 минут на улице', 'outside', null,                  null),
  ('habit:water',             'habit', 'Вода',            null,    'day',     'daily',           null,           date '2026-11-09', 20, 'droplet', 'вода',              'water',   null,                  null),
  ('care:morning-niacinamide','care',  'Ниацинамид',      'Утро',  'morning', 'every_other_day', null,           date '2026-11-23', 100, null,     null,                null,      'Утро: Ниацинамид',    null),
  ('care:clay-stick',         'care',  'Глиняный стик',   'Утро',  'morning', 'per_week',        1,              date '2027-01-01', 110, null,     null,                null,      'Утро: Глиняный стик', null),
  ('care:evening-niacinamide','care',  'Ниацинамид',      'Вечер', 'evening', 'daily',           null,           date '2026-11-09', 200, null,     null,                null,      'Вечер: Ниацинамид',   null),
  ('care:azelaic',            'care',  'Азелаинка',       'Вечер', 'evening', 'daily',           null,           date '2026-11-09', 210, null,     null,                null,      'Вечер: Азелаинка',    null),
  ('care:body-cream',         'care',  'Крем для тела',   null,    'evening', 'daily',           null,           date '2026-11-23', 300, null,     null,                null,      'Крем для тела',       null)
) as h (source_id, kind, name, group_name, time_of_day, freq, freq_per_week, starts_on, sort_order, icon, phrase,
        legacy_column, legacy_care, archived_at)
on conflict (user_id, source_id) do nothing;

-- «Кор» is a habit too: a program, active from its start, its mark is a finished session.
insert into public.habits (user_id, source_id, kind, name, time_of_day, freq, starts_on, in_minimum, sort_order, icon, phrase, program_id)
select p.user_id, 'habit:core', 'program', p.name, 'day', 'daily', p.start_date, false, 30, 'person-standing', 'кор', p.id
from public.core_programs p
where p.source_id = 'core:program'
on conflict (user_id, source_id) do nothing;

-- The plan: everything active as now (no ends); «Утренний старт» — no period (as the stages say today);
-- the clay stick — from 01.01.2027 (its pause); «Кор» — from the start of the program.
insert into public.habit_plan (user_id, habit_id, from_date, source_id)
select h.user_id, h.id,
       case h.source_id when 'care:clay-stick' then date '2027-01-01' when 'habit:core' then h.starts_on end,
       'plan:' || h.source_id
from public.habits h
where h.source_id in ('habit:outside', 'habit:water', 'care:morning-niacinamide', 'care:clay-stick',
                      'care:evening-niacinamide', 'care:azelaic', 'care:body-cream', 'habit:core')
on conflict (user_id, source_id) do nothing;

-- The old marks → habit_marks (only marks that were made; nothing in daily_logs changes).
insert into public.habit_marks (user_id, habit_id, date, done)
select l.user_id, h.id, l.date, true
from public.daily_logs l
join public.habits h on h.user_id = l.user_id
where (h.legacy_column = 'outside' and l.outside)
   or (h.legacy_column = 'water' and l.water)
   or (h.legacy_column = 'morning' and l.morning)
   or (h.legacy_care is not null and h.legacy_care = any (l.care))
on conflict (user_id, habit_id, date) do nothing;

-- Strength templates (the plan of 19.11.2026) and the queue: A → B until 10.01, A → B → A from 11.01.
insert into public.workout_templates (user_id, source_id, code, name, focus, sort_order, rules, exercises)
select usr.id, t.source_id, t.code, t.name, t.focus, t.sort_order,
  '{"Дома и в зале одни и те же упражнения, меняется только вес или резинка","Вес или резинку подбирать так, чтобы последние 2 повтора шли тяжело, но дыхание не задерживалось","Усилие на выдохе","Когда верх диапазона даётся легко, дома взять резинку потуже или рюкзак тяжелее, в зале добавить вес","Каждое усложнение — только если нет домика","Без прыжков и бега до этапа 3 кора"}',
  t.exercises
from auth.users usr
cross join (values
  ('workout:A', 'A', 'Силовая A — ноги и ягодицы', 'lower', 10, $a$[
    {"key": "bulgarian-split-squat", "name": "Болгарские выпады", "sets": 3, "reps": "8–12 на ногу", "variants": [
      {"from_core_stage": 1, "home": "задняя нога на стуле, можно с рюкзаком", "gym": "задняя нога на скамье, гантели"}]},
    {"key": "glute-bridge", "name": "Ягодичный мост с пола", "sets": 3, "reps": "10–15", "variants": [
      {"from_core_stage": 1, "home": "на двух ногах с мини-резинкой", "gym": "на двух ногах с мини-резинкой"},
      {"from_core_stage": 2, "home": "на одной ноге или с рюкзаком", "gym": "гантель на бёдрах"}]},
    {"key": "single-leg-rdl", "name": "Румынская тяга на одной ноге", "sets": 3, "reps": "10–12 на ногу", "variants": [
      {"from_core_stage": 1, "home": "рюкзак в противоположной руке", "gym": "гантель в противоположной руке"}]},
    {"key": "banded-abduction", "name": "Отведения ног с мини-резинкой", "sets": 3, "reps": "15–20", "variants": [
      {"from_core_stage": 1, "home": "мини-резинка", "gym": "та же мини-резинка"}]},
    {"key": "cardio", "kind": "cardio", "name": "Кардио", "sets": null, "reps": "15–20 мин", "detail": "спокойный темп: дыхание чаще обычного, но говорить можно", "variants": [
      {"from_core_stage": 1, "home": "быстрая ходьба на улице, в плохую погоду ступенька или лестница", "gym": "дорожка в горку или степпер"}]}
  ]$a$::jsonb),
  ('workout:B', 'B', 'Силовая B — верх и ягодицы', 'upper', 20, $b$[
    {"key": "push-up", "name": "Отжимания", "sets": 3, "reps": "6–12", "variants": [
      {"from_core_stage": 1, "home": "от стола или с колен", "gym": "от скамьи или с колен"},
      {"from_core_stage": 3, "home": "полные", "gym": "полные"}]},
    {"key": "row", "name": "Тяга к поясу", "sets": 3, "reps": "12–15", "variants": [
      {"from_core_stage": 1, "home": "резинка", "gym": "нижний блок"}]},
    {"key": "seated-press", "name": "Жим над головой сидя", "sets": 3, "reps": "10–12", "variants": [
      {"from_core_stage": 1, "home": "резинка под стопами", "gym": "гантели на скамье со спинкой"}]},
    {"key": "lateral-raise", "name": "Махи в стороны", "sets": 3, "reps": "12–15", "variants": [
      {"from_core_stage": 1, "home": "резинка", "gym": "гантели"}]},
    {"key": "banded-glute-bridge", "name": "Ягодичный мост с мини-резинкой", "sets": 3, "reps": "15", "variants": [
      {"from_core_stage": 1, "home": "мини-резинка", "gym": "та же мини-резинка"}]},
    {"key": "cardio", "kind": "cardio", "name": "Кардио", "sets": null, "reps": "15–20 мин", "detail": "спокойный темп: дыхание чаще обычного, но говорить можно", "variants": [
      {"from_core_stage": 1, "home": "быстрая ходьба на улице, в плохую погоду ступенька или лестница", "gym": "дорожка в горку или степпер"}]}
  ]$b$::jsonb)
) as t (source_id, code, name, focus, sort_order, exercises)
on conflict (user_id, source_id) do nothing;

insert into public.workout_queue (user_id, source_id, starts_on, position, template_id)
select w.user_id, q.source_id, q.starts_on, q.position, w.id
from public.workout_templates w
join (values
  ('queue:2026-11-09:1', date '2026-11-09', 1, 'workout:A'),
  ('queue:2026-11-09:2', date '2026-11-09', 2, 'workout:B'),
  ('queue:2027-01-11:1', date '2027-01-11', 1, 'workout:A'),
  ('queue:2027-01-11:2', date '2027-01-11', 2, 'workout:B'),
  ('queue:2027-01-11:3', date '2027-01-11', 3, 'workout:A')
) as q (source_id, starts_on, position, template) on q.template = w.source_id
on conflict (user_id, source_id) do nothing;

-- ═════════════════════════════ old marks ⇄ habit_marks (until the old columns are dropped) ═════════════════════════════
-- daily_logs → habit_marks: a mark made the old way (an older app, an offline queue from before this migration).
-- Insert: only marks that are set; update: only marks that changed. Nested runs (from the other trigger) stop at once.
create or replace function private.daily_logs_to_marks()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  insert into public.habit_marks (user_id, habit_id, date, done)
  select new.user_id, x.habit_id, new.date, x.now_done
  from (
    select h.id as habit_id,
      case h.legacy_column when 'outside' then new.outside when 'water' then new.water when 'morning' then new.morning
        else coalesce(h.legacy_care = any (new.care), false) end as now_done,
      case when tg_op = 'UPDATE' then
        case h.legacy_column when 'outside' then old.outside when 'water' then old.water when 'morning' then old.morning
          else coalesce(h.legacy_care = any (old.care), false) end
      else false end as was_done
    from public.habits h
    where h.user_id = new.user_id and (h.legacy_column is not null or h.legacy_care is not null)
  ) x
  where x.now_done is distinct from x.was_done
  on conflict (user_id, habit_id, date) do update set done = excluded.done;
  return null;
end $$;
create trigger daily_logs_to_marks after insert or update of outside, water, morning, care on public.daily_logs
  for each row execute function private.daily_logs_to_marks();

-- habit_marks → daily_logs: the reserve columns stay right (and an older app still sees the marks).
create or replace function private.marks_to_daily_logs()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  col text;
  care_mark text;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  select h.legacy_column, h.legacy_care into col, care_mark from public.habits h where h.id = new.habit_id;
  if col = 'outside' then
    insert into public.daily_logs (user_id, date, outside) values (new.user_id, new.date, new.done)
    on conflict (user_id, date) do update set outside = excluded.outside;
  elsif col = 'water' then
    insert into public.daily_logs (user_id, date, water) values (new.user_id, new.date, new.done)
    on conflict (user_id, date) do update set water = excluded.water;
  elsif col = 'morning' then
    insert into public.daily_logs (user_id, date, morning) values (new.user_id, new.date, new.done)
    on conflict (user_id, date) do update set morning = excluded.morning;
  elsif care_mark is not null then
    insert into public.daily_logs (user_id, date, care)
    values (new.user_id, new.date, case when new.done then array[care_mark] else '{}' end)
    on conflict (user_id, date) do update set care = case
      when new.done then (select coalesce(array_agg(distinct c), '{}') from unnest(array_append(public.daily_logs.care, care_mark)) c)
      else array_remove(public.daily_logs.care, care_mark) end;
  end if;
  return null;
end $$;
create trigger marks_to_daily_logs after insert or update of done on public.habit_marks
  for each row execute function private.marks_to_daily_logs();
