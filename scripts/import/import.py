"""Import / update the four Excel trackers from data/ into Supabase for LIFEHUB_EMAIL (SPEC §6). Local only.

    npm run import:check    # = import.py --dry-run: what will be added, updated, cancelled; conflicts; forecast
    npm run import:apply    # = import.py: write, then remember this Excel as the new baseline
    import.py --excel-wins N8,D15   # take Excel for these conflicts (or `all`)

Each run compares three versions per row (table + key: budget IDs like N8, otherwise stable sheet keys):
the Excel of the last run (baseline, kept in import_baseline), the Excel now and the base. Changed only in
Excel → updated; changed in the app as well → a conflict, left as is; gone from Excel → cancelled / taken off.
Excel leads for plans and week totals, the app for marks and the current week's expenses. Days marked in the
app get only empty fields from the tracker; activities are never doubled.

The terminal shows counts, IDs and field names only. Values for conflicts and candidate rows go to
data/import-dry-run.txt — data/ is never committed.
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from collections import defaultdict
from typing import Any

import openpyxl

import plan
import update as upd
import src_budget
import src_glow
import src_study
import src_work
from model import Batch
from supabase_rest import ConfigError, SupabaseError, SupabaseRest, config_from_env, load_env
from xl import DATA, col, find_file

# weeks.end_date is generated in the base (start_date + 6) — never sent.
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
        # «Уход» columns (K…) are read by their names: the list changes with products
        ("Трекер", 5): {"A": "Дата", "E": "Утренний старт", "F": "10 мин", "G": "Вода", "I": "Тренировка", "J": "Минут", "M": "Энергия", "N": "Провал", "O": "Сон", "P": "Настроение", "Q": "Заметки"},
        # targets «… цель» are read by name (care products change)
        ("Недели", 5): {"A": "Нед.", "B": "Начало", "C": "Конец", "D": "Этап", "E": "События"},
        ("Сила", 4): {"A": "Дата", "B": "Тренировка", "C": "Упражнение", "D": "Подход 1", "G": "Резинка", "I": "Тяжело", "J": "Заметки"},
        ("Замеры", 5): {"A": "Дата", "B": "Талия", "C": "Бёдра", "D": "Бедро", "E": "Плечо", "F": "Вес", "G": "Фото тела", "H": "Фото лица", "I": "Фото пробора"},
        ("Задачи", 4): {"A": "Задача", "B": "Срок", "C": "Когда по плану", "D": "Статус", "E": "Заметки"},
        ("Врачи", 5): {"A": "Врач", "B": "Где", "C": "Когда", "D": "Статус", "E": "Дата приёма"},
    },
}

TABLE_ORDER = [
    "weeks", "week_limits", "envelopes", "debts", "transactions", "actual_balances", "people", "items", "notes",
    "activity_types", "activities", "daily_logs", "strength_sets", "measurements", "plan_stages",
]
THREE_WAY = ["transactions", "week_limits", "envelopes", "debts", "actual_balances", "items", "notes", "people", "plan_stages"]
CONFLICT = {"week_limits": "user_id,week_id,category", "people": "user_id,name", "activity_types": "user_id,name", "measurements": "user_id,date", "weeks": "user_id,start_date"}
WEEK_COLUMNS = ["start_date", "budget_week_no", "study_week", "glowup_week_no", "place_mode", "events", "capacity_base_h", "capacity_max_h"]
DAILY_FIELDS = ["morning", "outside", "water", "care", "face_evening", "energy", "slump", "sleep_h", "mood", "note"]
TABLE_RU = {
    "transactions": "операции", "week_limits": "лимиты недель", "envelopes": "конверты и цели", "debts": "долги",
    "actual_balances": "остатки", "items": "пункты", "notes": "заметки", "people": "люди", "plan_stages": "этапы",
}


def check_structure(kind: str, wb) -> list[str]:
    if kind == "budget":
        return src_budget.structure(wb)  # strictly docs/EXCEL_FORMAT.md
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


def load(today: dt.date, anchor: dt.date | None, folder=DATA, fallback=DATA) -> tuple[Batch, list[str]]:
    """Read the four files (from `folder`, missing ones from `fallback`) into a Batch."""
    b = Batch(today=today, anchor=anchor)
    problems: list[str] = []
    books = {}
    for kind in ("budget", "work", "study", "glow"):
        try:
            path = find_file(kind, folder)
        except FileNotFoundError:
            path = find_file(kind, fallback)
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


COLUMNS = {
    "transactions": "id,source_id,date,amount_eur,title,note,account,grp,kind,entry_kind,week_no,envelope_id,debt_id,is_planned,confirmed_at,cancelled_at,category",
    "week_limits": "id,source_id,limit_eur,week_id,category",
    "envelopes": "id,source_id,name,type,planned_eur,when_text,note,goal_eur,goal_date,archived",
    "debts": "id,source_id,who,direction,amount_eur,repaid_eur,due_date,status,pot_id,note",
    "actual_balances": "id,source_id,date,account,envelope_id,amount_eur",
    "items": "*",
    "notes": "id,source_id,title,body_md,pinned",
    "people": "id,source_id,name,role",
    "plan_stages": "id,source_id,start_date,end_date,targets,habits,care_items,minimum_habits",
}


class State:
    """What is in the base for this user (bookkeeping only, never printed row by row)."""

    def __init__(self, rest: SupabaseRest, uid: str):
        f = {"user_id": f"eq.{uid}"}
        self.rows: dict[str, dict[str, dict]] = {}
        for t in THREE_WAY:
            self.rows[t] = {r["source_id"]: r for r in rest.select(t, COLUMNS[t], {**f, "source_id": "not.is.null"})}
        self.source_ids = {t: set(v) for t, v in self.rows.items()}
        for t in ("activity_types", "activities", "strength_sets", "measurements", "daily_logs"):
            self.source_ids[t] = {r["source_id"] for r in rest.select(t, "source_id", {**f, "source_id": "not.is.null"})}
        self.weeks = {r["start_date"]: r for r in rest.select("weeks", "id,start_date", f)}
        self.daily = {r["date"]: r for r in rest.select("daily_logs", ",".join(["id", "date", *DAILY_FIELDS]), f)}
        self.types = {r["name"]: r["id"] for r in rest.select("activity_types", "id,name", f)}
        self.activities = {(r["date"], r["type_id"]) for r in rest.select("activities", "date,type_id", f)}
        self.measure_days = {r["date"] for r in rest.select("measurements", "date", f)}
        self.balances = rest.select("actual_balances", "date,account,amount_eur,source_id", f)
        self.all_tx = rest.select("transactions", "source_id,date,amount_eur,kind,grp,category,entry_kind,is_planned,confirmed_at,cancelled_at", f)
        # source keys of linked rows (envelopes incl. archived, debts) — links are compared by key
        self.keys = {r["id"]: r["source_id"] for t in ("envelopes", "debts") for r in rest.select(t, "id,source_id", {**f, "source_id": "not.is.null"})}
        self.baseline: dict[str, dict[str, dict]] = {}
        for r in rest.select("import_baseline", "table_name,source_id,data,removed", f):
            self.baseline.setdefault(r["table_name"], {})[r["source_id"]] = upd.from_json({**r["data"], "removed": r["removed"]})
        created = [r["created_at"] for r in rest.select("transactions", "created_at", {**f, "source_id": "not.is.null", "order": "created_at.asc", "limit": "1"})]
        self.first_import = dt.date.fromisoformat(created[0][:10]) if created else None


def ctx_for(st: State, week_ids: dict[str, str] | None = None, keys: dict[str, str] | None = None) -> dict:
    ids = {k: v["id"] for k, v in st.weeks.items()} | (week_ids or {})
    key_of = {**st.keys, **(keys or {})}
    return {"week_id": ids, "week_start": {v: k for k, v in ids.items()}, "key_of": key_of, "id_of": {v: k for k, v in key_of.items()}}


def bootstrap_baseline(st: State, today: dt.date) -> tuple[dict[str, dict[str, dict]], str]:
    """No baseline stored yet: rebuild the Excel of the first import from data/_old (missing files from data/)."""
    if not any(st.rows.values()):
        return {}, "первый импорт"
    old_dir = DATA / "_old"
    if not old_dir.exists():
        return {}, "базовой линии нет и data/_old нет — сравниваю с базой (правки в приложении не отличить)"
    anchor = st.first_import or today
    ob, problems = load(anchor, anchor, folder=old_dir, fallback=DATA)
    if problems:
        return {}, "data/_old не читается — сравниваю с базой"
    ctx = ctx_for(st)
    return {t: upd.baseline_records(t, ob.rows.get(t, []), ctx) for t in THREE_WAY}, f"базовая линия — файлы data/_old (импорт {anchor:%d.%m})"


# kinds of rows the budget always makes — a key of these gone from Excel is cancelled even if none are left
FAMILIES = {"transactions": frozenset({"budget"}), "envelopes": frozenset({"budget:env"}), "debts": frozenset({"budget:debt"})}


def plan_changes(b: Batch, st: State, baseline: dict, excel_wins: set[str]) -> dict[str, list[upd.Change]]:
    ctx = ctx_for(st)
    return {
        t: upd.diff(t, b.rows.get(t, []), baseline.get(t, {}), st.rows[t], ctx, excel_wins, b.today, FAMILIES.get(t, frozenset()))
        for t in THREE_WAY
    }


def simulate_tx(st: State, b: Batch, changes: list[upd.Change]) -> list[dict]:
    """The base's operations after this run (for the forecast «after»)."""
    by_key = {t["source_id"]: dict(t) for t in st.all_tx if t["source_id"]}
    app = [dict(t) for t in st.all_tx if not t["source_id"]]
    for c in changes:
        if c.kind == "insert":
            by_key[c.key] = dict(c.row)  # type: ignore[arg-type]
        elif c.kind in ("update", "always", "remove"):
            by_key[c.key] = {**by_key.get(c.key, {}), **c.patch}
    return list(by_key.values()) + app


