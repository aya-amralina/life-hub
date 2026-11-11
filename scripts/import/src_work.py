"""Localiser_Aufgaben-Tracker.xlsx → items (work) from «Dev Aufgaben» only, people + a note from «Legende» (SPEC §6).

«Organisatirisch» is not read (decision 2026-11-09). The first column of «Dev Aufgaben» is the title,
even when its header cell is empty.
"""
from __future__ import annotations

import re
from collections import Counter

from model import Batch, noon, rows_list
from xl import any_date, excel_date, rows, stable_id, text

STATUSES = {"Offen", "In Arbeit", "Im Review", "Wartet auf Antwort", "Blockiert", "Geparkt", "Erledigt", "Verworfen"}
SECRET_LOGGING_BRANCH = "fix/h2_secret_logging"
SECRET_LOGGING_TITLE = "PR 1: Secret-Logging fixen"


def build(wb, b: Batch) -> None:
    names = _tasks(wb["Dev Aufgaben"], b)
    _legend(wb["Legende"], b, names)


def _tasks(ws, b: Batch) -> set[str]:
    people: set[str] = set()
    seen: Counter[str] = Counter()
    count, closed, no_title, status_issue = 0, 0, [], []
    for n, r in rows(ws, 1):
        title, typ, area, status, prio = text(r[0]), text(r[1]), text(r[2]), text(r[3]), text(r[4])
        due = any_date(r[5])
        next_step, waiting, involved, clickup, links, details = text(r[7]), text(r[8]), text(r[9]), text(r[10]), text(r[11]), text(r[12])
        created, updated = excel_date(r[13]), excel_date(r[14])
        if not title:
            if links and SECRET_LOGGING_BRANCH in links:
                title = SECRET_LOGGING_TITLE
            else:
                no_title.append(n)
                continue
        if status not in STATUSES:
            status_issue.append(n)
            status = "Offen"
        names = [p.strip() for p in re.split(r"[,;/]| und ", involved or "") if p.strip()]
        people.update(names)
        key = stable_id(title)
        seen[key] += 1
        sid = f"work:{key}" if seen[key] == 1 else f"work:{key}:{seen[key]}"
        row = {
            "source_id": sid,
            "sphere": "work",
            "title": title,
            "type": typ,
            "status": status,
            "priority": prio,
            "area": area,
            "due_date": due.date.isoformat() if due else None,
            "due_time": due.time if due else None,
            "next_step": next_step,
            "waiting_on": waiting,
            "people": names,
            "clickup": None if not clickup or clickup.lower() == "nein" else clickup,
            "links": [l for l in re.split(r"\s+", links or "") if l],
            "notes": details,
            # Erledigt comes closed; the date of closing is «Aktualisiert».
            "done_at": noon(updated or b.today) if status == "Erledigt" else None,
        }
        if created:
            row["created_at"] = noon(created)
        if updated:
            row["updated_at"] = noon(updated)  # drives rule 9 «Status alt»
        b.add("items", row)
        count += 1
        closed += status == "Erledigt"
    by_status = Counter(i["status"] for i in b.rows["items"] if i["sphere"] == "work")
    b.report.append(f"Работа · Dev Aufgaben: {count} задач (Erledigt — {closed}, закрытыми с done_at = «Aktualisiert»); по статусам: " + ", ".join(f"{k} {v}" for k, v in by_status.most_common()))
    if no_title:
        b.issues.append(f"Работа · Dev Aufgaben: строки без названия пропущены — {rows_list(no_title)}")
    if status_issue:
        b.issues.append(f"Работа · Dev Aufgaben: статус не из списка, поставлю Offen — строки {rows_list(status_issue)}")
    return people


def _legend(ws, b: Batch, involved: set[str]) -> None:
    lines: list[str] = []
    people: dict[str, str | None] = {}
    for _, r in rows(ws, 13):
        pairs = [(0, 1, "Status"), (3, 4, "Typ"), (6, 7, "Priorität")]
        for a, c, label in pairs:
            if a < len(r) and text(r[a]):
                lines.append(f"- **{label} {text(r[a])}** — {text(r[c]) or ''}")
        if len(r) > 9 and text(r[9]):
            lines.append(f"- **Bereich** {text(r[9])}")
        if len(r) > 11 and text(r[11]):
            people[text(r[11])] = text(r[12]) if len(r) > 12 else None
    for name in sorted(involved):
        people.setdefault(name, None)
    for name, role in people.items():
        b.add("people", {"source_id": f"work:person:{name.lower()}", "name": name, "role": role})
    if lines:
        b.add("notes", {"source_id": "work:legende", "sphere": "work", "title": "Legende", "body_md": "\n".join(lines), "pinned": False})
    from_legend = sum(1 for v in people.values() if v)
    b.report.append(f"Работа · Legende: людей {len(people)} (с ролью из «Legende» — {from_legend}, остальные — из «Beteiligte»), заметка «Legende»")
