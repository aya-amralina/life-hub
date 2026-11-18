"""Start by accounts (18.11.2026): one file of the reconciliation → the base, in one run. Local only, secret key.

    python3 scripts/import/accounts_start.py --dry-run data/accounts-start-2026-11-18.json
    python3 scripts/import/accounts_start.py --apply   data/accounts-start-2026-11-18.json

The format is data/accounts-start-format.md. `--dry-run` reads the base and checks the file against it — nothing is
written; `--apply` does the same check first and writes only when there is not a single error. A second run is
safe: inserts are known by their `key` (source_id), corrections set the same values, the start rows are upserted.

Privacy: prints counts and the path of a field with a problem (`operations[3].account`), never titles, notes or sums.
`plan()` is pure (file + state of the base → writes, errors, warnings); `apply()` only runs the writes.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any

FORMAT = "life-hub-accounts-start"
VERSION = 1
START = "2026-11-18"  # the end of this day; the same date as the checks of migration 0017

GROUPS_OF_OPS = ("Доход", "Обязательное", "Поездки и события", "Долги", "Жизнь", "Буфер")
WEEK_CATEGORIES = ("Продукты", "Кофейни и перекусы", "Выходы и еда вне дома", "Мелочи", "Шопинг", "Доставка")
WEEK_ROWS = ("week_budget", "week_total")
KINDS = ("expense", "income", "transfer")
ACTIONS = ("update", "insert", "confirm", "cancel")

OP_FIELDS = {"date", "kind", "amount_eur", "title", "account", "to_account", "grp", "category", "status", "envelope", "debt", "note"}
WEEK_ROW_FIELDS = {"amount_eur", "date", "note"}
CONFIRM_FIELDS = {"amount_eur", "date", "account"}
ENVELOPE_FIELDS = {"envelope": {"account", "planned_eur"}, "goal": {"account", "goal_eur", "goal_date"}}
DEBT_FIELDS = {"account", "amount_eur", "repaid_eur", "due_date", "status"}

AMOUNT = re.compile(r"^-?\d+(\.\d{1,2})?$")


# ───────────────────────────── state of the base ─────────────────────────────


@dataclass
class Db:
    """What the loader needs from the base, for one user. Rows are dicts as PostgREST returns them."""

    accounts: list[dict[str, Any]]
    envelopes: list[dict[str, Any]]
    debts: list[dict[str, Any]]
    transactions: list[dict[str, Any]]


SELECT = {
    "accounts": "id,name,grp,archived,source_id",
    "envelopes": "id,source_id,name,type,archived,account_id",
    "debts": "id,source_id,status,account_id",
    "transactions": "id,source_id,date,kind,entry_kind,amount_eur,planned_amount_eur,is_planned,confirmed_at,cancelled_at,"
    "account_id,to_account_id,envelope_id,debt_id,grp,category",
}


def read_db(rest: Any, uid: str) -> Db:
    rows = {t: rest.select(t, cols, {"user_id": f"eq.{uid}"}) for t, cols in SELECT.items()}
    return Db(**rows)


# ───────────────────────────── the plan ─────────────────────────────


@dataclass
class Write:
    table: str
    action: str  # 'patch' — one row by id · 'insert' — new rows, an existing key is kept · 'upsert' — by source_id, merged
    id: str | None = None
    body: dict[str, Any] | None = None
    rows: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class Plan:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    writes: list[Write] = field(default_factory=list)
    counts: Counter = field(default_factory=Counter)

    def err(self, path: str, msg: str) -> None:
        self.errors.append(f"{path}: {msg}")


def _amount(v: Any) -> Decimal | None:
    return Decimal(v) if isinstance(v, str) and AMOUNT.match(v) else None


def _date(v: Any) -> str | None:
    if not isinstance(v, str) or not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
        return None
    try:
        dt.date.fromisoformat(v)
    except ValueError:
        return None
    return v


def _num(d: Decimal) -> str:
    return f"{d:.2f}"


def _is_fact(t: dict[str, Any]) -> bool:
    return not t.get("cancelled_at") and (not t.get("is_planned") or t.get("confirmed_at") is not None)


def _pending(t: dict[str, Any]) -> bool:
    return bool(t.get("is_planned")) and t.get("confirmed_at") is None and not t.get("cancelled_at")


def _label(t: dict[str, Any]) -> str:
    """A row named by its ids only (no contents): id and, from Excel, its source_id."""
    return f"id:{t['id']}" + (f" ({t['source_id']})" if t.get("source_id") else "")


def plan(data: Any, db: Db, now_iso: str) -> Plan:
    p = Plan()
    if not isinstance(data, dict) or data.get("format") != FORMAT:
        p.err("format", f"не «{FORMAT}»")
        return p
    if data.get("version") != VERSION:
        p.err("version", f"ожидается {VERSION}")
    if data.get("start_date") != START:
        p.err("start_date", f"ожидается {START}")

    accounts = [a for a in db.accounts if not a.get("archived")]
    by_name = {a["name"]: a for a in accounts}
    grp_of = {a["id"]: a["grp"] for a in db.accounts}

    def account_id(path: str, name: Any, *, allow_none: bool = True) -> tuple[bool, str | None]:
        if name is None and allow_none:
            return True, None
        if not isinstance(name, str) or name not in by_name:
            p.err(path, "нет такого счёта (имя — точно из таблицы счетов)")
            return False, None
        return True, by_name[name]["id"]

    def resolve(rows: list[dict[str, Any]], ref: Any) -> dict[str, Any] | None:
        if not isinstance(ref, str):
            return None
        if ref.startswith("id:"):
            return next((r for r in rows if r["id"] == ref[3:]), None)
        return next((r for r in rows if r.get("source_id") == ref), None)

    # ── balances ──
    balances: dict[str, Decimal] = {}
    raw = data.get("balances")
    if not isinstance(raw, dict):
        p.err("balances", "нет раздела")
        raw = {}
    for name in raw:
        if name not in by_name:
            p.err(f"balances[{name}]", "нет такого счёта (имя — точно из таблицы счетов)")
    for a in accounts:
        if a["name"] not in raw:
            p.err(f"balances[{a['name']}]", "нет остатка — нужны все счета")
            continue
        v = _amount(raw[a["name"]])
        if v is None:
            p.err(f"balances[{a['name']}]", "сумма — строкой с точкой, например \"12.50\"")
            continue
        if v < 0 and a["grp"] != "balance":
            p.err(f"balances[{a['name']}]", "минус — только у счетов «Баланса»")
            continue
        balances[a["id"]] = v

    # ── envelopes and goals ──
    env_state = {e["id"]: dict(e) for e in db.envelopes}
    envs = data.get("envelopes") or {}
    if not isinstance(envs, dict):
        p.err("envelopes", "ожидается объект «ключ → правки»")
        envs = {}
    for key, patch in envs.items():
        path = f"envelopes[{key}]"
        e = resolve(db.envelopes, key)
        if e is None:
            p.err(path, "не найден")
            continue
        if not isinstance(patch, dict) or not patch:
            p.err(path, "ожидаются правки полей")
            continue
        allowed = ENVELOPE_FIELDS.get(e["type"], set())
        body: dict[str, Any] = {}
        for f, v in patch.items():
            fp = f"{path}.{f}"
            if f not in allowed:
                p.err(fp, "поле не из списка для " + ("цели" if e["type"] == "goal" else "конверта"))
            elif f == "account":
                ok, aid = account_id(fp, v, allow_none=False)
                if ok:
                    if e["type"] == "goal" and grp_of.get(aid) != "cushion":
                        p.err(fp, "цель — только на счёте «Подушки»")
                    body["account_id"] = aid
            elif f == "goal_date":
                if v is not None and _date(v) is None:
                    p.err(fp, "дата ГГГГ-ММ-ДД или null")
                body[f] = v
            else:
                d = _amount(v)
                if d is None or (f == "goal_eur" and d <= 0) or d < 0:
                    p.err(fp, "сумма > 0" if f == "goal_eur" else "сумма ≥ 0")
                else:
                    body[f] = _num(d)
        if body:
            env_state[e["id"]].update(body)
            p.writes.append(Write("envelopes", "patch", e["id"], body))
            p.counts["envelopes"] += 1

    # ── debts ──
    debts = data.get("debts") or {}
    if not isinstance(debts, dict):
        p.err("debts", "ожидается объект «ключ → правки»")
        debts = {}
    for key, patch in debts.items():
        path = f"debts[{key}]"
        d0 = resolve(db.debts, key)
        if d0 is None:
            p.err(path, "не найден")
            continue
        if not isinstance(patch, dict) or not patch:
            p.err(path, "ожидаются правки полей")
            continue
        body = {}
        for f, v in patch.items():
            fp = f"{path}.{f}"
            if f not in DEBT_FIELDS:
                p.err(fp, "поле не из списка для долга")
            elif f == "account":
                ok, aid = account_id(fp, v, allow_none=False)
                if ok:
                    body["account_id"] = aid
            elif f == "due_date":
                if v is not None and _date(v) is None:
                    p.err(fp, "дата ГГГГ-ММ-ДД или null")
                body[f] = v
            elif f == "status":
                if v not in ("open", "closed"):
                    p.err(fp, "open или closed")
                body[f] = v
            else:
                d = _amount(v)
                if d is None or (f == "amount_eur" and d <= 0) or d < 0:
                    p.err(fp, "сумма > 0" if f == "amount_eur" else "сумма ≥ 0")
                else:
                    body[f] = _num(d)
        if body:
            p.writes.append(Write("debts", "patch", d0["id"], body))
            p.counts["debts"] += 1

    # ── operations ──
    tx_state = {t["id"]: dict(t) for t in db.transactions}
    touched: dict[str, str] = {}  # id in tx_state → path of the operation that touched it
    keys_in_base = {t["source_id"] for t in db.transactions if t.get("source_id")}
    seen_keys: set[str] = set()
    updates: list[Write] = []
    inserts: list[dict[str, Any]] = []
    ops = data.get("operations") or []
    if not isinstance(ops, list):
        p.err("operations", "ожидается список")
        ops = []

    def op_fields(path: str, op: dict[str, Any], row: dict[str, Any], body: dict[str, Any]) -> None:
        """Checks and maps the fields of an operation onto `row` (the state) and `body` (what is written)."""
        for f in op:
            if f in ("ref", "key", "action"):
                continue
            if f not in OP_FIELDS:
                p.err(f"{path}.{f}", "поле не из списка для операции")
        if "date" in op:
            if _date(op["date"]) is None:
                p.err(f"{path}.date", "дата ГГГГ-ММ-ДД")
            else:
                body["date"] = op["date"]
        if "kind" in op:
            if op["kind"] not in KINDS:
                p.err(f"{path}.kind", "expense, income или transfer")
            else:
                body["kind"] = op["kind"]
        if "amount_eur" in op:
            d = _amount(op["amount_eur"])
            if d is None or d <= 0:
                p.err(f"{path}.amount_eur", "сумма > 0 строкой с точкой")
            else:
                body["amount_eur"] = _num(d)
        if "title" in op:
            if not isinstance(op["title"], str) or not op["title"].strip():
                p.err(f"{path}.title", "пустое название")
            else:
                body["title"] = op["title"].strip()
        for f, col in (("account", "account_id"), ("to_account", "to_account_id")):
            if f in op:
                ok, aid = account_id(f"{path}.{f}", op[f])
                if ok:
                    body[col] = aid
        if "grp" in op:
            if op["grp"] is not None and op["grp"] not in GROUPS_OF_OPS:
                p.err(f"{path}.grp", "группа не из списка")
            else:
                body["grp"] = op["grp"]
        if "category" in op:
            if op["category"] is not None and op["category"] not in WEEK_CATEGORIES:
                p.err(f"{path}.category", "одна из 6 недельных категорий или null")
            else:
                body["category"] = op["category"]
        for f, col, rows in (("envelope", "envelope_id", db.envelopes), ("debt", "debt_id", db.debts)):
            if f in op:
                if op[f] is None:
                    body[col] = None
                    continue
                target = resolve(rows, op[f])
                if target is None:
                    p.err(f"{path}.{f}", "не найден")
                elif f == "envelope" and target["type"] != "envelope":
                    p.err(f"{path}.{f}", "трата — только из конверта, не из цели")
                else:
                    body[col] = target["id"]
        if "note" in op:
            if op["note"] is not None and not isinstance(op["note"], str):
                p.err(f"{path}.note", "текст или null")
            else:
                body["note"] = op["note"]
        if "status" in op and op["status"] not in ("plan", "fact"):
            p.err(f"{path}.status", "plan или fact")
        row.update(body)

    def shape(path: str, row: dict[str, Any]) -> None:
        """The kind decides what a row may carry."""
        if row.get("kind") != "transfer" and row.get("to_account_id"):
            p.err(f"{path}.to_account", "куда — только у перевода")
        if row.get("kind") != "expense" and row.get("envelope_id"):
            p.err(f"{path}.envelope", "конверт — только у траты")
        if row.get("category") and not (row.get("kind") == "expense" and row.get("grp") == "Жизнь"):
            p.err(f"{path}.category", "недельная категория — только у траты группы «Жизнь»")

    def confirm(row: dict[str, Any], body: dict[str, Any], planned_before: Any) -> None:
        """Plan → fact as «Подтвердить» does: the time of the first confirmation; the planned sum — before the correction."""
        if row.get("is_planned") and row.get("confirmed_at") is None:
            planned = row.get("planned_amount_eur")
            body["planned_amount_eur"] = planned if planned is not None else planned_before
            body["confirmed_at"] = now_iso
            row.update({"confirmed_at": now_iso, "planned_amount_eur": body["planned_amount_eur"]})

    for i, op in enumerate(ops):
        path = f"operations[{i}]"
        if not isinstance(op, dict):
            p.err(path, "ожидается объект")
            continue
        action = op.get("action")
        if action not in ACTIONS:
            p.err(f"{path}.action", "update, insert, confirm или cancel")
            continue

        if action == "insert":
            key = op.get("key")
            if not isinstance(key, str) or not key.startswith("sverka:"):
                p.err(f"{path}.key", "нужен ключ с префиксом «sverka:»")
                continue
            if key in seen_keys:
                p.err(f"{path}.key", "ключ уже есть выше в файле")
                continue
            seen_keys.add(key)
            if "ref" in op:
                p.err(f"{path}.ref", "у новой операции нет ref")
            missing = [f for f in ("date", "kind", "amount_eur", "title", "status") if f not in op]
            if op.get("kind") == "transfer":
                missing += [f for f in ("account", "to_account") if not op.get(f)]
            elif not op.get("account"):
                missing.append("account")
            if op.get("kind") == "expense" and not op.get("grp"):
                missing.append("grp")
            for f in missing:
                p.err(f"{path}.{f}", "обязательно для новой операции")
            row: dict[str, Any] = {"id": f"new:{key}", "source_id": key, "entry_kind": "one_off", "cancelled_at": None, "planned_amount_eur": None}
            body: dict[str, Any] = {}
            op_fields(path, op, row, body)
            if missing:
                continue
            row["is_planned"] = op["status"] == "plan"
            row["confirmed_at"] = None
            body.update(
                {
                    "source_id": key,
                    "entry_kind": "one_off",
                    "is_planned": row["is_planned"],
                    "grp": body.get("grp", "Доход" if op["kind"] == "income" else None),
                    "category": body.get("category"),
                    "account_id": body.get("account_id"),
                    "to_account_id": body.get("to_account_id"),
                    "envelope_id": body.get("envelope_id"),
                    "debt_id": body.get("debt_id"),
                    "note": body.get("note"),
                }
            )
            row.update(body)
            shape(path, row)
            tx_state[row["id"]] = row
            touched[row["id"]] = path
            if key in keys_in_base:
                p.counts["insert_known"] += 1
            inserts.append(body)
            p.counts["insert"] += 1
            continue

        ref = op.get("ref")
        t = None
        if isinstance(ref, str) and ref.startswith("source:"):
            t = next((r for r in db.transactions if r.get("source_id") == ref[len("source:"):]), None)
        elif isinstance(ref, str) and ref.startswith("id:"):
            t = resolve(db.transactions, ref)
        if t is None:
            p.err(f"{path}.ref", "операция не найдена (source:<source_id> или id:<uuid>)")
            continue
        if t["id"] in touched:
            p.err(f"{path}.ref", "эта операция уже есть выше в файле — одно действие на строку")
            continue
        if "key" in op:
            p.err(f"{path}.key", "key — только у новой операции")
        row = tx_state[t["id"]]
        amount_before = row["amount_eur"]
        touched[t["id"]] = path
        week = row.get("entry_kind") in WEEK_ROWS
        body = {}

        if action == "cancel":
            extra = [f for f in op if f not in ("ref", "action")]
            for f in extra:
                p.err(f"{path}.{f}", "у «cancel» нет полей")
            if not row.get("cancelled_at"):
                body["cancelled_at"] = now_iso
                row["cancelled_at"] = now_iso
            p.counts["cancel"] += 1
        else:
            allowed = WEEK_ROW_FIELDS if week else CONFIRM_FIELDS if action == "confirm" else OP_FIELDS
            for f in op:
                if f not in ("ref", "action") and f not in allowed:
                    why = "у строки недели меняются только сумма, дата и заметка" if week else "у «confirm» — только сумма, дата и счёт"
                    p.err(f"{path}.{f}", why if f in OP_FIELDS else "поле не из списка для операции")
            op_fields(path, {k: v for k, v in op.items() if k in allowed or k in ("ref", "action")}, row, body)
            if row.get("cancelled_at") and (action == "confirm" or op.get("status") == "fact"):
                p.err(path, "операция убрана из плана — подтвердить нельзя")
            elif action == "confirm" or op.get("status") == "fact":
                if row.get("entry_kind") == "week_budget":
                    p.err(path, "бюджет недели не подтверждается (правило 26)")
                else:
                    confirm(row, body, amount_before)
            elif op.get("status") == "plan" and _is_fact(row):
                p.err(f"{path}.status", "факт не может стать планом")
            p.counts[action] += 1
            shape(path, row)
        if body:
            updates.append(Write("transactions", "patch", t["id"], body))

    p.writes += updates
    if inserts:
        p.writes.append(Write("transactions", "insert", rows=inserts))

    # ── rule 5: everything after the start has its accounts (week rows are «Баланс» without one) ──
    for tid, t in tx_state.items():
        if t["date"] <= START or t.get("cancelled_at") or t.get("entry_kind") in WEEK_ROWS or t["kind"] == "opening":
            continue
        where = touched.get(tid) or _label(t)
        if t["kind"] == "expense" and t.get("account_id") and grp_of.get(t["account_id"]) != "balance":
            p.err(where, "трата после 18.11 — только со счёта «Баланса» (сначала перевод)")
        if t["kind"] == "transfer":
            if not t.get("account_id") or not t.get("to_account_id"):
                p.err(where, "перевод после 18.11 — нужны оба счёта, откуда и куда")
            elif t["account_id"] == t["to_account_id"]:
                p.err(where, "перевод: откуда и куда — разные счета")

    # ── rule 7: no unanswered planned operation up to the start (week budgets stay on their date) ──
    left = [t for t in tx_state.values() if _pending(t) and t["date"] <= START and t.get("entry_kind") not in WEEK_ROWS and t["kind"] != "opening"]
    p.counts["pending_left"] = len(left)
    for t in left:
        p.err(touched.get(t["id"]) or _label(t), "неотвеченная плановая с датой ≤ 18.11 — confirm, перенос позже 18.11 или cancel")

    # ── envelopes and goals: every active one has its account; goals only on «Подушка» ──
    active = [e for e in env_state.values() if not e.get("archived")]
    for e in active:
        name = f"envelopes[{e.get('source_id') or 'id:' + e['id']}]"
        if not e.get("account_id"):
            p.err(name, ("у цели" if e["type"] == "goal" else "у конверта") + " нет счёта")
        elif e["type"] == "goal" and grp_of.get(e["account_id"]) != "cushion":
            p.err(name, "цель — только на счёте «Подушки»")

    # ── rule 8: a planned expense from an envelope off «Баланс» needs a planned transfer under it ──
    for tid, t in tx_state.items():
        env = env_state.get(t.get("envelope_id") or "")
        if not env or t["kind"] != "expense" or t["date"] <= START or not _pending(t):
            continue
        src = env.get("account_id")
        if not src or grp_of.get(src) == "balance":
            continue
        paired = any(
            u["kind"] == "transfer" and _pending(u) and u.get("account_id") == src and grp_of.get(u.get("to_account_id") or "") == "balance"
            and u["date"] == t["date"] and Decimal(str(u["amount_eur"])) == Decimal(str(t["amount_eur"]))
            for u in tx_state.values()
        )
        if not paired:
            p.warnings.append(f"{touched.get(tid) or _label(t)}: трата из конверта не на «Балансе» без планового перевода под неё (та же дата и сумма)")

    # ── goal_balances: a goal's share when its account holds several goals ──
    goals_on: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for e in active:
        if e["type"] == "goal" and e.get("account_id"):
            goals_on[e["account_id"]].append(e)
    shares = data.get("goal_balances") or {}
    if not isinstance(shares, dict):
        p.err("goal_balances", "ожидается объект «цель → сумма»")
        shares = {}
    given: dict[str, Decimal] = {}
    for key, v in shares.items():
        path = f"goal_balances[{key}]"
        e = resolve(db.envelopes, key)
        if e is None or e["type"] != "goal" or e.get("archived"):
            p.err(path, "не действующая цель")
            continue
        acc = env_state[e["id"]].get("account_id")
        if acc and len(goals_on[acc]) < 2:
            p.err(path, "цель одна на своём счёте — «сейчас» = остаток счёта, долю не задаём")
            continue
        d = _amount(v)
        if d is None or d < 0:
            p.err(path, "сумма ≥ 0 строкой с точкой")
            continue
        given[e["id"]] = d
    for acc, goals in goals_on.items():
        if len(goals) < 2:
            continue
        for g in goals:
            if g["id"] not in given:
                p.err(f"goal_balances[{g.get('source_id') or 'id:' + g['id']}]", "на счёте несколько целей — доля обязательна")
        if acc in balances and sum((given.get(g["id"], Decimal(0)) for g in goals), Decimal(0)) > balances[acc]:
            name = next((a["name"] for a in accounts if a["id"] == acc), acc)
            p.err(f"goal_balances · {name}", "доли целей больше остатка счёта")

    # ── the start: rows of the start, «Остатки» on the start day, the goals' shares ──
    openings, start_balances, goal_rows = [], [], []
    stored_openings = {t["source_id"]: t for t in db.transactions if t.get("source_id", "") and str(t["source_id"]).startswith(f"start:{START}:")}
    for a in accounts:
        v = balances.get(a["id"])
        if v is None:
            continue
        tag = a.get("source_id") or a["id"]
        start_balances.append(
            {"date": START, "account_id": a["id"], "account": a["name"], "amount_eur": _num(v), "origin": "start", "source_id": f"start:{START}:bal:{tag}"}
        )
        sid = f"start:{START}:{tag}"
        if v != 0:
            openings.append(
                {"date": START, "kind": "opening", "amount_eur": _num(v), "title": "Старт по счетам", "account_id": a["id"], "is_planned": False,
                 "entry_kind": "one_off", "cancelled_at": None, "source_id": sid}
            )
        elif sid in stored_openings and not stored_openings[sid].get("cancelled_at"):
            # a re-run with zero: the start row of the earlier run leaves the balances (a zero needs no row)
            p.writes.append(Write("transactions", "patch", stored_openings[sid]["id"], {"cancelled_at": now_iso}))
    for gid, d in given.items():
        e = env_state[gid]
        sid = e.get("source_id") or ""
        label = sid.removeprefix("budget:env:") if sid.startswith("budget:env:") else e["name"]
        goal_rows.append({"date": START, "envelope_id": gid, "account": label, "amount_eur": _num(d), "origin": "start", "source_id": f"start:{START}:goal:{sid or gid}"})
    if openings:
        p.writes.append(Write("transactions", "upsert", rows=openings))
    if start_balances:
        p.writes.append(Write("actual_balances", "upsert", rows=start_balances))
    if goal_rows:
        p.writes.append(Write("actual_balances", "upsert", rows=goal_rows))
    p.counts.update(
        accounts=len(start_balances), accounts_all=len(accounts), openings=len(openings),
        zero=len(start_balances) - len(openings), below_zero=sum(1 for v in balances.values() if v < 0), goal_shares=len(goal_rows),
    )
    return p


# ───────────────────────────── writing ─────────────────────────────


def apply(rest: Any, uid: str, writes: list[Write]) -> Counter:
    """Runs the writes in order; every row is the user's (`user_id` set, patches filtered by it)."""
    done: Counter = Counter()
    for w in writes:
        if w.action == "patch":
            rest.patch(w.table, {"id": f"eq.{w.id}", "user_id": f"eq.{uid}"}, w.body)
            done[f"{w.table}: правок"] += 1
        elif w.action == "insert":
            rest.insert(w.table, [{"user_id": uid, **r} for r in w.rows], "user_id,source_id", ignore_duplicates=True)
            done[f"{w.table}: новых (уже записанные пропущены)"] += len(w.rows)
        elif w.action == "upsert":
            rest.upsert(w.table, [{"user_id": uid, **r} for r in w.rows], "user_id,source_id")
            done[f"{w.table}: старт"] += len(w.rows)
    return done