def summary(b: Batch, st: State, changes: dict[str, list[upd.Change]], note: str) -> list[str]:
    out = ["", f"=== Изменения (Excel ↔ база; {note}) ==="]
    for t, cs in changes.items():
        k = {kind: [c for c in cs if c.kind == kind] for kind in ("insert", "update", "always", "conflict", "remove", "keep-removed")}
        parts = [f"добавится {len(k['insert'])}", f"обновится {len(k['update'])}"]
        if k["always"]:
            parts.append(f"уточнится без конфликта {len(k['always'])} ({', '.join(sorted({f for c in k['always'] for f in c.fields}))})")
        parts.append(f"конфликтов {len(k['conflict'])}")
        if k["remove"]:
            parts.append(f"нет в Excel → {'отменится' if t == 'transactions' else 'в архив' if t == 'envelopes' else 'снимется'} {len(k['remove'])}")
        if k["keep-removed"]:
            parts.append(f"нет в Excel, оставлено {len(k['keep-removed'])}")
        out.append(f"{TABLE_RU[t]}: " + ", ".join(parts))
        for c in k["update"]:
            out.append(f"  ↻ {upd.display_key(t, c.key)}: {', '.join(c.fields)}")
            b.private.append(f"Обновится · {TABLE_RU[t]} {upd.display_key(t, c.key)} «{c.title}»: {c.detail}")
        for c in k["remove"]:
            out.append(f"  ✕ {upd.display_key(t, c.key)}")
            b.private.append(f"Нет в Excel · {TABLE_RU[t]} {upd.display_key(t, c.key)} «{c.title}» → {', '.join(f'{a}={v}' for a, v in c.patch.items())}")
        for c in k["insert"]:
            b.private.append(f"Добавится · {TABLE_RU[t]} {upd.display_key(t, c.key)} «{c.title}»")
    conflicts = [(t, c) for t, cs in changes.items() for c in cs if c.kind == "conflict"]
    if conflicts:
        out += ["", "=== Конфликты: изменено и в Excel, и в приложении — оставлено как в приложении ==="]
        for t, c in conflicts:
            out.append(f"  ! {TABLE_RU[t]} {upd.display_key(t, c.key)}: в Excel — {', '.join(c.fields)}; в приложении — {', '.join(c.app_fields)}")
            b.private.append(f"Конфликт · {TABLE_RU[t]} {upd.display_key(t, c.key)} «{c.title}»: {c.detail}")
        out.append("  Взять Excel: npm run import:apply -- --excel-wins " + ",".join(upd.display_key(t, c.key) for t, c in conflicts))
    simple = []
    for t in ("activity_types", "activities", "strength_sets", "measurements", "daily_logs"):
        rows = b.rows.get(t, [])
        new = [r for r in rows if r.get("source_id") not in st.source_ids.get(t, set())]
        if t == "daily_logs":
            clash = sum(1 for r in rows if r["date"] in st.daily)
            simple.append(f"дни трекера: {len(rows)} (уже отмечены в приложении {clash} — из Excel только пустые поля)")
        elif t == "activity_types":
            simple.append(f"типы активностей: новых {sum(1 for r in rows if r['name'] not in st.types)} из {len(rows)} (по названию; интенсивность не трогаю)")
        elif rows:
            simple.append(f"{t}: новых {len(new)} из {len(rows)}")
    out.append("только добавление: " + "; ".join(simple))
    new_weeks = sum(1 for m in b.weeks if m.isoformat() not in st.weeks)
    out.append(f"недели: {len(b.weeks)} (новых {new_weeks}); поля недель (номера, место, события, ёмкость) — всегда по Excel")
    return out


