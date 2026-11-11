"""Import the four Excel trackers from data/ into Supabase for LIFEHUB_EMAIL (SPEC §6). Local only.

    python3 scripts/import/import.py --dry-run   # summary, nothing is written
    python3 scripts/import/import.py             # write (idempotent by source_id)

The terminal shows counts, aggregates and Excel row numbers only. Details that need cell texts (candidate
rows to decide on) go to data/import-dry-run.txt — data/ is never committed.

App data wins: rows already in the base (same source_id) are not overwritten; a day already marked in the app
gets only its empty fields from Excel; an activity already logged that day is not doubled.
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from collections import defaultdict
from typing import Any

import openpyxl

import plan
import src_budget
import src_glow
import src_study
import src_work
from model import Batch
from supabase_rest import ConfigError, SupabaseError, SupabaseRest, config_from_env, load_env
from xl import DATA, col, find_file

# Structure check (Ая edits the files): (sheet, header row) → required header texts by column.
EXPECTED = {
    "budget": {
        ("Статьи", 1): {"A": "ID", "C": "Дата", "D": "Группа", "E": "Статья", "F": "Сумма", "G": "Знак", "J": "Заметка"},
        ("Недели", 1): {"A": "№", "C": "Начало", "D": "Конец", "F": "Где", "G": "Продукты", "L": "Доставка"},
        ("Календарь", 1): {"C": "Дата", "D": "Что", "E": "Сумма", "F": "Тип", "G": "Счёт", "H": "Что сделать"},
        ("Конверты и копилки", 1): {"A": "Название", "B": "Тип", "C": "Сумма", "D": "Когда", "E": "Заметка"},
        ("Правила", 1): {"B": "Правило", "C": "Подробно"},
    },
    "work": {
        ("Dev Aufgaben", 1): {"B": "Typ", "C": "Bereich", "D": "Status", "E": "Prio", "F": "Fällig am", "H": "Nächster Schritt", "I": "Wartet auf", "J": "Beteiligte", "K": "ClickUp", "L": "Branch", "M": "Details", "N": "Angelegt", "O": "Aktualisiert"},
        ("Legende", 13): {"A": "Status", "D": "Typ", "G": "Priorität", "J": "Bereich", "L": "Person", "M": "Rolle"},
    },
    "study": {
        ("План по неделям", 1): {"A": "Неделя", "B": "Даты", "C": "Где", "T": "Ёмкость база", "U": "Ёмкость макс"},
        ("Чеклист", 1): {"A": "Неделя", "B": "Даты", "C": "Предмет", "D": "Тип", "E": "Что закрыть", "F": "Связь", "G": "~ч", "H": "Срок", "I": "Готово к", "J": "✓"},
        ("Дедлайны и тесты", 1): {"A": "Дата", "C": "Время", "D": "Предмет", "E": "Что сдавать", "F": "Крайний день", "H": "Неделя плана", "I": "Статус данных"},
        ("Допущения и открытые вопросы", 2): {"B": "Предмет", "C": "Допущение", "D": "Как обновить"},
    },
    "glow": {
        ("Трекер", 5): {"A": "Дата", "E": "Утренний старт", "F": "10 мин", "G": "Вода", "I": "Тренировка", "J": "Минут", "K": "Крем", "L": "Вечер", "M": "Энергия", "N": "Провал", "O": "Сон", "P": "Настроение", "Q": "Заметки"},
        ("Недели", 5): {"A": "Нед.", "B": "Начало", "C": "Конец", "D": "Этап", "E": "События", "K": "Силовые цель", "M": "Группы цель", "O": "Ретиноид цель"},
        ("Сила", 4): {"A": "Дата", "B": "Тренировка", "C": "Упражнение", "D": "Подход 1", "G": "Резинка", "I": "Тяжело", "J": "Заметки"},
        ("Замеры", 5): {"A": "Дата", "B": "Талия", "C": "Бёдра", "D": "Бедро", "E": "Плечо", "F": "Вес", "G": "Фото тела", "H": "Фото лица", "I": "Фото пробора"},
        ("Задачи", 4): {"A": "Задача", "B": "Срок", "C": "Когда по плану", "D": "Статус", "E": "Заметки"},
        ("Врачи", 5): {"A": "Врач", "B": "Где", "C": "Когда", "D": "Статус", "E": "Дата приёма"},
    },
}

TABLE_ORDER = [
    "weeks", "week_limits", "envelopes", "transactions", "people", "items", "notes",
    "activity_types", "activities", "daily_logs", "strength_sets", "measurements", "plan_stages",
]
CONFLICT = {"week_limits": "user_id,week_id,category", "people": "user_id,name", "activity_types": "user_id,name", "measurements": "user_id,date", "weeks": "user_id,start_date"}
WEEK_COLUMNS = ["start_date", "end_date", "budget_week_no", "study_week", "glowup_week_no", "place_mode", "events", "capacity_base_h", "capacity_max_h"]
DAILY_FIELDS = ["morning", "outside", "water", "body_cream", "face_evening", "energy", "slump", "sleep_h", "mood", "note"]


def check_structure(kind: str, wb) -> list[str]:
    problems = []
    for (sheet, hdr), cols in EXPECTED[kind].items():
        if sheet not in wb.sheetnames:
            problems.append(f"{kind}: нет листа «{sheet}»")
            continue
        header = next(wb[sheet].iter_rows(min_row=hdr, max_row=hdr, values_only=True), ())
        for letter, want in cols.items():
            j = col(letter)
            got = str(header[j]).strip() if j < len(header) and header[j] is not None else ""
            if want.lower() not in got.lower():
                problems.append(f"{kind} · {sheet}: в колонке {letter} строки {hdr} ожидалось «{want}»")
    return problems


def load(today: dt.date) -> tuple[Batch, list[str]]:
    b = Batch(today=today)
    problems: list[str] = []
    books = {}
    for kind in ("budget", "work", "study", "glow"):
        path = find_file(kind)
        # glow-up: not read-only — the activity types are the «Тренировка» dropdown list
        books[kind] = openpyxl.load_workbook(path, data_only=True, read_only=kind != "glow")
        problems += check_structure(kind, books[kind])
    if problems:
        return b, problems
    src_budget.build(books["budget"], b)
    src_work.build(books["work"], b)
    src_study.build(books["study"], b)
    src_glow.build(books["glow"], b)
    for i in b.rows["items"]:  # every study week an item points to has a week row
        if i.get("week"):
            b.week(i["week"])
    for w in b.weeks.values():
        mode = w.pop("study_mode", None)
        if mode and not w.get("place_mode"):
            w["place_mode"] = mode
        elif mode and mode != w.get("place_mode"):
            w["events"] = f"{w['events']} · {mode}" if w.get("events") else mode
    return b, []


class State:
    """What is already in the base for this user (bookkeeping only, never printed row by row)."""

    def __init__(self, rest: SupabaseRest, uid: str):
        f = {"user_id": f"eq.{uid}"}
        self.source_ids: dict[str, set[str]] = {}
        self.app_rows: dict[str, int] = {}
        for t in TABLE_ORDER:
            if t == "weeks":
                continue
            rows = rest.select(t, "source_id", f)
            self.source_ids[t] = {r["source_id"] for r in rows if r["source_id"]}
            self.app_rows[t] = sum(1 for r in rows if not r["source_id"])
        self.weeks = {r["start_date"]: r for r in rest.select("weeks", "id,start_date", f)}
        self.daily = {r["date"]: r for r in rest.select("daily_logs", ",".join(["id", "date", *DAILY_FIELDS]), f)}
        self.types = {r["name"]: r["id"] for r in rest.select("activity_types", "id,name", f)}
        self.activities = {(r["date"], r["type_id"]) for r in rest.select("activities", "date,type_id", f)}
        self.limits = {(r["week_id"], r["category"]) for r in rest.select("week_limits", "week_id,category,source_id", f) if not r["source_id"]}
        self.measure_days = {r["date"] for r in rest.select("measurements", "date", f)}
        self.app_expenses = [r for r in rest.select("transactions", "date,amount_eur,source_id,kind", f) if not r["source_id"] and r["kind"] == "expense"]


def summary(b: Batch, st: State) -> list[str]:
    out: list[str] = ["", "=== Что придёт (Excel → база) ==="]
    for t in TABLE_ORDER:
        if t == "weeks":
            new = sum(1 for m in b.weeks if m.isoformat() not in st.weeks)
            out.append(f"weeks: {len(b.weeks)} недель — новых {new}, дополню существующие {len(b.weeks) - new}")
            continue
        rows = b.rows.get(t, [])
        if not rows:
            continue
        existing = sum(1 for r in rows if r.get("source_id") in st.source_ids.get(t, set()))
        extra = ""
        if t == "daily_logs":
            clash = sum(1 for r in rows if r["date"] in st.daily)
            extra = f"; уже отмечены в приложении {clash} — из Excel только пустые поля" if clash else ""
        if t == "activities":
            dup = sum(1 for r in rows if (r["date"], st.types.get(r["type"])) in st.activities)
            extra = f"; уже есть в приложении (тот же день и тип) {dup} — не дублирую" if dup else ""
        if t == "activity_types":
            known = sum(1 for r in rows if r["name"] in st.types)
            extra = f"; уже есть {known} (интенсивность и очки не трогаю)" if known else ""
        if t == "week_limits":
            replaced = sum(1 for r in rows if (st.weeks.get(r["week"].isoformat(), {}).get("id"), r["category"]) in st.limits)
            extra = f"; заменят заданные вручную {replaced}" if replaced else ""
        if t == "measurements":
            clash = sum(1 for r in rows if r["date"] in st.measure_days)
            extra = f"; в эти дни уже есть замер {clash} — не трогаю" if clash else ""
        out.append(f"{t}: {len(rows)}" + (f" — уже в базе {existing} (не перезаписываю)" if existing else "") + extra + (f"; своих строк из приложения {st.app_rows.get(t, 0)} остаются" if st.app_rows.get(t) else ""))
    return out


def study_table(b: Batch) -> list[str]:
    stats, s = plan.rollover_preview(b.rows["items"], b.weeks, b.today)
    out = ["", "=== Учёба по неделям (после импорта и автопереноса при первом открытии) ===", "неделя | пунктов | придут ✓ | гибких открытых | поедут в текущую | «Ждут решения»"]
    current = s["current"]
    for w in stats:
        past = w.monday < current
        mark = " ← текущая" if w.monday == current else ""
        out.append(f"{w.label} | {w.total} | {w.done} | {w.flexible_open if past else '—'} | {w.moves if past else '—'} | {w.waiting if past else '—'}{mark}")
    moves = sum(w.moves for w in stats)
    waiting = sum(w.waiting for w in stats)
    out.append(
        f"Итого из прошлых недель: поедут {moves} ({s['moved_hours']:g} ч), ждут решения {waiting} ({s['waiting_hours']:g} ч). "
        f"{s['label']}: {s['load_before']:g} ч → {s['load_after']:g} ч при базе {s['base']:g} и максимуме {s['max']:g}."
    )
    out.append("Жёсткие (со сроком) не переезжают: после срока — «просрочено» с «сдано позже / снять».")
    return out


def checks(b: Batch, st: State) -> list[str]:
    tx = b.rows["transactions"]
    bal = plan.balance_end(tx)
    h04 = plan.week_hours(b.rows["items"], "Н04", b.weeks)
    checklist = sum(1 for i in b.rows["items"] if i["source_id"].startswith("study:") and ":dl:" not in i["source_id"] and not i["source_id"].startswith("study:dl:"))
    work = sum(1 for i in b.rows["items"] if i["sphere"] == "work")
    out = ["", "=== Проверки раздела 6 (по данным Excel) ==="]
    out.append(f"остаток на 31.12.2026 по импортированным операциям: {bal:.2f} € (SPEC: 1788.14 €){' ✓' if abs(bal - 1788.14) < 0.005 else ' — отличается'}")
    out.append(f"часов учёбы в Н04: {h04:g} (SPEC: 27.5){' ✓' if abs(h04 - 27.5) < 0.01 else ' — отличается (файл правился)'}")
    out.append(f"пунктов чеклиста: {checklist}; задач Работы: {work}")
    if st.app_expenses:
        weeks = {m for m in b.weeks if b.weeks[m].get("budget_week_no")}
        inside = [e for e in st.app_expenses if any(m.isoformat() <= e["date"] <= (m + dt.timedelta(days=6)).isoformat() for m in weeks)]
        if inside:
            out.append(f"трат из приложения в неделях бюджета: {len(inside)} на {sum(float(e['amount_eur']) for e in inside):.2f} € — они останутся и войдут в баланс рядом с импортом (см. вопрос про «Неделя N»)")
    return out


def write(b: Batch, rest: SupabaseRest, uid: str, st: State) -> None:
    # weeks first: everything else points to them
    week_rows = []
    for m, w in sorted(b.weeks.items()):
        row = {k: w.get(k) for k in WEEK_COLUMNS}
        week_rows.append({"user_id": uid, **row})
    saved = rest.insert("weeks", week_rows, CONFLICT["weeks"], ignore_duplicates=False, returning="id,start_date")
    week_id = {r["start_date"]: r["id"] for r in saved} | {k: v["id"] for k, v in st.weeks.items()}

    def prep(t: str, r: dict[str, Any]) -> dict[str, Any] | None:
        r = {k: v for k, v in r.items()}
        r["user_id"] = uid
        if "week" in r:
            w = r.pop("week")
            r["week_id"] = week_id.get(w.isoformat()) if w else None
            if t == "week_limits" and not r["week_id"]:
                return None
        if t == "activities":
            r["type_id"] = types.get(r.pop("type"))
            if not r["type_id"] or (r["date"], r["type_id"]) in st.activities:
                return None
        return r

    types: dict[str, str] = {}
    for t in TABLE_ORDER:
        if t in ("weeks",):
            continue
        if t == "activities":
            types = {r["name"]: r["id"] for r in rest.select("activity_types", "id,name", {"user_id": f"eq.{uid}"})}
        rows = b.rows.get(t, [])
        if t == "daily_logs":
            _write_days(rest, uid, rows, st)
            continue
        ready = [p for p in (prep(t, r) for r in rows) if p]
        if t not in ("week_limits",):
            ready = [r for r in ready if r.get("source_id") not in st.source_ids.get(t, set())]
        # rows with different key sets go separately: a missing key must stay a DB default, not null
        groups: dict[frozenset, list] = defaultdict(list)
        for r in ready:
            groups[frozenset(r)].append(r)
        for group in groups.values():
            rest.insert(t, group, CONFLICT.get(t, "user_id,source_id"), ignore_duplicates=t != "week_limits")
        print(f"записано {t}: {len(ready)}")


def _write_days(rest: SupabaseRest, uid: str, rows: list[dict], st: State) -> None:
    new, filled = [], 0
    for r in rows:
        have = st.daily.get(r["date"])
        if not have:
            new.append({"user_id": uid, **r})
            continue
        patch = {}
        for k in DAILY_FIELDS:
            v = r.get(k)
            if v in (None, False, ""):
                continue
            if have.get(k) in (None, False, ""):
                patch[k] = v
        if patch:
            rest.patch("daily_logs", {"id": f"eq.{have['id']}"}, patch)
            filled += 1
    groups: dict[frozenset, list] = defaultdict(list)
    for r in new:
        groups[frozenset(r)].append(r)
    for g in groups.values():
        rest.insert("daily_logs", g, "user_id,date", ignore_duplicates=True)
    print(f"записано daily_logs: новых {len(new)}, дополнено {filled}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="только сводка, без записи")
    ap.add_argument("--today", help="дата импорта YYYY-MM-DD (по умолчанию сегодня, Берлин)")
    args = ap.parse_args()
    today = dt.date.fromisoformat(args.today) if args.today else dt.datetime.now(dt.timezone(dt.timedelta(hours=1))).date()

    try:
        cfg = config_from_env(load_env())
        if not cfg.email:
            raise ConfigError("LIFEHUB_EMAIL не задан в .env.local")
        rest = SupabaseRest(cfg.url, cfg.secret_key)
        uid = rest.find_user_id(cfg.email)
    except (ConfigError, SupabaseError) as err:
        print(f"✗ {err}")
        return 1

    try:
        b, problems = load(today)
    except FileNotFoundError as err:
        print(f"✗ {err}")
        return 1
    if problems:
        print("✗ Структура файлов изменилась — импорт остановлен:")
        for p in problems:
            print("  - " + p)
        return 1

    st = State(rest, uid)
    print(f"Импорт {'(dry-run, ничего не пишу)' if args.dry_run else ''} · дата импорта {today:%d.%m.%Y}")
    print("\n=== Листы ===")
    for line in b.report:
        print(line)
    for line in summary(b, st) + study_table(b) + checks(b, st):
        print(line)
    if b.issues:
        print("\n=== Проблемы (номера строк Excel) ===")
        for line in b.issues:
            print("- " + line)
    if b.questions:
        print("\n=== Вопросы до записи ===")
        for k, q in enumerate(b.questions, 1):
            print(f"{k}. {q}")
    private = DATA / "import-dry-run.txt"
    private.write_text("\n".join(["Детали dry-run (тексты строк) — только локально, data/ не в git.", ""] + b.private) + "\n", encoding="utf-8")
    print(f"\nДетали с текстами строк: {private.relative_to(DATA.parent)} ({len(b.private)} строк)")

    if args.dry_run:
        return 0
    try:
        write(b, rest, uid, st)
    except SupabaseError as err:
        print(f"✗ запись остановлена: {err}")
        return 1
    print("Готово.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