# ───────────────────────────── report ─────────────────────────────


def report(p: Plan, *, applied: bool) -> list[str]:
    c = p.counts
    lines = [
        f"Старт по счетам {dt.date.fromisoformat(START):%d.%m.%Y} · " + ("запись" if applied else "проверка (ничего не записано)"),
        f"  счета: {c['accounts']} из {c['accounts_all']} · строк старта: {c['openings']} (нулевых без строки: {c['zero']}) · ниже нуля: {c['below_zero']}",
        f"  доли целей: {c['goal_shares']} · правок конвертов и целей: {c['envelopes']} · правок долгов: {c['debts']}",
        f"  операции: правок {c['update']} · подтвердить {c['confirm']} · убрать из плана {c['cancel']} · новых {c['insert']}"
        + (f" (уже записаны: {c['insert_known']})" if c["insert_known"] else ""),
        f"  неотвеченных плановых ≤ {dt.date.fromisoformat(START):%d.%m} после файла: {c['pending_left']}",
    ]
    if p.errors:
        lines.append(f"✗ ошибок: {len(p.errors)} — ничего не записано")
        lines += [f"  · {e}" for e in p.errors]
    else:
        lines.append("✓ ошибок нет")
    if p.warnings:
        lines.append(f"! предупреждений: {len(p.warnings)}")
        lines += [f"  · {w}" for w in p.warnings]
    return lines


