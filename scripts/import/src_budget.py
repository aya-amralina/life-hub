"""Budget_Oct-Dec_2026.xlsx → transactions, weeks + week_limits, envelopes, notes (SPEC §6)."""
from __future__ import annotations

import datetime as dt
import re
from collections import Counter

from model import Batch, noon, rows_list
from xl import excel_date, number, parse_text_date, rows, stable_id, text

CATEGORIES = ["Продукты", "Кофейни и перекусы", "Выходы и еда вне дома", "Мелочи", "Шопинг", "Доставка"]
GROUPS = {"Доход", "Обязательное", "Поездки и события", "Долги", "Жизнь", "Буфер"}


def build(wb, b: Batch) -> None:
    ops = _articles(wb["Статьи"], b)
    _weeks(wb["Недели"], b)
    _calendar(wb["Календарь"], b, ops)
    _envelopes(wb["Конверты и копилки"], b)
    _rules(wb["Правила"], b)


def _articles(ws, b: Batch) -> list[tuple[int, dict]]:
    ops: list[tuple[int, dict]] = []
    skipped: list[int] = []
    ended_weeks: list[int] = []
    for n, r in rows(ws, 1):
        sid, date, group, title, amount, sign, note = text(r[0]), excel_date(r[2]), text(r[3]), text(r[4]), number(r[5]), number(r[6]), text(r[9])
        if not sid or not date or amount is None or not title:
            skipped.append(n)  # footnotes under the table
            continue
        if sid.upper() == "S0" or group == "Старт":
            kind = "opening"
        elif sign is not None and sign > 0:
            kind = "income"
        elif sign is not None and sign < 0:
            kind = "expense"
        else:
            b.issues.append(f"Бюджет · Статьи, строка {n}: нет знака ±1")
            continue
        # «Неделя N: …» without «(факт)» is a week budget (rule 18a): planned, never auto-confirmed, no question.
        week_budget = kind == "expense" and group == "Жизнь" and title.startswith("Неделя") and "(факт)" not in title
        if week_budget and date + dt.timedelta(days=6 - date.weekday()) < b.today:
            # a week that ended before the import: its budget becomes the week's fact (correctable in the app)
            week_budget = False
            title = re.sub(r"^(Неделя\s+\d+)\s*:", r"\1 (факт):", title, count=1)
            if "(факт)" not in title:
                title = re.sub(r"^(Неделя\s+\d+)", r"\1 (факт)", title, count=1)
            ended_weeks.append(n)
        planned = week_budget or date > b.today
        row = {
            "source_id": f"budget:{sid}",
            "date": date.isoformat(),
            "amount_eur": round(abs(amount), 2),
            "kind": kind,
            "grp": group if group in GROUPS else None,
            "category": None,
            "title": title,
            "note": note,
            "account": None,
            "is_planned": planned,
            "confirmed_at": None if planned else noon(date),
            "week_budget": week_budget,
        }
        if group and group not in GROUPS and kind != "opening":
            b.issues.append(f"Бюджет · Статьи, строка {n}: группа не из справочника — оставлю пустой")
        b.add("transactions", row)
        ops.append((n, row))

    by_kind = Counter(o["kind"] for _, o in ops)
    confirmed = [o for _, o in ops if not o["is_planned"]]
    planned = [o for _, o in ops if o["is_planned"]]
    weekly = [o for o in planned if o["week_budget"]]
    monday = b.today - dt.timedelta(days=b.today.weekday())
    current = [o for o in weekly if monday <= dt.date.fromisoformat(o["date"]) <= monday + dt.timedelta(days=6)]
    b.report.append(
        f"Бюджет · Статьи: {len(ops)} операций (старт {by_kind['opening']}, доходы {by_kind['income']}, расходы {by_kind['expense']}); "
        f"подтверждёнными — {len(confirmed)}, плановыми — {len(planned)}"
    )
    b.report.append(
        f"  плановые: обычные {len(planned) - len(weekly)} (доходы {sum(o['kind'] == 'income' and not o['week_budget'] for o in planned)}, "
        f"расходы {sum(o['kind'] == 'expense' and not o['week_budget'] for o in planned)}) — спросят «Пришло? / Списалось?» в свой день; "
        f"бюджеты недель «Неделя N» {len(weekly)} — без вопроса (текущая неделя {len(current)})"
    )
    if ended_weeks:
        b.report.append(f"  недели, закончившиеся до импорта, → подтверждённые «Неделя N (факт)» на сумму бюджета: строки {rows_list(ended_weeks)}")
    if skipped:
        b.report.append(f"  пропущены строки без ID/даты/суммы (сноски): {rows_list(skipped)}")
    return ops


def _weeks(ws, b: Batch) -> None:
    header = [text(h) for h in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]
    cat_cols = {c: header.index(c) for c in CATEGORIES if c in header}
    missing = [c for c in CATEGORIES if c not in cat_cols]
    if missing:
        b.issues.append(f"Бюджет · Недели: нет колонок {', '.join(missing)}")
    n_weeks = limits = 0
    for n, r in rows(ws, 1):
        no, start = number(r[0]), excel_date(r[2])
        if no is None or not start:
            continue
        monday = start - dt.timedelta(days=start.weekday())
        b.week(monday, budget_week_no=int(no), place_mode=text(r[5]))
        n_weeks += 1
        for cat, j in cat_cols.items():
            v = number(r[j])
            if v is None:
                continue
            b.add("week_limits", {"source_id": f"budget:week{int(no)}:{cat}", "week": monday, "category": cat, "limit_eur": round(v, 2)})
            limits += 1
    b.report.append(f"Бюджет · Недели: {n_weeks} недель (пн–вс), лимитов {limits}")


