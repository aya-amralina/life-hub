"""Budget_Oct-Dec_2026.xlsx → transactions, weeks + week_limits, envelopes (envelope | goal), debts, actual_balances,
notes — strictly by docs/EXCEL_FORMAT.md. A missing required column or a value outside its list stops the import
with the sheet, the column and the rows; nothing is guessed from titles.
"""
from __future__ import annotations

import datetime as dt
from collections import Counter

from model import Batch, noon, rows_list
from xl import excel_date, number, rows, text

GROUPS = {"Старт", "Доход", "Обязательное", "Поездки и события", "Долги", "Жизнь", "Буфер"}
ACCOUNTS = ["Revolut", "Sparkasse", "Наличные", "Казахстанская карта"]
CATEGORIES = ["Продукты", "Кофейни и перекусы", "Выходы и еда вне дома", "Мелочи", "Шопинг", "Доставка"]
STATUS = {"факт": "fact", "план": "plan"}
KIND = {"разовая": "one_off", "бюджет недели": "week_budget", "итог недели": "week_total"}
ENVELOPE_TYPE = {"конверт": "envelope", "цель": "goal"}
DIRECTION = {"я должна": "i_owe", "мне должны": "owed_to_me", "заём из копилки": "from_pot", "заем из копилки": "from_pot"}
DEBT_STATUS = {"открыт": "open", "закрыт": "closed"}

SHEETS = {
    "Статьи": ["ID", "Дата", "Группа", "Статья", "Сумма", "Знак", "Статус", "Вид"],
    "Недели": ["№", "Начало", "Конец"],
    "Конверты": ["ID", "Название", "Тип", "Заложено"],
    "Долги": ["ID", "Кто", "Направление", "Сумма", "Статус"],
    "Остатки": ["Дата", "Счёт", "Остаток"],
    "Правила": ["Правило"],
}


def structure(wb) -> list[str]:
    """Required sheets and columns of the format; an empty list means the file fits."""
    problems = []
    for name, required in SHEETS.items():
        if name not in wb.sheetnames:
            problems.append(f"бюджет: нет листа «{name}» (docs/EXCEL_FORMAT.md)")
            continue
        header = next(wb[name].iter_rows(min_row=1, max_row=1, values_only=True), ())
        have = {str(h).strip().lower() for h in header if h is not None}
        problems += [f"бюджет · {name}: нет обязательной колонки «{c}» в строке 1" for c in required if c.lower() not in have]
    return problems


class Sheet:
    """Columns by header name (row 1); errors go to the batch with the row number."""

    def __init__(self, wb, name: str, b: Batch):
        self.name, self.b = name, b
        self.ws = wb[name]
        header = next(self.ws.iter_rows(min_row=1, max_row=1, values_only=True), ())
        self.cols = {str(h).strip().lower(): j for j, h in enumerate(header) if h is not None and str(h).strip()}

    def get(self, row, col: str):
        j = self.cols.get(col.lower())
        return row[j] if j is not None and j < len(row) else None

    def error(self, n: int, col: str, message: str) -> None:
        self.b.fatal.append(f"{self.name}, строка {n}, «{col}»: {message}")

    def choice(self, n: int, col: str, row, allowed: dict[str, str], required: bool = True) -> str | None:
        v = text(self.get(row, col))
        if v is None:
            if required:
                self.error(n, col, "пусто")
            return None
        if v.lower() not in allowed:
            self.error(n, col, f"«{v}» не из списка ({' · '.join(dict.fromkeys(allowed))})")
            return None
        return allowed[v.lower()]

    def unique(self, n: int, sid: str, seen: set[str]) -> bool:
        if sid in seen:
            self.error(n, "ID", f"«{sid}» уже был выше — ID должен быть уникальным")
            return False
        seen.add(sid)
        return True

    def optional_date(self, n: int, col: str, row) -> dt.date | None:
        raw = self.get(row, col)
        if raw in (None, ""):
            return None
        d = excel_date(raw)
        if not d:
            self.error(n, col, "нужна дата")
        return d


def build(wb, b: Batch) -> None:
    weeks = _weeks(Sheet(wb, "Недели", b), b)
    envelopes = _envelopes(Sheet(wb, "Конверты", b), b)
    debts = _debts(Sheet(wb, "Долги", b), b, envelopes)
    _articles(Sheet(wb, "Статьи", b), b, weeks, envelopes, debts)
    _balances(Sheet(wb, "Остатки", b), b, envelopes)
    _rules(Sheet(wb, "Правила", b), b)
    if "Календарь" in wb.sheetnames:
        _calendar_archive(wb["Календарь"], b)