def checks(b: Batch, st: State, tx_changes: list[upd.Change]) -> list[str]:
    before = plan.app_forecast_all(st.all_tx, b.today)
    after = plan.app_forecast_all(simulate_tx(st, b, tx_changes), b.today)
    excel = plan.balance_end([t for t in b.rows["transactions"]])
    today = b.today.isoformat()
    after_tx = simulate_tx(st, b, tx_changes)
    out = ["", "=== Баланс «сейчас» (старт + «факт») ==="]
    out.append(f"сейчас в приложении: {plan.fact_balance(st.all_tx, today):.2f} € → после записи: {plan.fact_balance(after_tx, today):.2f} €")
    # «Остатки» after the run: rows of the base (review ones stay) + the Excel ones
    excel_bal = {r["source_id"]: r for r in b.rows.get("actual_balances", [])}
    balances = [r for r in st.balances if r.get("source_id") not in excel_bal] + list(excel_bal.values())
    rec = plan.reconcile(balances, after_tx)
    if rec is None:
        out.append("сверка: в «Остатках» нет строк по счетам")
    else:
        verdict = "сходится" if abs(rec["diff"]) < 1 else f"расхождение {rec['diff']:+.2f} €"
        out.append(f"сверка на {rec['date']}: «Остатки» {rec['actual']:.2f} € против расчёта {rec['calculated']:.2f} € — {verdict}" + (f" (нет строк: {', '.join(rec['missing'])})" if rec["missing"] else ""))
    out += ["", "=== Прогноз «На счетах 31.12» ==="]
    out.append(f"сейчас в приложении: {before:.2f} € → после записи: {after:.2f} € (конфликты не применены)")
    out.append(f"по Excel (все строки со знаком, как «Обзор»): {excel:.2f} €")
    h04 = plan.week_hours(b.rows["items"], "Н04", b.weeks)
    out.append(f"часов учёбы в Н04 по Excel: {h04:g}; задач Работы: {sum(1 for i in b.rows['items'] if i['sphere'] == 'work')}")
    return out