def main(argv: list[str] | None = None) -> int:
    from supabase_rest import ConfigError, SupabaseError, SupabaseRest, config_from_env, load_env

    ap = argparse.ArgumentParser(description="Старт по счетам 18.11.2026 — один файл сверки в базу.")
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="проверить файл против базы, ничего не записывать")
    mode.add_argument("--apply", action="store_true", help="проверить и записать (только если ошибок нет)")
    ap.add_argument("file", type=Path)
    args = ap.parse_args(argv)
    try:
        data = json.loads(args.file.read_text(encoding="utf-8"))
    except (OSError, ValueError) as err:
        print(f"✗ файл не прочитан ({type(err).__name__})")
        return 1
    try:
        cfg = config_from_env(load_env())
        if not cfg.email:
            raise ConfigError("LIFEHUB_EMAIL не задан в .env.local")
        rest = SupabaseRest(cfg.url, cfg.secret_key)
        uid = rest.find_user_id(cfg.email)
        p = plan(data, read_db(rest, uid), dt.datetime.now(dt.timezone.utc).isoformat())
        for line in report(p, applied=args.apply and not p.errors):
            print(line)
        if p.errors or not args.apply:
            return 1 if p.errors else 0
        done = apply(rest, uid, p.writes)
        print("✓ записано: " + " · ".join(f"{k} {v}" for k, v in done.items()))
        print("  дальше: npm run backup")
        return 0
    except (ConfigError, SupabaseError) as err:
        print(f"✗ {err}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
