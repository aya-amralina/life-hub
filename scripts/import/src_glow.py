"""Глоу ап — трекер.xlsx → plan_stages, weeks (glow-up numbers, events), daily_logs + activities, activity_types,
strength_sets, measurements (+ reminders), items (tasks, visits), notes (SPEC §6). «Бюджет» is not read.
"""
from __future__ import annotations

import datetime as dt
import re
from collections import Counter, defaultdict

from model import Batch, noon, rows_list
from xl import any_date, excel_date, is_check, number, parse_range, rows, stable_id, text

HABITS = {"E": "morning", "F": "outside", "G": "water"}
STATUS = {"не начато": "Не начато", "в процессе": "В процессе", "готово": "Готово", "не записана": "Не начато", "записана": "В процессе"}


def build(wb, b: Batch) -> None:
    _weeks_and_stages(wb["Недели"], b)
    types = _activity_types(wb["Трекер"], b)
    _tracker(wb["Трекер"], b, types)
    _strength(wb["Сила"], b)
    _measurements(wb["Замеры"], b)
    _tasks(wb["Задачи"], b)
    _doctors(wb["Врачи"], b)
    for sheet in ("Обзор", "Программа", "Питание", "Уход"):
        _sheet_note(wb[sheet], b)


def _weeks_and_stages(ws, b: Batch) -> None:
    stages: dict[str, dict] = {}
    targets: dict[str, dict[str, Counter]] = defaultdict(lambda: defaultdict(Counter))
    n_weeks = 0
    for _, r in rows(ws, 5):
        no, start, end, stage = number(r[0]), excel_date(r[1]), excel_date(r[2]), text(r[3])
        if no is None or not start:
            continue
        mon = start - dt.timedelta(days=start.weekday())
        b.week(mon, glowup_week_no=int(no), events=text(r[4]))
        n_weeks += 1
        if stage:
            s = stages.setdefault(stage, {"start": start, "end": end or start})
            s["start"] = min(s["start"], start)
            s["end"] = max(s["end"], end or start)
            for key, j in (("strength_per_week", 10), ("groups_per_week", 12), ("retinoid_per_week", 14)):
                v = number(r[j]) if j < len(r) else None
                if v is not None:
                    targets[stage][key][v] += 1
    for name, s in stages.items():
        t = {k: c.most_common(1)[0][0] for k, c in targets[name].items()}
        b.add(
            "plan_stages",
            {
                "source_id": f"glow:stage:{stable_id(name)}",
                "sphere": "body",
                "name": name,
                "start_date": s["start"].isoformat(),
                "end_date": s["end"].isoformat(),
                "habits": ["morning", "outside", "water"],
                "minimum_habits": ["water", "outside"],
                "targets": {k: int(v) if float(v).is_integer() else v for k, v in t.items()},
            },
        )
    b.report.append(f"Глоу-ап · Недели: {n_weeks} недель, этапов {len(stages)} (даты этапа — по его неделям; цели — самые частые за этап)")
    if stages:
        b.questions.append(
            "Глоу-ап · этапы: какие привычки начинаются с какого этапа, в файле не записано отдельно. "
            "Ставлю всем этапам все три (утро, улица, вода) и минимум «вода и 10 минут на улице» — поправишь в Настройках → Этапы. Так?"
        )


def _activity_types(ws, b: Batch) -> list[str]:
    names: list[str] = []
    for dv in ws.data_validations.dataValidation:
        if str(dv.sqref).startswith("I") and dv.formula1:
            names = [p.strip() for p in dv.formula1.strip('"').split(",") if p.strip()]
    used = {text(r[8]) for _, r in rows(ws, 6) if text(r[8])}
    for extra in sorted(u for u in used if u not in names):
        names.append(extra)
    for i, name in enumerate(names):
        b.add("activity_types", {"source_id": f"glow:type:{name.lower()}", "name": name, "intensity": "средняя", "points_per_10min": 2, "sort_order": i})
    b.report.append(f"Глоу-ап · типы активностей из списка «Тренировка» (Трекер): {len(names)}, интенсивность «средняя» — " + ", ".join(names))
    return names


