-- Life Hub · 0008 · care entries can be groups with one choice («Вечер: Ниацинамид | Азелаинка»).
-- Ая's current list; the former marks move into the groups (nothing is dropped).
update public.plan_stages
set care_items = '{"Утро: Ниацинамид | Глиняный стик","Вечер: Ниацинамид | Азелаинка","Крем для тела"}'
where sphere = 'body';

-- «Ниацинамид утром» (a plain item until now) → the morning group
update public.daily_logs set care = array_replace(care, 'Ниацинамид утром', 'Утро: Ниацинамид')
where 'Ниацинамид утром' = any (care);

-- the former «Вечер: лицо» choice → the evening group, when it is one of its options (face_evening stays as it was)
update public.daily_logs set care = care || ('Вечер: ' || face_evening)
where face_evening in ('Ниацинамид', 'Азелаинка') and not (('Вечер: ' || face_evening) = any (care));
