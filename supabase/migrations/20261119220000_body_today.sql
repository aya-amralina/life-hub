-- Life Hub · 0022 · «Тело», шаг 3: the new «Сегодня» (19.11.2026).
--   1) energy and mood — one row 1–5 instead of 1–10: old answers halved and rounded (1–2 → 1, 3–4 → 2, … 9–10 → 5);
--   2) «Приём отмечен · Пропустила»: taken by default, only a skipped day is stored (daily_logs.intake_skipped);
--   3) «Тяжёлый день»: «Кор» is in the minimum, its minimal version is «Дыхание 360° — 10 вдохов»; a session done that
--      way is marked minimal — it counts in the week, not in the move to the next stage (rule 39).

-- ───────────────────────────── energy, mood: 1–5 ─────────────────────────────
alter table public.daily_logs drop constraint daily_logs_energy_check, drop constraint daily_logs_mood_check;
update public.daily_logs
set energy = round(energy / 2.0), mood = round(mood / 2.0)
where energy is not null or mood is not null;
alter table public.daily_logs
  add constraint daily_logs_energy_check check (energy between 1 and 5),
  add constraint daily_logs_mood_check check (mood between 1 and 5);

-- ───────────────────────────── intake: only a skipped day ─────────────────────────────
alter table public.daily_logs add column intake_skipped boolean not null default false;

-- ───────────────────────────── «Кор» on a «Тяжёлый день» ─────────────────────────────
alter table public.core_sessions add column minimal boolean not null default false;

update public.habits
set in_minimum = true, minimum_note = 'Дыхание 360° — 10 вдохов'
where source_id = 'habit:core';