def write(b: Batch, rest: SupabaseRest, uid: str, st: State, changes: dict[str, list[upd.Change]]) -> None:
    week_rows = [{"user_id": uid, **{k: w.get(k) for k in WEEK_COLUMNS}} for _, w in sorted(b.weeks.items())]
    saved = rest.insert("weeks", week_rows, CONFLICT["weeks"], ignore_duplicates=False, returning="id,start_date")
    week_id = {k: v["id"] for k, v in st.weeks.items()} | {r["start_date"]: r["id"] for r in saved}
    ctx = ctx_for(st, week_id)

    def prep(t: str, r: dict[str, Any]) -> dict[str, Any] | None:
        r = dict(r)
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
        for k, col in upd.KEY_FIELDS.items():  # links by key → uuid (the parents are written first)
            if k in r:
                key = r.pop(k)
                r[col] = ctx["id_of"].get(key) if key else None
        return r

    def insert_groups(t: str, rows: list[dict]) -> None:
        groups: dict[frozenset, list] = defaultdict(list)
        for r in rows:
            groups[frozenset(r)].append(r)  # a missing key stays a DB default, not null
        for g in groups.values():
            rest.insert(t, g, CONFLICT.get(t, "user_id,source_id"), ignore_duplicates=True)

    types: dict[str, str] = {}
    for t in TABLE_ORDER:
        if t == "weeks":
            continue
        if t == "activities":
            types = {r["name"]: r["id"] for r in rest.select("activity_types", "id,name", {"user_id": f"eq.{uid}"})}
        if t == "daily_logs":
            _write_days(rest, uid, b.rows.get(t, []), st)
            continue
        if t in changes:
            cs = changes[t]
            for c in cs:  # links in patches resolve against the parents written just before
                for k, col in upd.KEY_FIELDS.items():
                    if col in c.patch and c.patch[col] is None and c.row and c.row.get(k):
                        c.patch[col] = ctx["id_of"].get(c.row[k])
            insert_groups(t, [p for p in (prep(t, c.row) for c in cs if c.kind == "insert") if p])
            for c in cs:
                if c.kind in ("update", "always", "remove") and c.patch:
                    patch = dict(c.patch)
                    if "week" in patch:
                        w = patch.pop("week")
                        patch["week_id"] = week_id.get(w.isoformat()) if w else None
                    rest.patch(t, {"id": f"eq.{c.db_id}"}, patch)
            if t in ("envelopes", "debts"):  # children of this run point to the rows just added
                fresh = {r["id"]: r["source_id"] for r in rest.select(t, "id,source_id", {"user_id": f"eq.{uid}", "source_id": "not.is.null"})}
                ctx["key_of"].update(fresh)
                ctx["id_of"].update({v: k for k, v in fresh.items()})
            print(f"{TABLE_RU[t]}: добавлено {sum(c.kind == 'insert' for c in cs)}, обновлено {sum(c.kind in ('update', 'always') for c in cs)}, "
                  f"отменено/снято {sum(c.kind == 'remove' for c in cs)}, конфликтов оставлено {sum(c.kind == 'conflict' for c in cs)}")
        else:
            ready = [p for p in (prep(t, r) for r in b.rows.get(t, [])) if p and p.get("source_id") not in st.source_ids.get(t, set())]
            if t == "activity_types":
                ready = [r for r in ready if r["name"] not in st.types]  # same name = already there
            insert_groups(t, ready)
            if ready:
                print(f"{t}: добавлено {len(ready)}")

    # remember this Excel as the baseline; conflicts keep the old baseline so they show up again next time
    rows = []
    for t in THREE_WAY:
        conflict_keys = {c.key for c in changes[t] if c.kind == "conflict"}
        recs = upd.baseline_records(t, [r for r in b.rows.get(t, []) if r["source_id"] not in conflict_keys], ctx)
        for key, rec in recs.items():
            rows.append({"user_id": uid, "table_name": t, "source_id": key, "data": upd.to_json(rec), "removed": False, "imported_at": dt.datetime.now(dt.timezone.utc).isoformat()})
        for c in changes[t]:
            if c.kind in ("remove", "keep-removed"):
                rows.append({"user_id": uid, "table_name": t, "source_id": c.key, "data": {}, "removed": True, "imported_at": dt.datetime.now(dt.timezone.utc).isoformat()})
    rest.insert("import_baseline", rows, "user_id,table_name,source_id", ignore_duplicates=False)
    print(f"базовая линия сохранена: {len(rows)} строк")


