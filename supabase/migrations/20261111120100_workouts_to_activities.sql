-- Life Hub · 0004 · move stage-2 workouts (daily_logs.workout_type / workout_min) into activities.
-- Idempotent: types by (user_id, name), activities by source_id 'daily_logs:<id>'. The old columns stay
-- until a later migration repeats this copy and drops them (after the new app is deployed).

insert into public.activity_types (user_id, name, intensity, points_per_10min)
select distinct dl.user_id, btrim(dl.workout_type), 'средняя', 2
from public.daily_logs dl
where dl.workout_type is not null and length(btrim(dl.workout_type)) > 0
on conflict (user_id, name) do nothing;

insert into public.activities (user_id, date, type_id, minutes, source_id)
select dl.user_id, dl.date, t.id, nullif(dl.workout_min, 0), 'daily_logs:' || dl.id
from public.daily_logs dl
join public.activity_types t on t.user_id = dl.user_id and t.name = btrim(dl.workout_type)
where dl.workout_type is not null and length(btrim(dl.workout_type)) > 0
on conflict (user_id, source_id) do nothing;