def _tracker(ws, b: Batch, types: list[str]) -> None:
    days, acts, example = 0, 0, []
    for n, r in rows(ws, 6):
        date = excel_date(r[0])
        if not date:
            example.append(n)  # «пример»
            continue
        values = r[4:17]
        if not any(v not in (None, "") for i, v in enumerate(values) if i != 3):  # H «Счёт дня» is a formula
            continue
        log = {
            "source_id": f"glow:day:{date.isoformat()}",
            "date": date.isoformat(),
            "morning": is_check(r[4]),
            "outside": is_check(r[5]),
            "water": is_check(r[6]),
            "body_cream": is_check(r[10]),
            "face_evening": text(r[11]),
            "energy": int(number(r[12])) if number(r[12]) else None,
            "slump": True if text(r[13]) == "Да" else False if text(r[13]) == "Нет" else None,
            "sleep_h": number(r[14]),
            "mood": int(number(r[15])) if number(r[15]) else None,
            "note": text(r[16]),
        }
        b.add("daily_logs", log)
        days += 1
        workout = text(r[8])
        if workout:
            minutes = number(r[9])
            b.add("activities", {"source_id": f"glow:act:{date.isoformat()}:{workout.lower()}", "date": date.isoformat(), "type": workout, "minutes": int(minutes) if minutes else None})
            acts += 1
    b.report.append(f"Глоу-ап · Трекер: дней с отметками {days}, тренировок → активности {acts}" + (f"; строка-пример пропущена ({rows_list(example)})" if example else ""))


def _strength(ws, b: Batch) -> None:
    count = 0
    for n, r in rows(ws, 4):
        date, workout, exercise = excel_date(r[0]), text(r[1]), text(r[2])
        if not date or not exercise or any(isinstance(v, str) and "пример" in v.lower() for v in r):
            continue  # the sample row
        reps = [int(v) for v in (number(r[3]), number(r[4]), number(r[5])) if v]
        short = re.search(r"\b([AB])\b", workout or "")
        b.add(
            "strength_sets",
            {
                "source_id": f"glow:set:{date.isoformat()}:{stable_id(exercise)}:{n}",
                "date": date.isoformat(),
                "workout": short[1] if short else workout,
                "exercise": exercise,
                "reps": reps,
                "load": text(r[6]),
                "hard_at_end": True if text(r[8]) == "Да" else False if text(r[8]) == "Нет" else None,
                "note": text(r[9]),
            },
        )
        count += 1
    b.report.append(f"Глоу-ап · Сила: подходов-записей {count}")


def _measurements(ws, b: Batch) -> None:
    done, reminders, other = 0, 0, []
    for n, r in rows(ws, 5):
        date = excel_date(r[0])
        if not date:
            other.append(n)
            continue
        vals = {"waist_cm": number(r[1]), "hips_cm": number(r[2]), "thigh_cm": number(r[3]), "arm_cm": number(r[4]), "weight_kg": number(r[5]) if not isinstance(r[5], (dt.date, dt.datetime)) else None}
        photos = {"photo_body": is_check(r[6]), "photo_face": is_check(r[7]), "photo_part": is_check(r[8])}
        if any(v is not None for v in vals.values()) or any(photos.values()):
            b.add("measurements", {"source_id": f"glow:measure:{date.isoformat()}", "date": date.isoformat(), **vals, **photos, "note": text(r[10]) if len(r) > 10 else None})
            done += 1
        else:
            # an empty measurement day = a reminder item on that day (SPEC §6)
            b.add("items", {"source_id": f"glow:measure-day:{date.isoformat()}", "sphere": "body", "type": "Замер", "title": "Замеры", "status": "Не начато", "happens_on": date.isoformat(), "done_at": None})
            reminders += 1
    b.report.append(f"Глоу-ап · Замеры: записей {done}, дней-напоминаний {reminders}" + (f"; строки без даты (таблица состава тела и пример) — {len(other)}" if other else ""))
    if other:
        b.questions.append(
            f"Глоу-ап · Замеры: под таблицей есть блок без дат ({len(other)} строк — похоже, состав тела: жир, вода, мышцы…). "
            "В схеме для него места нет (разбор body comp — этап 6). Сохранить его заметкой «Состав тела» в Теле или пропустить?"
        )


_DAY_IN = re.compile(r"^(с|начиная с)\s+(\d{1,2}\.\d{1,2})", re.I)