def _write_days(rest: SupabaseRest, uid: str, rows: list[dict], st: State) -> None:
    new, filled = [], 0
    for r in rows:
        have = st.daily.get(r["date"])
        if not have:
            new.append({"user_id": uid, **r})
            continue
        patch: dict[str, Any] = {}
        for k in DAILY_FIELDS:
            v = r.get(k)
            if v in (None, False, "", []):
                continue
            if k == "care":
                merged = list(dict.fromkeys([*(have.get("care") or []), *v]))
                if merged != (have.get("care") or []):
                    patch[k] = merged
            elif have.get(k) in (None, False, ""):
                patch[k] = v
        if patch:
            rest.patch("daily_logs", {"id": f"eq.{have['id']}"}, patch)
            filled += 1
    groups: dict[frozenset, list] = defaultdict(list)
    for r in new:
        groups[frozenset(r)].append(r)
    for g in groups.values():
        rest.insert("daily_logs", g, "user_id,date", ignore_duplicates=True)
    print(f"дни трекера: новых {len(new)}, дополнено {filled}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="только сводка, без записи")
    ap.add_argument("--today", help="дата запуска YYYY-MM-DD (по умолчанию сегодня, Берлин)")
    ap.add_argument("--excel-wins", default="", help="ключи конфликтов, где взять Excel (N8,D15) или all")
    ap.add_argument("--excel-is-source", action="store_true", help="записать, хотя данные с 12.11.2026 ведутся в приложении")
    args = ap.parse_args()
    # Since 12.11.2026 the app is the source of every sphere, the budget included: Excel files are an archive.
    # A write from them is an explicit decision, not a habit — the check (--dry-run) stays free.
    if not args.dry_run and not args.excel_is_source:
        print("✗ Данные ведутся в приложении (решение 12.11.2026): Excel — архив, запись из него выключена.")
        print("  Посмотреть расхождения: npm run import:check. Записать всё равно: добавить --excel-is-source.")
        return 1
    today = dt.date.fromisoformat(args.today) if args.today else dt.datetime.now(dt.timezone(dt.timedelta(hours=1))).date()
    excel_wins = {k.strip() for k in args.excel_wins.split(",") if k.strip()}

    try:
        cfg = config_from_env(load_env())
        if not cfg.email:
            raise ConfigError("LIFEHUB_EMAIL не задан в .env.local")
        rest = SupabaseRest(cfg.url, cfg.secret_key)
        uid = rest.find_user_id(cfg.email)
        st = State(rest, uid)
    except (ConfigError, SupabaseError) as err:
        print(f"✗ {err}")
        return 1

    try:
        b, problems = load(today, st.first_import or today)
    except FileNotFoundError as err:
        print(f"✗ {err}")
        return 1
    if problems:
        print("✗ Структура файлов изменилась — импорт остановлен:")
        for p in problems:
            print("  - " + p)
        return 1
    if b.fatal:
        print(f"✗ Бюджет не по формату docs/EXCEL_FORMAT.md — импорт остановлен ({len(b.fatal)}):")
        for p in b.fatal[:60]:
            print("  - " + p)
        if len(b.fatal) > 60:
            print(f"  … и ещё {len(b.fatal) - 60}")
        return 1

    if any(st.baseline.values()):
        baseline, note = st.baseline, "базовая линия — прошлый запуск"
    else:
        baseline, note = bootstrap_baseline(st, today)
    changes = plan_changes(b, st, baseline, excel_wins)

    print(f"Импорт {'(dry-run, ничего не пишу)' if args.dry_run else ''} · {today:%d.%m.%Y}" + (f" · первый импорт {st.first_import:%d.%m}" if st.first_import else ""))
    print("\n=== Листы ===")
    for line in b.report:
        print(line)
    for line in summary(b, st, changes, note) + checks(b, st, changes["transactions"]):
        print(line)
    if b.issues:
        print("\n=== Проблемы (номера строк Excel) ===")
        for line in b.issues:
            print("- " + line)
    private = DATA / "import-dry-run.txt"
    private.write_text("\n".join(["Детали импорта (тексты и значения) — только локально, data/ не в git.", ""] + b.private) + "\n", encoding="utf-8")
    print(f"\nДетали со значениями: {private.relative_to(DATA.parent)} ({len(b.private)} строк)")

    if args.dry_run:
        return 0
    try:
        write(b, rest, uid, st, changes)
    except SupabaseError as err:
        print(f"✗ запись остановлена: {err}")
        return 1
    print("Готово.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