def _weeks(sh: Sheet, b: Batch) -> dict[int, dt.date]:
    out: dict[int, dt.date] = {}
    limits = 0
    for n, r in rows(sh.ws, 1):
        no, start = number(sh.get(r, "№")), excel_date(sh.get(r, "Начало"))
        if no is None:
            continue  # a footnote under the table
        if not start:
            sh.error(n, "Начало", "нужна дата")
            continue
        if start.weekday() != 0:
            sh.error(n, "Начало", f"{start:%d.%m} — не понедельник (недели строго пн–вс)")
            continue
        out[int(no)] = start
        b.week(start, budget_week_no=int(no), place_mode=text(sh.get(r, "Где")))
        for cat in CATEGORIES:
            v = sh.get(r, cat)
            if v in (None, ""):
                continue
            amount = number(v)
            if amount is None or amount < 0:
                sh.error(n, cat, "нужно число ≥ 0")
                continue
            b.add("week_limits", {"source_id": f"budget:week{int(no)}:{cat}", "week": start, "category": cat, "limit_eur": round(amount, 2)})
            limits += 1
    b.report.append(f"Бюджет · Недели: {len(out)} недель, лимитов {limits}")
    return out


def _envelopes(sh: Sheet, b: Batch) -> dict[str, str]:
    """ID → type («envelope» / «goal»)."""
    out: dict[str, str] = {}
    seen: set[str] = set()
    for n, r in rows(sh.ws, 1):
        sid = text(sh.get(r, "ID"))
        if not sid or not sh.unique(n, sid, seen):
            continue
        name, kind = text(sh.get(r, "Название")), sh.choice(n, "Тип", r, ENVELOPE_TYPE)
        planned, goal = number(sh.get(r, "Заложено")), number(sh.get(r, "Цель"))
        due = sh.optional_date(n, "Срок", r)
        if not name:
            sh.error(n, "Название", "пусто")
        if planned is None or planned < 0:
            sh.error(n, "Заложено", "нужно число ≥ 0")
        if kind == "goal" and (goal is None or goal <= 0):
            sh.error(n, "Цель", "у цели нужна сумма > 0")
        if not (name and kind and planned is not None and planned >= 0):
            continue
        out[sid] = kind
        b.add(
            "envelopes",
            {
                "source_id": f"budget:env:{sid}",
                "name": name,
                "type": kind,
                "planned_eur": round(planned, 2),
                "when_text": text(sh.get(r, "Когда")),
                "note": text(sh.get(r, "Заметка")),
                "goal_eur": round(goal, 2) if kind == "goal" and goal else None,
                "goal_date": due.isoformat() if kind == "goal" and due else None,
                "archived": False,
                "_excel_spent": number(sh.get(r, "Потрачено")),
            },
        )
    kinds = Counter(out.values())
    b.report.append(f"Бюджет · Конверты: конвертов {kinds['envelope']}, целей {kinds['goal']}")
    return out


def _debts(sh: Sheet, b: Batch, envelopes: dict[str, str]) -> set[str]:
    out: set[str] = set()
    seen: set[str] = set()
    statuses: Counter[str] = Counter()
    for n, r in rows(sh.ws, 1):
        sid = text(sh.get(r, "ID"))
        if not sid or not sh.unique(n, sid, seen):
            continue
        who = text(sh.get(r, "Кто"))
        direction = sh.choice(n, "Направление", r, DIRECTION)
        status = sh.choice(n, "Статус", r, DEBT_STATUS)
        amount = number(sh.get(r, "Сумма"))
        pot = text(sh.get(r, "Копилка"))
        repaid_raw = sh.get(r, "Возвращено")
        repaid = number(repaid_raw) if repaid_raw not in (None, "") else None
        due = sh.optional_date(n, "Срок", r)
        if not who:
            sh.error(n, "Кто", "пусто")
        if amount is None or amount <= 0:
            sh.error(n, "Сумма", "нужно число > 0")
        if repaid_raw not in (None, "") and (repaid is None or repaid < 0):
            sh.error(n, "Возвращено", "нужно число ≥ 0")
        if direction == "from_pot" and not pot:
            sh.error(n, "Копилка", "у «заём из копилки» нужен ID цели")
        elif direction == "from_pot" and envelopes.get(pot) != "goal":
            sh.error(n, "Копилка", f"«{pot}» — нет такой цели в «Конвертах»")
        elif direction != "from_pot" and pot:
            sh.error(n, "Копилка", "заполняется только для «заём из копилки»")
        if not (who and direction and status and amount and amount > 0):
            continue
        out.add(sid)
        statuses[status] += 1
        b.add(
            "debts",
            {
                "source_id": f"budget:debt:{sid}",
                "who": who,
                "direction": direction,
                "amount_eur": round(amount, 2),
                "repaid_eur": round(repaid, 2) if repaid is not None else None,
                "due_date": due.isoformat() if due else None,
                "status": status,
                "pot_key": f"budget:env:{pot}" if direction == "from_pot" and pot else None,
                "note": text(sh.get(r, "Заметка")),
            },
        )
    b.report.append(f"Бюджет · Долги: {len(out)} (открытых {statuses['open']}, закрытых {statuses['closed']})")
    return out


