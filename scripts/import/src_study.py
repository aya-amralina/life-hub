"""WiSe 26/27 → weeks (study numbers, capacity), items (study) from «Чеклист» and «Дедлайны и тесты», notes (SPEC §6).

Done (✓) items come closed: done_at = Sunday of the item's week, or the import day while that week is
still running (there is no completion date in Excel).
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict

from model import Batch, noon, rows_list
from xl import any_date, monday, number, parse_range, parse_time, rows, stable_id, sunday, text

WEEK = re.compile(r"^Н\d{2}$")
TYPES = {"Лекция", "HA", "Сверка", "Задача", "Тест", "Подготовка", "Орга", "Hausarbeit", "Туториум", "Экзамен"}
TEST_WORDS = re.compile(r"test|klausur|prüfung|exam|zwischen|zt\b|тест|экзамен|контрольн", re.I)


def data_status(value: str | None) -> tuple[str | None, str | None]:
    """«подтверждено…» → confirmed, «допущение…» → assumption, «проверить» → check; «по ритму…», «из прошлых
    данных…» are not confirmed — assumption. Returns (status, rule used)."""
    if not value:
        return None, None
    v = value.strip().lower()
    if v.startswith("подтвержд"):
        return "confirmed", "подтверждено"
    if v.startswith("допущ"):
        return "assumption", "допущение"
    if v.startswith("провер"):
        return "check", "проверить"
    if v.startswith("по ритму"):
        return "assumption", "по ритму"
    if v.startswith("из прошл"):
        return "assumption", "из прошлых данных"
    return "check", "другое"


def build(wb, b: Batch) -> None:
    _plan(wb["План по неделям"], b)
    items = _checklist(wb["Чеклист"], b)
    _deadlines(wb["Дедлайны и тесты"], b, items)
    _assumptions(wb["Допущения и открытые вопросы"], b)


def _plan(ws, b: Batch) -> None:
    count = 0
    for n, r in rows(ws, 1):
        label, dates = text(r[0]), text(r[1])
        if not label or not WEEK.match(label) or not dates:
            continue
        rng = parse_range(dates)
        if not rng:
            b.issues.append(f"Учёба · План по неделям, строка {n}: не разобрать даты")
            continue
        mon = monday(rng[0])
        b.study_weeks[label] = mon
        base, mx = number(r[19]), number(r[20])
        b.week(mon, study_week=label, capacity_base_h=base, capacity_max_h=mx, study_mode=text(r[2]))
        count += 1
    labels = sorted(b.study_weeks)
    b.report.append(f"Учёба · План по неделям: {count} недель ({labels[0]}–{labels[-1]})" if labels else "Учёба · План по неделям: недель нет")


def _checklist(ws, b: Batch) -> list[dict]:
    items: list[dict] = []
    seen: Counter[str] = Counter()
    skipped, no_week, new_types, odd_dates = [], [], Counter(), []
    for n, r in rows(ws, 1):
        label = text(r[0])
        if not label or not WEEK.match(label):
            skipped.append(n)  # instruction rows
            continue
        subject, typ, title = text(r[2]), text(r[3]), text(r[4])
        if not title:
            skipped.append(n)
            continue
        mon = b.study_weeks.get(label)
        if mon is None:
            rng = parse_range(text(r[1]) or "")
            mon = monday(rng[0]) if rng else None
        if mon is None:
            no_week.append(n)
            continue
        if typ and typ not in TYPES:
            new_types[typ] += 1
        link = text(r[5]) or ""
        synergy = " · ".join(p.strip() for p in link.split(" · ") if p.strip().startswith("↔")) or None
        trap = " · ".join(p.strip() for p in link.split(" · ") if p.strip().startswith("⚠")) or None
        if link and not synergy and not trap:
            synergy = link
        due, ready = any_date(r[7]), any_date(r[8])
        if r[7] not in (None, "") and not due:
            odd_dates.append(n)
        done = text(r[9]) in ("✓", "✔")
        done_day = min(sunday(mon), b.today) if done else None
        key = stable_id(subject, typ, title)
        seen[key] += 1
        row = {
            "source_id": f"study:{key}" if seen[key] == 1 else f"study:{key}:{seen[key]}",
            "sphere": "study",
            "title": title,
            "type": typ,
            "area": subject,
            "status": "готово" if done else "открыто",
            "done_at": noon(done_day) if done_day else None,
            "hours_est": number(r[6]),
            "due_date": due.date.isoformat() if due else None,
            "due_time": due.time if due else None,
            "ready_by": ready.date.isoformat() if ready else None,
            "synergy": synergy,
            "trap": trap,
            "data_status": "assumption" if due and due.assumption else None,
            "week": mon,
            "sort_order": n,
        }
        b.add("items", row)
        items.append(row)
    b.report.append(f"Учёба · Чеклист: {len(items)} пунктов (✓ — {sum(i['status'] == 'готово' for i in items)}, со сроком — {sum(i['due_date'] is not None for i in items)})")
    if skipped:
        b.report.append(f"  не пункты (строки-инструкции): {rows_list(skipped)}")
    if no_week:
        b.issues.append(f"Учёба · Чеклист: нет недели — строки {rows_list(no_week)}")
    if odd_dates:
        b.issues.append(f"Учёба · Чеклист: срок не разобрать — строки {rows_list(odd_dates)}")
    if new_types:
        b.questions.append(
            "Учёба · Чеклист: типы не из справочника SPEC — " + ", ".join(f"«{k}» {v}" for k, v in new_types.items()) + ". «Экзамен» добавлю в справочник рядом с «Тест»; «—» импортирую без типа. Так?"
        )
    return items


def _deadlines(ws, b: Batch, items: list[dict]) -> None:
    by_key: dict[tuple, list[dict]] = defaultdict(list)
    for i in items:
        if i["due_date"]:
            by_key[(i["area"], i["due_date"])].append(i)
    matched, created, rules, no_date = 0, Counter(), Counter(), []
    seen: Counter[str] = Counter()
    for n, r in rows(ws, 1):
        date = any_date(r[0])
        subject, what = text(r[3]), text(r[4])
        if not date or not what:
            no_date.append(n)
            continue
        status, rule = data_status(text(r[8]))
        if rule:
            rules[rule] += 1
        twins = by_key.get((subject, date.date.isoformat()))
        if twins:
            for t in twins:
                t["data_status"] = status or t["data_status"]
            matched += 1
            continue
        week_label = (re.findall(r"Н\d{2}", text(r[7]) or "") or [None])[0]
        mon = b.study_weeks.get(week_label) if week_label else monday(date.date)
        typ = "Тест" if TEST_WORDS.search(what) else "Орга"
        created[typ] += 1
        ready = any_date(r[5])
        key = stable_id(subject, date.date.isoformat(), what)
        seen[key] += 1
        b.add(
            "items",
            {
                "source_id": f"study:dl:{key}" if seen[key] == 1 else f"study:dl:{key}:{seen[key]}",
                "sphere": "study",
                "title": what,
                "type": typ,
                "area": subject,
                "status": "открыто" if date.date >= b.today else "открыто",
                "done_at": None,
                "hours_est": None,
                "due_date": date.date.isoformat(),
                "due_time": date.time or parse_time(r[2]),
                "ready_by": ready.date.isoformat() if ready else None,
                "synergy": None,
                "trap": None,
                "data_status": status,
                "week": mon,
                "sort_order": 10_000 + n,
            },
        )
    b.report.append(
        f"Учёба · Дедлайны и тесты: сопоставлено с чеклистом {matched}, новых пунктов {sum(created.values())} ("
        + ", ".join(f"{k} {v}" for k, v in created.items())
        + "); статус данных: "
        + ", ".join(f"{k} {v}" for k, v in rules.most_common())
    )
    if rules.get("по ритму") or rules.get("из прошлых данных"):
        b.questions.append(
            f"Учёба · Дедлайны: «по ритму ISIS…» ({rules.get('по ритму', 0)}) и «из прошлых данных…» ({rules.get('из прошлых данных', 0)}) — в SPEC их нет. "
            "Ставлю им «допущение» (значок не «подтверждено»). Или «проверить»?"
        )
    if no_date:
        b.report.append(f"  без даты (сноски): строки {rows_list(no_date)}")


def _assumptions(ws, b: Batch) -> None:
    """Two tables on one sheet: assumptions (# · subject · assumption · how to update) per subject, and below
    a section of open questions (# · text) — one note."""
    by_subject: dict[str, list[str]] = defaultdict(list)
    questions: list[str] = []
    section = None
    for _, r in rows(ws, 2):
        filled = [v for v in r[:4] if v not in (None, "")]
        if len(filled) == 1 and text(r[0]):
            section = text(r[0])  # section title row
            continue
        subject, what, how = text(r[1]), text(r[2]), text(r[3])
        if what:
            by_subject[subject or "Общее"].append(f"- {what}" + (f"\n  → {how}" if how else ""))
        elif subject:
            questions.append(f"- {subject}")
    for subject, lines in by_subject.items():
        b.add("notes", {"source_id": f"study:assumptions:{subject.lower()}", "sphere": "study", "title": f"Допущения · {subject}", "body_md": "\n".join(lines), "pinned": False})
    if questions:
        b.add("notes", {"source_id": "study:open-questions", "sphere": "study", "title": section or "Открытые вопросы", "body_md": "\n".join(questions), "pinned": False})
    b.report.append(
        f"Учёба · Допущения и открытые вопросы: допущений {sum(len(v) for v in by_subject.values())} → {len(by_subject)} заметок по предмету; открытых вопросов {len(questions)} → 1 заметка"
    )