def _calendar(ws, b: Batch, ops: list[tuple[int, dict]]) -> None:
    matched, unmatched, actions, tasks = 0, [], [], []
    archive = []
    for n, r in rows(ws, 1):
        archive.append("- " + " · ".join(str(v.strftime("%d.%m") if isinstance(v, (dt.date, dt.datetime)) else v).strip() for v in r[1:8] if v not in (None, "")))
        date, what, amount, kind, account, todo = excel_date(r[2]), text(r[3]), number(r[4]), text(r[5]), text(r[6]), text(r[7])
        if not date:
            continue
        for title, due in future_actions(todo, date, b.today, what):
            # an action still ahead (e.g. «Отмени Uber One до 13.11») becomes a money task
            b.add("items", {"source_id": f"budget:todo:{stable_id(due.isoformat(), title)}", "sphere": "money", "title": title, "status": "открыто", "due_date": due.isoformat(), "notes": todo, "done_at": None})
            tasks.append(n)
            b.private.append(f"Задача Денег из «Календаря», строка {n}: до {due:%d.%m} · {title}")
        same_amount = [o for _, o in ops if amount is not None and abs(o["amount_eur"] - abs(amount)) < 0.005]
        cands = [o for o in same_amount if o["date"] == date.isoformat()]
        if not cands:  # «~15.11», ranges: the calendar date can differ by a few days
            cands = sorted((o for o in same_amount if abs((dt.date.fromisoformat(o["date"]) - date).days) <= 7), key=lambda o: abs((dt.date.fromisoformat(o["date"]) - date).days))
        if len(cands) > 1 and what:
            cands = [o for o in cands if what.lower()[:6] in o["title"].lower()] or cands[:1]
        if cands:
            op = cands[0]
            matched += 1
            if account:
                op["account"] = account
            if todo:
                op["note"] = f"{op['note']}\n{todo}" if op["note"] else todo
                actions.append(n)
                b.private.append(f"Бюджет · Календарь, строка {n}: {date:%d.%m} · {what or ''} · что сделать: {todo}")
        else:
            unmatched.append(n)
            b.private.append(f"Бюджет · Календарь, строка {n} (без пары в «Статьях»): {date:%d.%m} · {kind or ''} · {what or ''} · {amount if amount is not None else ''}")
    b.add("notes", {"source_id": "budget:calendar", "sphere": "money", "title": "Календарь списаний (архив)", "body_md": "\n".join(archive), "pinned": False})
    b.report.append(
        f"Бюджет · Календарь: сопоставлено с «Статьями» {matched} (счёт и «Что сделать» → в операцию, «Что сделать» — {len(actions)}), "
        f"без пары {len(unmatched)}; весь лист ({len(archive)} строк) → заметка «Календарь списаний (архив)»; "
        f"задач Денег (действие сегодня или позже) {len(tasks)}" + (f" — строки {rows_list(tasks)}" if tasks else "")
    )


ACTION = re.compile(r"(отмени|отменить|закр[оы]|переве|перекин|оплат|отда[йт]|верн|подай|подать|запиш|продли|позвони|напиши|купи|сними|жильцу|€\s*(?:—|→)\s*(?:в\s+)?[«A-ZА-Я])", re.I)
DUE_IN_TEXT = re.compile(r"\bдо\s+(\d{1,2}\.\d{1,2})")


def future_actions(todo: str | None, row_date: dt.date, today: dt.date, what: str | None) -> list[tuple[str, dt.date]]:
    """Actions of «Что сделать» due today or later. A sentence with its own date («Отмени Uber One до 13.11») is a
    task of its own; other action sentences of the row make one task named after the operation, due on the row's
    date. Explanations («Не трогать», «ничего не списывается») are skipped."""
    out: list[tuple[str, dt.date]] = []
    row_actions = []
    for sentence in re.split(r"(?<=[.!])\s+", todo or ""):
        sentence = sentence.strip().rstrip(".")
        if not sentence or not ACTION.search(sentence):
            continue
        m = DUE_IN_TEXT.search(sentence)
        own = parse_text_date(m[1]) if m else None
        if own:
            if own.date >= today:
                out.append((sentence[:140], own.date))
        else:
            row_actions.append(sentence)
    if row_actions and row_date >= today:
        out.append(((what or row_actions[0])[:140], row_date))
    return out


def _envelopes(ws, b: Batch) -> None:
    kinds = {"Конверт": "envelope", "Копилка": "pot"}
    n_ok, other = 0, []
    for n, r in rows(ws, 1):
        name, kind, amount, when, note = text(r[0]), text(r[1]), number(r[2]), text(r[3]), text(r[4])
        if not name:
            continue
        if kind not in kinds:
            other.append((n, kind))
            continue
        b.add("envelopes", {"source_id": f"budget:env:{name.lower()}", "name": name, "type": kinds[kind], "planned_eur": round(amount, 2) if amount is not None else None, "when_text": when, "note": note})
        n_ok += 1
    debts = [n for n, k in other if k == "Долг"]
    rest = [n for n, k in other if k != "Долг"]
    b.report.append(f"Бюджет · Конверты и копилки: {n_ok}" + (f"; «Долг» пропущено {len(debts)} (строки {rows_list(debts)})" if debts else "") + (f"; строки без типа (итоги/разделы) — {rows_list(rest)}" if rest else ""))


def _rules(ws, b: Batch) -> None:
    n_ok = 0
    for n, r in rows(ws, 1):
        no, rule, detail = r[0], text(r[1]), text(r[2])
        if not rule:
            continue
        b.add("notes", {"source_id": f"budget:rule:{no if no is not None else n}", "sphere": "money", "title": rule, "body_md": detail, "pinned": True})
        n_ok += 1
    b.report.append(f"Бюджет · Правила: {n_ok} закреплённых заметок")