def _articles(sh: Sheet, b: Batch, weeks: dict[int, dt.date], envelopes: dict[str, str], debts: set[str]) -> None:
    seen: set[str] = set()
    no_id: list[int] = []
    ops: list[dict] = []
    for n, r in rows(sh.ws, 1):
        sid = text(sh.get(r, "ID"))
        if not sid:
            no_id.append(n)
            continue
        if not sh.unique(n, sid, seen):
            continue
        date, title = excel_date(sh.get(r, "Дата")), text(sh.get(r, "Статья"))
        amount, sign = number(sh.get(r, "Сумма")), number(sh.get(r, "Знак"))
        group = text(sh.get(r, "Группа"))
        status = sh.choice(n, "Статус", r, STATUS)
        kind_of = sh.choice(n, "Вид", r, KIND)
        account = text(sh.get(r, "Счёт"))
        env, debt = text(sh.get(r, "Конверт")), text(sh.get(r, "Долг"))
        week_no = int(number(sh.get(r, "Неделя"))) if number(sh.get(r, "Неделя")) is not None else None
        if not date:
            sh.error(n, "Дата", "нужна дата")
        if group not in GROUPS:
            sh.error(n, "Группа", f"«{group or ''}» не из списка ({' · '.join(sorted(GROUPS))})")
        if not title:
            sh.error(n, "Статья", "пусто")
        if amount is None or amount <= 0:
            sh.error(n, "Сумма", "нужно число > 0")
        if sign not in (1, -1, 0):
            sh.error(n, "Знак", "только +1, -1 или 0")
        if account and account not in ACCOUNTS:
            sh.error(n, "Счёт", f"«{account}» не из списка ({' · '.join(ACCOUNTS)})")
        if kind_of in ("week_budget", "week_total") and week_no is None:
            sh.error(n, "Неделя", "для «бюджет недели» и «итог недели» нужен номер недели")
        elif kind_of in ("week_budget", "week_total") and week_no not in weeks:
            sh.error(n, "Неделя", f"недели {week_no} нет в листе «Недели»")
        if kind_of == "week_budget" and status == "fact":
            sh.error(n, "Вид", "«бюджет недели» бывает только со статусом «план»")
        if kind_of == "week_total" and status == "plan":
            sh.error(n, "Вид", "«итог недели» бывает только со статусом «факт»")
        if group == "Старт" and sign != 1:
            sh.error(n, "Знак", "у «Старт» знак +1")
        if env and env not in envelopes:
            sh.error(n, "Конверт", f"«{env}» — нет такого ID в «Конвертах»")
        if debt and debt not in debts:
            sh.error(n, "Долг", f"«{debt}» — нет такого ID в «Долгах»")
        ok = date and title and amount and amount > 0 and sign in (1, -1, 0) and group in GROUPS and status and kind_of
        if not ok or (account and account not in ACCOUNTS):
            continue
        kind = "opening" if group == "Старт" else {1: "income", -1: "expense", 0: "transfer"}[int(sign)]
        row = {
            "source_id": f"budget:{sid}",
            "date": date.isoformat(),
            "amount_eur": round(amount, 2),
            "kind": kind,
            "grp": None if group == "Старт" else group,
            "category": None,
            "title": title,
            "note": text(sh.get(r, "Заметка")),
            "account": account,
            "is_planned": status == "plan",
            "confirmed_at": noon(date) if status == "fact" else None,
            "entry_kind": kind_of,
            "week_no": week_no,
            "envelope_key": f"budget:env:{env}" if env else None,
            "debt_key": f"budget:debt:{debt}" if debt else None,
        }
        b.add("transactions", row)
        ops.append(row)
    facts = [o for o in ops if not o["is_planned"]]
    by_kind = Counter(o["entry_kind"] for o in ops)
    b.report.append(
        f"Бюджет · Статьи: {len(ops)} операций — факт {len(facts)}, план {len(ops) - len(facts)}; разовых {by_kind['one_off']}, "
        f"бюджетов недели {by_kind['week_budget']}, итогов недели {by_kind['week_total']}; со счётом {sum(1 for o in ops if o['account'])}, "
        f"из конверта {sum(1 for o in ops if o['envelope_key'])}, по долгу {sum(1 for o in ops if o['debt_key'])}"
    )
    if no_id:
        b.report.append(f"  строки без ID (сноски) пропущены: {rows_list(no_id)}")
    # «Потрачено» of the table vs the operations — the app computes it from the operations
    for e in b.rows.get("envelopes", []):
        written = e.pop("_excel_spent", None)
        if written is None:
            continue
        spent = sum(o["amount_eur"] for o in facts if o["envelope_key"] == e["source_id"] and o["kind"] == "expense")
        if abs(spent - written) >= 0.01:
            b.issues.append(
                f"Конверты · {e['source_id'].removeprefix('budget:env:')}: «Потрачено» в таблице {written:.2f}, по операциям-фактам {spent:.2f} — приложение покажет второе"
            )