def _tasks(ws, b: Batch) -> None:
    count, closed, starts, unclear = 0, 0, 0, []
    for n, r in rows(ws, 4):
        title = text(r[0])
        if not title:
            continue
        due, when, status, note = any_date(r[1]), text(r[2]), STATUS.get((text(r[3]) or "").lower(), "Не начато"), text(r[4])
        starts_on = None
        if when:
            m = _DAY_IN.match(when)
            if m:
                d = any_date(m[2])
                starts_on = d.date.isoformat() if d else None
            elif parse_range(when) or re.search(r"\d", when):
                unclear.append(n)
        if starts_on and due and starts_on > due.date.isoformat():
            starts_on = None
        starts += starts_on is not None
        done = status == "Готово"
        closed += done
        b.add(
            "items",
            {
                "source_id": f"glow:task:{stable_id(title)}",
                "sphere": "body",
                "title": title,
                "type": "Задача",
                "status": status,
                "due_date": due.date.isoformat() if due else None,
                "starts_on": starts_on,
                "notes": "\n".join(x for x in (f"по плану: {when}" if when else None, note) if x) or None,
                "done_at": noon(b.today) if done else None,
            },
        )
        count += 1
    b.report.append(f"Глоу-ап · Задачи: {count} (закрытых «Готово» — {closed}; «с даты» — {starts})")
    if unclear:
        b.questions.append(
            f"Глоу-ап · Задачи: в «Когда по плану» у строк {rows_list(unclear)} — даты и диапазоны («8–9.11», «21.12–8.01», «неделя N»). "
            "Срок беру из «Срок», а это поле кладу в заметку пункта «по плану: …», без «с даты». Или сделать диапазоны «с даты»?"
        )


def _doctors(ws, b: Batch) -> None:
    section, visits, other_lines, intake_rows = None, 0, [], []
    for n, r in rows(ws, 1):
        filled = [v for v in r if v not in (None, "")]
        first = text(r[0])
        if len(filled) == 1 and first and len(first) < 40:
            section = first
            other_lines.append(f"\n**{first}**")
            continue
        if section == "Визиты":
            if first == "Врач":
                continue  # header
            if len(filled) >= 3:
                when = any_date(r[4]) if len(r) > 4 else None
                b.add(
                    "items",
                    {
                        "source_id": f"glow:visit:{stable_id(first)}",
                        "sphere": "body",
                        "title": first,
                        "type": "Визит",
                        "status": STATUS.get((text(r[3]) or "").lower(), "Не начато"),
                        "happens_on": when.date.isoformat() if when else None,
                        "happens_time": when.time if when else None,
                        "notes": "\n".join(f"{k}: {v}" for k, v in (("Где", text(r[1])), ("Когда", text(r[2])), ("С чем идти", text(r[5])), ("Что взять", text(r[6])), ("Итог", text(r[7]) if len(r) > 7 else None)) if v) or None,
                        "done_at": None,
                    },
                )
                visits += 1
                continue
        if section and section != "Визиты" and len(filled) >= 3 and first:
            intake_rows.append(n)
        other_lines.append("- " + " · ".join(str(v).strip() for v in filled))
    b.add("notes", {"source_id": "glow:doctors", "sphere": "body", "title": "Врачи, анализы и добавки", "body_md": "\n".join(other_lines).strip(), "pinned": False})
    b.report.append(f"Глоу-ап · Врачи: визитов → пункты «Визит» {visits}; остальное (анализы, добавки) — заметкой")
    if intake_rows:
        b.questions.append(
            f"Глоу-ап · Врачи: строки {rows_list(intake_rows)} похожи на приём (добавки/лекарства). В «Приём» нужна дата начала, в файле её нет — "
            "завести их в «Приём» с началом = сегодня или оставить только в заметке и добавить руками?"
        )


def _sheet_note(ws, b: Batch) -> None:
    lines = []
    for _, r in rows(ws, 0):
        filled = [str(v).strip() for v in r if v not in (None, "")]
        if filled:
            lines.append(" · ".join(filled))
    if lines:
        b.add("notes", {"source_id": f"glow:sheet:{ws.title.lower()}", "sphere": "body", "title": ws.title if ws.title != "Обзор" else "Обзор и правила гибкости", "body_md": "\n".join(lines), "pinned": False})
        b.report.append(f"Глоу-ап · {ws.title}: заметка ({len(lines)} строк)")


