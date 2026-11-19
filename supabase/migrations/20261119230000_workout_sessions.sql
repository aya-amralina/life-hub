-- Life Hub · 0023 · «Тело», шаг 4: the strength session (19.11.2026).
--   workout_sessions — one strength session a day: the template, home / gym (the last choice is the next default),
--     «Домик был?» (only for the «пора усложнить» hints of strength, never for the «Кор» stages), cardio minutes and
--     its activity, done_at («Готово» — the session counts in the week);
--   strength_sets — a row per exercise of a session (session_id + exercise_key), reps and loads per set, which sets
--     are ticked; old journal rows (no session) stay as they are;
--   workout_templates.reminders — the short rules on top of the session screen.

create table public.workout_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date         date not null,
  template_id  uuid not null references public.workout_templates (id) on delete restrict,
  place        text not null default 'home' check (place in ('home', 'gym')),
  dome         boolean,
  cardio_min   smallint check (cardio_min between 1 and 180),
  activity_id  uuid references public.activities (id) on delete set null,
  done_at      timestamptz,
  source_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, date),
  unique (user_id, source_id)
);
alter table public.workout_sessions enable row level security;
revoke all on table public.workout_sessions from anon, public;
grant select, insert, update, delete on table public.workout_sessions to authenticated;
grant select, insert, update, delete on table public.workout_sessions to service_role;  -- secret key (backup), bypasses RLS
call private.add_owner_policies('public.workout_sessions');
create index workout_sessions_template_idx on public.workout_sessions (template_id);
create index workout_sessions_activity_idx on public.workout_sessions (activity_id);

alter table public.strength_sets
  add column session_id   uuid references public.workout_sessions (id) on delete cascade,
  add column exercise_key text,
  add column loads        text[],
  add column sets_done    boolean[],
  add constraint strength_sets_session_exercise_key unique (user_id, session_id, exercise_key),
  add constraint strength_sets_session_check check (session_id is null or exercise_key is not null);
create index strength_sets_session_idx on public.strength_sets (session_id);

alter table public.workout_templates add column reminders text[] not null default '{}';

-- The short rules of the session screen, for the seeded templates A and B (their long rules stay as they are).
update public.workout_templates
set reminders = '{Усилие на выдохе,Не задерживать дыхание,Вставать через бок,Не тужиться}'
where source_id in ('workout:A', 'workout:B');

-- The activity type «Кардио» (the cardio of a strength session becomes an activity of the day), once per user:
-- points as «Прогулка» has (2 a 10 minutes by default), at the end of the list. Idempotent by (user, name).
insert into public.activity_types (user_id, name, intensity, points_per_10min, sort_order, source_id)
select u.id, 'Кардио', 'средняя',
       coalesce((select t.points_per_10min from public.activity_types t where t.user_id = u.id and t.name = 'Прогулка'), 2),
       coalesce((select max(t.sort_order) from public.activity_types t where t.user_id = u.id), 0) + 1,
       'type:cardio'
from auth.users u
on conflict (user_id, name) do nothing;