def _balances(sh: Sheet, b: Batch, envelopes: dict[str, str]) -> None:
    seen: set[tuple[str, str]] = set()
    count, latest = 0, None
    for n, r in rows(sh.ws, 1):
        date, account, amount = excel_date(sh.get(r, "Дата")), text(sh.get(r, "Счёт")), number(sh.get(r, "Остаток"))
        known = account in ACCOUNTS or account in envelopes
        if not date:
            sh.error(n, "Дата", "нужна дата")
        if not account:
            sh.error(n, "Счёт", "пусто")
        elif not known:
            sh.error(n, "Счёт", f"«{account}» — не счёт ({' · '.join(ACCOUNTS)}) и не ID из «Конвертов»")
        if amount is None or amount < 0:
            sh.error(n, "Остаток", "нужно число ≥ 0")
        if not (date and account and known and amount is not None and amount >= 0):
            continue
        key = (date.isoformat(), account)
        if key in seen:
            sh.error(n, "Счёт", f"{date:%d.%m} · {account} уже есть выше — одна строка на дату и счёт")
            continue
        seen.add(key)
        count += 1
        latest = max(latest or date, date)
        b.add(
            "actual_balances",
            {
                "source_id": f"budget:bal:{date.isoformat()}:{account}",
                "date": date.isoformat(),
                "account": account,
                "envelope_key": f"budget:env:{account}" if account in envelopes else None,
                "amount_eur": round(amount, 2),
                "origin": "excel",
            },
        )
    b.report.append(f"Бюджет · Остатки: {count} строк" + (f", последняя дата {latest:%d.%m}" if latest else ""))


def _rules(sh: Sheet, b: Batch) -> None:
    count = 0
    for n, r in rows(sh.ws, 1):
        rule = text(sh.get(r, "Правило"))
        if not rule:
            continue
        no = sh.get(r, "№")
        b.add("notes", {"source_id": f"budget:rule:{no if no is not None else n}", "sphere": "money", "title": rule, "body_md": text(sh.get(r, "Подробно")), "pinned": True})
        count += 1
    b.report.append(f"Бюджет · Правила: {count} закреплённых заметок")


def _calendar_archive(ws, b: Batch) -> None:
    lines = []
    for _, r in rows(ws, 1):
        cells = [v.strftime("%d.%m") if isinstance(v, (dt.date, dt.datetime)) else str(v).strip() for v in r if v not in (None, "")]
        if cells:
            lines.append("- " + " · ".join(cells))
    b.add("notes", {"source_id": "budget:calendar", "sphere": "money", "title": "Календарь списаний (архив)", "body_md": "\n".join(lines), "pinned": False})
    b.report.append(f"Бюджет · Календарь: архив-заметка ({len(lines)} строк); в операции ничего не переносится")
