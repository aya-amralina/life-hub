-- Life Hub · 0020 · «Тело», шаг 1 редизайна (19.11.2026):
--   1) «Кор» — программа как данные (этапы и упражнения в core_programs.stages), сессии дня, тест пальцами;
--   2) привычка «Утренний старт» (morning) выключена: её нет ни в одном этапе и ни в одном минимуме,
--      колонка daily_logs.morning с отметками остаётся — история не трогается;
--   3) дубль 16.11: напоминание «Замеры» этого дня и задача «Стартовые фото и замеры» — одно событие.

-- ───────────────────────────── core_programs ─────────────────────────────
-- stages: [{ "no": 1, "weeks": 3 | null, "note"?: text, "exercises": [{ "key", "name", "dose", "detail"? }] }]
--   weeks — минимальный срок этапа в неделях от дня, когда он начался (stage_since); null — последний, без срока.
-- stage / stage_since — текущий этап и день перехода на него (переключает пользователь, приложение только предлагает);
-- offer_after — «Ещё неделю»: до этого дня предложение перейти не показывается.
create table public.core_programs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null check (length(btrim(name)) > 0),
  start_date       date not null,
  minutes          smallint not null default 10 check (minutes between 1 and 180),
  rules            text[] not null default '{}',
  stages           jsonb not null check (jsonb_typeof(stages) = 'array' and jsonb_array_length(stages) > 0),
  test_every_days  smallint not null default 28 check (test_every_days between 1 and 365),
  stage            smallint not null default 1 check (stage >= 1),
  stage_since      date not null,
  offer_after      date,
  source_id        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (stage_since >= start_date),
  unique (user_id, source_id)
);
alter table public.core_programs enable row level security;
revoke all on table public.core_programs from anon, public;
grant select, insert, update, delete on table public.core_programs to authenticated;
grant select, insert, update, delete on table public.core_programs to service_role;  -- secret key (backup), bypasses RLS
call private.add_owner_policies('public.core_programs');

-- ───────────────────────────── core_sessions ─────────────────────────────
-- One session a day. done — keys of the exercises ticked; dome — «Домик был?»; done_at — «Готово» (the session counts).
create table public.core_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  program_id   uuid not null references public.core_programs (id) on delete cascade,
  date         date not null,
  stage        smallint not null check (stage >= 1),
  done         text[] not null default '{}',
  dome         boolean,
  done_at      timestamptz,
  source_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, program_id, date),
  unique (user_id, source_id)
);
alter table public.core_sessions enable row level security;
revoke all on table public.core_sessions from anon, public;
grant select, insert, update, delete on table public.core_sessions to authenticated;
grant select, insert, update, delete on table public.core_sessions to service_role;  -- secret key (backup), bypasses RLS
call private.add_owner_policies('public.core_sessions');
create index core_sessions_program_idx on public.core_sessions (program_id, date);

-- ───────────────────────────── core_tests ─────────────────────────────
-- Тест пальцами (every test_every_days from the start): the width in fingers and whether the «домик» showed.
create table public.core_tests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  program_id   uuid not null references public.core_programs (id) on delete cascade,
  date         date not null,
  fingers      numeric(3, 1) check (fingers between 0 and 10),
  dome         boolean,
  source_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, program_id, date),
  unique (user_id, source_id)
);
alter table public.core_tests enable row level security;
revoke all on table public.core_tests from anon, public;
grant select, insert, update, delete on table public.core_tests to authenticated;
grant select, insert, update, delete on table public.core_tests to service_role;  -- secret key (backup), bypasses RLS
call private.add_owner_policies('public.core_tests');
create index core_tests_program_idx on public.core_tests (program_id, date);

-- The program «Кор» for every user (the one user and the test user). The seed is data: a later editor changes this row.
insert into public.core_programs (user_id, source_id, name, start_date, minutes, rules, stages, test_every_days, stage, stage_since)
select u.id, 'core:program', 'Кор', date '2026-11-19', 10,
  '{Усилие на выдохе,Вставать через бок,Не тужиться}',
  $seed$[
    {"no": 1, "weeks": 3, "exercises": [
      {"key": "breath-360", "name": "Дыхание 360°", "dose": "10 вдохов"},
      {"key": "exhale-draw-in", "name": "Выдох с подтягиванием живота", "dose": "по 5", "detail": "лёжа, на четвереньках, сидя, стоя"},
      {"key": "heel-slide", "name": "Скольжение пяткой", "dose": "2×10 на ногу"},
      {"key": "toe-tap", "name": "Касания носком", "dose": "2×8 на ногу"}
    ]},
    {"no": 2, "weeks": 6, "exercises": [
      {"key": "breath-360", "name": "Дыхание 360°", "dose": "5 вдохов", "detail": "для разминки"},
      {"key": "glute-bridge", "name": "Ягодичный мост", "dose": "2×12"},
      {"key": "dead-bug", "name": "Dead bug", "dose": "2×8 на сторону"},
      {"key": "bird-dog", "name": "«Птица-собака»", "dose": "2×8 на сторону"},
      {"key": "side-plank-knees", "name": "Боковая планка с колен", "dose": "2×20 сек на сторону"},
      {"key": "pallof-press", "name": "Pallof press с резинкой", "dose": "2×10 на сторону"},
      {"key": "mini-crunch", "name": "Мини-скручивание", "dose": "2×8"}
    ]},
    {"no": 3, "weeks": null, "note": "Обычная планка и пресс — только если живот остаётся плоским.", "exercises": []}
  ]$seed$::jsonb,
  28, 1, date '2026-11-19'
from auth.users u
on conflict (user_id, source_id) do nothing;

-- ───────────────────────────── «Утренний старт» off ─────────────────────────────
-- Out of every body stage and every minimum set; the minimum set is never empty (rule 13).
update public.plan_stages
set habits = array_remove(habits, 'morning'),
    minimum_habits = case
      when cardinality(array_remove(minimum_habits, 'morning')) = 0 then '{water,outside}'
      else array_remove(minimum_habits, 'morning')
    end
where sphere = 'body' and ('morning' = any (habits) or 'morning' = any (minimum_habits));

-- ───────────────────────────── 16.11: one event ─────────────────────────────
-- «Замеры» is a series of reminders (glow:measure-day:*, one row per day: 06.12, 10.01, …); only the row ON 16.11
-- is touched — by its date, not by its key (the key carries the date of the Excel row, 08.11, the day was moved to
-- 16.11 in the app). The task «Стартовые фото и замеры» of the same day stays; the reminder is closed as «Отменено»
-- with a note. If only the reminder was marked done, the mark moves to the task.
update public.items t
set done_at = r.done_at, status = 'Готово'
from public.items r
where r.source_id like 'glow:measure-day:%' and r.happens_on = date '2026-11-16'
  and r.done_at is not null
  and t.user_id = r.user_id and t.id <> r.id and t.sphere = 'body'
  and t.happens_on = date '2026-11-16'
  and lower(btrim(t.title)) like 'стартовые фото%замеры%'
  and t.done_at is null;

update public.items r
set status = 'Отменено',
    done_at = null,
    notes = concat_ws(E'\n', nullif(r.notes, ''), 'Дубль задачи «Стартовые фото и замеры» — одно событие (19.11.2026).')
where r.source_id like 'glow:measure-day:%' and r.happens_on = date '2026-11-16'
  and exists (
    select 1 from public.items t
    where t.user_id = r.user_id and t.id <> r.id and t.sphere = 'body'
      and t.happens_on = date '2026-11-16'
      and lower(btrim(t.title)) like 'стартовые фото%замеры%'
  );
