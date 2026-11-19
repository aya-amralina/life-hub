"""Recurring payments → `recurring`, existing planned rows bound to their occurrences. Local only, secret key.

    python3 scripts/import/recurring_load.py --dry-run data/recurring-2026-11-19.json
    python3 scripts/import/recurring_load.py --dry-run data/recurring-2026-11-19.json --preview data/backups/<fresh>.json
    python3 scripts/import/recurring_load.py --apply   data/recurring-2026-11-19.json

`--dry-run` reads the base and checks the file against it — nothing is written; `--apply` does the same check first
and writes only when there is not a single error. A second run is safe: a rule is known by its `key` (source_id) and
must be the same as in the file, a link already made is skipped, a row already out of the plan stays as it is.

The file:
    { "format": "life-hub-recurring", "version": 1,
      "rules": [ { "key": "recurring:rent", "title": "Аренда", "kind": "expense", "amount_eur": "550.00",
                   "grp": "Обязательное", "account": "Sparkasse", "freq": "monthly", "interval": 1,
                   "anchor_date": "2027-01-03", "end_date": null, "note": null,
                   "link": [ { "ref": "source:budget:D4", "occurrence": "2026-12-14" } ],
                   "separate": [ "source:budget:D3" ] } ],
      "cancel": [ "source:budget:N5" ] }

`link` binds a stored planned row to one occurrence of the rule (recurring_id + occurrence_date), so the rule makes
no virtual operation for that date; `"date"` in a link also moves the row. `separate` names rows that look like the
rule but stay one-off. Any other unbound row that looks like an occurrence up to the forecast horizon (same kind,
similar title, near the date — the same test as «Уже есть в плане» in the app) is an error: it would count twice.

Privacy: the terminal gets counts and refs (`source:budget:D4`) only; titles, dates and sums for the decision go to
`data/recurring-dry-run.txt` (not in git). `plan()` is pure (file + state of the base → writes, errors, warnings).
"""
from __future__ import annotations

import argparse
import calendar
import copy
import datetime as dt
import json
import re
import uuid
from collections import Counter
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

FORMAT = "life-hub-recurring"
VERSION = 1
FORECAST_MONTHS = 6  # as `FORECAST_MONTHS` in src/lib/rules/money.ts
GROUPS_OF_OPS = ("Доход", "Обязательное", "Поездки и события", "Долги", "Жизнь", "Буфер")
KINDS = ("expense", "income", "transfer")
FREQS = ("weekly", "monthly", "yearly")
LINK_WINDOW_DAYS = {"weekly": 3, "monthly": 10, "yearly": 20}  # as in src/lib/rules/recurringEdit.ts
WEEK_ROWS = ("week_budget", "week_total")
RULE_FIELDS = {"key", "title", "kind", "amount_eur", "grp", "account", "to_account", "freq", "interval", "anchor_date", "end_date", "note", "link", "separate"}
AMOUNT = re.compile(r"^\d+(\.\d{1,2})?$")
DETAILS = Path(__file__).resolve().parents[2] / "data" / "recurring-dry-run.txt"


# ───────────────────────────── dates (the same schedule as src/lib/rules/recurring.ts) ─────────────────────────────


def add_months(iso: str, n: int) -> str:
    """As date-fns addMonths: a day the month lacks becomes its last day (31.01 + 1 → 28.02)."""
    d = dt.date.fromisoformat(iso)
    y, m = divmod(d.month - 1 + n, 12)
    y, m = d.year + y, m + 1
    return dt.date(y, m, min(d.day, calendar.monthrange(y, m)[1])).isoformat()


def nth_date(freq: str, interval: int, anchor: str, k: int) -> str:
    n = interval * k
    if freq == "weekly":
        return (dt.date.fromisoformat(anchor) + dt.timedelta(days=7 * n)).isoformat()
    return add_months(anchor, 12 * n if freq == "yearly" else n)


def occurrences(freq: str, interval: int, anchor: str, end: str | None, to: str) -> list[str]:
    last = end if end is not None and end < to else to
    out, k = [], 0
    while (d := nth_date(freq, interval, anchor, k)) <= last:
        out.append(d)
        k += 1
    return out


def forecast_end(today: str) -> str:
    d = dt.date.fromisoformat(add_months(today, FORECAST_MONTHS))
    return d.replace(day=calendar.monthrange(d.year, d.month)[1]).isoformat()


def today_berlin() -> str:
    return dt.datetime.now(ZoneInfo("Europe/Berlin")).date().isoformat()


def _days(a: str, b: str) -> int:
    return abs((dt.date.fromisoformat(a) - dt.date.fromisoformat(b)).days)


def _date(v: Any) -> str | None:
    if not isinstance(v, str) or not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
        return None
    try:
        dt.date.fromisoformat(v)
    except ValueError:
        return None
    return v


def _norm(s: str) -> str:
    return " ".join(s.strip().lower().split())


def similar(a: str, b: str) -> bool:
    """The title equal, or one inside the other (at least 3 letters) — as `linkCandidates` in the app."""
    x, y = _norm(a), _norm(b)
    return x == y or (min(len(x), len(y)) >= 3 and (x in y or y in x))


# ───────────────────────────── state of the base ─────────────────────────────


@dataclass
class Db:
    accounts: list[dict[str, Any]]
    recurring: list[dict[str, Any]]
    transactions: list[dict[str, Any]]


SELECT = {
    "accounts": "id,name,grp,archived",
    "recurring": "id,source_id,title,amount_eur,kind,grp,account_id,to_account_id,envelope_id,freq,interval_n,anchor_date,end_date,active,note",
    "transactions": "id,source_id,date,title,kind,entry_kind,amount_eur,is_planned,confirmed_at,cancelled_at,account_id,recurring_id,occurrence_date",
}


def read_db(rest: Any, uid: str) -> Db:
    return Db(**{t: rest.select(t, cols, {"user_id": f"eq.{uid}"}) for t, cols in SELECT.items()})


# ───────────────────────────── the plan ─────────────────────────────


@dataclass
class Write:
    table: str
    action: str  # 'insert' — new rows, an existing key is kept · 'patch' — one row by id
    id: str | None = None
    body: dict[str, Any] | None = None
    rows: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class Plan:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    writes: list[Write] = field(default_factory=list)
    counts: Counter = field(default_factory=Counter)
    details: list[str] = field(default_factory=list)  # titles, dates, sums — only for data/recurring-dry-run.txt

    def err(self, path: str, msg: str) -> None:
        self.errors.append(f"{path}: {msg}")


def _eur(v: Any) -> str:
    return f"{Decimal(str(v)):.2f}".replace(".", ",") + " €"


def _dm(iso: str) -> str:
    return f"{iso[8:10]}.{iso[5:7]}.{iso[0:4]}"


def _ref(t: dict[str, Any]) -> str:
    return f"source:{t['source_id']}" if t.get("source_id") else f"id:{t['id']}"


def _pending(t: dict[str, Any]) -> bool:
    return bool(t.get("is_planned")) and t.get("confirmed_at") is None and not t.get("cancelled_at")


def _state(t: dict[str, Any]) -> str:
    return "убрана" if t.get("cancelled_at") else "план" if _pending(t) else "факт"


def describe(freq: str, interval: int, anchor: str) -> str:
    """As `describeRule` in the app, short."""
    day = int(anchor[8:10])
    unit = {"weekly": ("каждую неделю", "недели"), "monthly": ("каждый месяц", "месяца"), "yearly": ("каждый год", "года")}[freq]
    every = unit[0] if interval == 1 else f"раз в {interval} {unit[1] if interval < 5 else 'месяцев' if freq == 'monthly' else unit[1]}"
    if freq == "weekly":
        return f"{every}, {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][dt.date.fromisoformat(anchor).weekday()]}"
    if freq == "yearly":
        return f"{every}, {anchor[8:10]}.{anchor[5:7]}"
    return f"{every}, {day}-го" + (" или в последний день" if day > 28 else "")


def plan(data: Any, db: Db, today: str, now_iso: str, new_id=lambda: str(uuid.uuid4())) -> Plan:
    p = Plan()
    if not isinstance(data, dict) or data.get("format") != FORMAT:
        p.err("format", f"не «{FORMAT}»")
        return p
    if data.get("version") != VERSION:
        p.err("version", f"ожидается {VERSION}")
    horizon = forecast_end(today)
    accounts = {a["name"]: a for a in db.accounts if not a.get("archived")}
    name_of = {a["id"]: a["name"] for a in db.accounts}
    rules_by_key = {r["source_id"]: r for r in db.recurring if r.get("source_id")}
    tx_by_ref = {_ref(t): t for t in db.transactions} | {f"id:{t['id']}": t for t in db.transactions}
    taken: dict[str, str] = {}  # transaction id → path that binds, cancels or keeps it
    new_rules: list[dict[str, Any]] = []
    links: list[Write] = []
    cancel_writes: list[Write] = []

    def row_of(path: str, ref: Any) -> dict[str, Any] | None:
        t = tx_by_ref.get(ref) if isinstance(ref, str) else None
        if t is None:
            p.err(path, "операция не найдена (source:<source_id> или id:<uuid>)")
        elif t["id"] in taken:
            p.err(path, f"эта операция уже есть в файле ({taken[t['id']]}) — одно действие на строку")
            return None
        return t

    # ── cancel: out of the plan ──
    cancels = data.get("cancel") or []
    if not isinstance(cancels, list):
        p.err("cancel", "ожидается список ссылок")
        cancels = []
    for i, ref in enumerate(cancels):
        path = f"cancel[{i}]"
        t = row_of(path, ref)
        if t is None:
            continue
        taken[t["id"]] = path
        if t.get("cancelled_at"):
            p.counts["cancel_known"] += 1
        elif not _pending(t):
            p.err(path, "не плановая строка без ответа — убрать из плана нельзя")
            continue
        elif t.get("recurring_id"):
            p.err(path, "строка — повторение правила; убирается в приложении")
            continue
        else:
            cancel_writes.append(Write("transactions", "patch", t["id"], {"cancelled_at": now_iso}))
        p.counts["cancel"] += 1
        p.details.append(f"  убрать из плана  {_ref(t)} · «{t['title']}» · {_dm(t['date'])} · {_eur(t['amount_eur'])} · {name_of.get(t['account_id'], '—')}")

    # ── rules ──
    raw_rules = data.get("rules") or []
    if not isinstance(raw_rules, list):
        p.err("rules", "ожидается список")
        raw_rules = []
    seen: set[str] = set()
    for i, r in enumerate(raw_rules):
        path = f"rules[{i}]"
        if not isinstance(r, dict):
            p.err(path, "ожидается объект")
            continue
        for f in r:
            if f not in RULE_FIELDS:
                p.err(f"{path}.{f}", "поле не из списка для правила")
        key = r.get("key")
        if not isinstance(key, str) or not key.startswith("recurring:"):
            p.err(f"{path}.key", "нужен ключ с префиксом «recurring:»")
            continue
        if key in seen:
            p.err(f"{path}.key", "ключ уже есть выше в файле")
            continue
        seen.add(key)
        path = f"rules[{key}]"
        n0 = len(p.errors)
        title = r.get("title")
        if not isinstance(title, str) or not title.strip():
            p.err(f"{path}.title", "пустое название")
            title = ""
        kind = r.get("kind")
        if kind not in KINDS:
            p.err(f"{path}.kind", "expense, income или transfer")
        amount = r.get("amount_eur")
        if not isinstance(amount, str) or not AMOUNT.match(amount) or Decimal(amount) <= 0:
            p.err(f"{path}.amount_eur", "сумма > 0 строкой с точкой, например \"9.99\"")
        grp = r.get("grp")
        if kind == "expense" and grp not in GROUPS_OF_OPS:
            p.err(f"{path}.grp", "у расхода — группа из списка")
        account = accounts.get(r.get("account")) if isinstance(r.get("account"), str) else None
        if account is None:
            p.err(f"{path}.account", "нет такого счёта (имя — точно из таблицы счетов)")
        elif kind == "expense" and account["grp"] != "balance":
            p.err(f"{path}.account", "расход — только со счёта «Баланса»")
        to_account = None
        if kind == "transfer":
            to_account = accounts.get(r.get("to_account")) if isinstance(r.get("to_account"), str) else None
            if to_account is None or (account and to_account["id"] == account["id"]):
                p.err(f"{path}.to_account", "перевод — нужен другой счёт «куда»")
        elif "to_account" in r:
            p.err(f"{path}.to_account", "куда — только у перевода")
        freq = r.get("freq")
        if freq not in FREQS:
            p.err(f"{path}.freq", "weekly, monthly или yearly")
        interval = r.get("interval", 1)
        if not isinstance(interval, int) or isinstance(interval, bool) or interval < 1:
            p.err(f"{path}.interval", "целое > 0")
        anchor = _date(r.get("anchor_date"))
        if anchor is None:
            p.err(f"{path}.anchor_date", "дата ГГГГ-ММ-ДД")
        elif anchor <= today:
            p.err(f"{path}.anchor_date", "первая дата — только будущая")
        end = r.get("end_date")
        if end is not None and (_date(end) is None or (anchor and end < anchor)):
            p.err(f"{path}.end_date", "дата ГГГГ-ММ-ДД не раньше первой или null")
        note = r.get("note")
        if note is not None and not isinstance(note, str):
            p.err(f"{path}.note", "текст или null")
        if len(p.errors) > n0:
            continue

        row = {
            "source_id": key, "title": title.strip(), "amount_eur": amount, "kind": kind,
            "grp": "Доход" if kind == "income" else None if kind == "transfer" else grp,
            "account_id": account["id"], "to_account_id": to_account["id"] if to_account else None, "envelope_id": None,
            "freq": freq, "interval_n": interval, "anchor_date": anchor, "end_date": end, "active": True,
            "note": note.strip() if isinstance(note, str) and note.strip() else None,
        }
        stored = rules_by_key.get(key)
        if stored is not None:
            same = lambda f: Decimal(str(stored[f])) == Decimal(row[f]) if f == "amount_eur" else stored.get(f) == row[f]
            diff = [f for f in row if f != "source_id" and not same(f)]
            if diff:
                p.err(path, "правило уже в базе и отличается (" + ", ".join(diff) + ") — правьте в приложении")
                continue
            rule_id = stored["id"]
            p.counts["rules_known"] += 1
        else:
            rule_id = new_id()
            new_rules.append({"id": rule_id, **row})
        p.counts["rules"] += 1
        occ = occurrences(freq, interval, anchor, end, horizon)
        p.details.append(
            f"  правило  {key} · «{row['title']}» · {_eur(amount)} · {'расход' if kind == 'expense' else 'доход' if kind == 'income' else 'перевод'}"
            f" · {account['name']}{' → ' + to_account['name'] if to_account else ''} · {row['grp'] or '—'} · {describe(freq, interval, anchor)}"
            f" · с {_dm(anchor)}{' по ' + _dm(end) if end else ''} · до {_dm(horizon)}: {len(occ)} шт. ({', '.join(d[8:10] + '.' + d[5:7] for d in occ[:7])}{' …' if len(occ) > 7 else ''})"
            + (" · уже в базе" if stored else "")
        )

        # links
        bound: dict[str, str] = {}  # occurrence → transaction id
        for t in db.transactions:
            if t.get("recurring_id") == rule_id and t.get("occurrence_date"):
                bound[t["occurrence_date"]] = t["id"]
        all_occ = set(occurrences(freq, interval, anchor, end, max([horizon] + [l.get("occurrence") for l in (r.get("link") or []) if isinstance(l, dict) and _date(l.get("occurrence"))])))
        raw_links = r.get("link") or []
        if not isinstance(raw_links, list):
            p.err(f"{path}.link", "ожидается список")
            raw_links = []
        for j, ln in enumerate(raw_links):
            lp = f"{path}.link[{j}]"
            if not isinstance(ln, dict) or set(ln) - {"ref", "occurrence", "date"}:
                p.err(lp, "ожидается { ref, occurrence, date? }")
                continue
            t = row_of(f"{lp}.ref", ln.get("ref"))
            if t is None:
                continue
            taken[t["id"]] = lp
            o = _date(ln.get("occurrence"))
            if o is None or o not in all_occ:
                p.err(f"{lp}.occurrence", "не дата этого правила")
                continue
            if t.get("recurring_id"):
                if t["recurring_id"] == rule_id and t.get("occurrence_date") == o:
                    p.counts["link_known"] += 1
                    p.counts["link"] += 1
                    continue
                p.err(lp, "строка уже привязана к другому повторению")
                continue
            if o in bound:
                p.err(f"{lp}.occurrence", "у этого повторения уже есть строка")
                continue
            if t["kind"] != kind or t.get("entry_kind") in WEEK_ROWS:
                p.err(lp, "другой вид операции")
                continue
            if t.get("cancelled_at"):
                p.err(lp, "строка убрана из плана — привязывать незачем")
                continue
            if not _pending(t):
                p.warnings.append(f"{lp}: привязывается не плановая строка без ответа ({_state(t)})")
            body: dict[str, Any] = {"recurring_id": rule_id, "occurrence_date": o}
            moved = ln.get("date")
            if moved is not None:
                if _date(moved) is None or moved <= today:
                    p.err(f"{lp}.date", "дата ГГГГ-ММ-ДД, будущая")
                    continue
                body["date"] = moved
            day = body.get("date", t["date"])
            if _days(day, o) > LINK_WINDOW_DAYS[freq]:
                p.warnings.append(f"{lp}: дата строки далеко от повторения")
            if Decimal(str(t["amount_eur"])) != Decimal(amount):
                p.warnings.append(f"{lp}: сумма строки не равна сумме правила — строка остаётся со своей")
            if t.get("account_id") != account["id"]:
                p.warnings.append(f"{lp}: счёт строки не тот, что у правила — строка остаётся со своим")
            bound[o] = t["id"]
            links.append(Write("transactions", "patch", t["id"], body))
            p.counts["link"] += 1
            p.details.append(
                f"    привязать  {_ref(t)} · «{t['title']}» · {_dm(t['date'])} · {_eur(t['amount_eur'])} · {name_of.get(t['account_id'], '—')}"
                f" → повторение {_dm(o)}" + (f" (дата строки → {_dm(moved)})" if moved else "" if t["date"] == o else f" (дата строки остаётся {_dm(t['date'])})")
            )

        # rows that stay one-off
        keep = r.get("separate") or []
        if not isinstance(keep, list):
            p.err(f"{path}.separate", "ожидается список ссылок")
            keep = []
        for j, ref in enumerate(keep):
            t = row_of(f"{path}.separate[{j}]", ref)
            if t is None:
                continue
            taken[t["id"]] = f"{path}.separate[{j}]"
            p.counts["separate"] += 1
            p.details.append(f"    остаётся разовой  {_ref(t)} · «{t['title']}» · {_dm(t['date'])} · {_eur(t['amount_eur'])} · {_state(t)}")

        # the double count: an unbound row that looks like an occurrence up to the horizon
        window = LINK_WINDOW_DAYS[freq]
        for o in occurrences(freq, interval, anchor, end, horizon):
            if o in bound:
                continue
            for t in db.transactions:
                if t["id"] in taken or t.get("recurring_id") or t.get("cancelled_at") or t.get("entry_kind") in WEEK_ROWS:
                    continue
                if t["kind"] == kind and similar(t["title"] or "", row["title"]) and _days(t["date"], o) <= window:
                    p.err(f"{path} · {_ref(t)}", "похоже на повторение — двойной счёт: link, separate или cancel")
                    taken[t["id"]] = path

    # rules first (a link must not point to a rule the base does not have yet), then links, then «out of the plan»
    p.writes = ([Write("recurring", "insert", rows=new_rules)] if new_rules else []) + links + cancel_writes
    p.counts["new_rules"] = len(new_rules)
    return p


# ───────────────────────────── writing ─────────────────────────────


def apply(rest: Any, uid: str, writes: list[Write]) -> Counter:
    """Runs the writes in the plan's order; every row is the user's (`user_id` set, patches filtered by it)."""
    done: Counter = Counter()
    for w in writes:
        if w.action == "insert":
            rest.insert(w.table, [{"user_id": uid, **r} for r in w.rows], "user_id,source_id", ignore_duplicates=True)
            done[f"{w.table}: новых"] += len(w.rows)
        else:
            rest.patch(w.table, {"id": f"eq.{w.id}", "user_id": f"eq.{uid}"}, w.body)
            done[f"{w.table}: правок"] += 1
    return done


def preview(backup: dict[str, Any], uid: str, writes: list[Write], now_iso: str) -> dict[str, Any]:
    """A backup with the writes applied — what the base would hold, for counting the forecast before writing."""
    out = copy.deepcopy(backup)
    tables = out["tables"]
    for w in writes:
        if w.action == "insert":
            for r in w.rows:
                tables[w.table].append({"user_id": uid, "created_at": now_iso, "updated_at": now_iso, **{k: (float(v) if k == "amount_eur" else v) for k, v in r.items()}})
        else:
            row = next(t for t in tables[w.table] if t["id"] == w.id)
            row.update(w.body or {})
    out["exported_at"] = now_iso
    out["preview_of"] = "recurring_load"
    return out


# ───────────────────────────── report ─────────────────────────────


def report(p: Plan, *, applied: bool) -> list[str]:
    c = p.counts
    lines = [
        "Регулярные платежи · " + ("запись" if applied else "проверка (ничего не записано)"),
        f"  правил: {c['rules']} (новых {c['new_rules']}, уже в базе {c['rules_known']})",
        f"  привязать к повторениям: {c['link']} (уже привязаны: {c['link_known']}) · оставить разовыми: {c['separate']}",
        f"  убрать из плана: {c['cancel']} (уже убраны: {c['cancel_known']})",
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

    ap = argparse.ArgumentParser(description="Регулярные платежи — в recurring, плановые строки — к их повторениям.")
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="проверить файл против базы, ничего не записывать")
    mode.add_argument("--apply", action="store_true", help="проверить и записать (только если ошибок нет)")
    ap.add_argument("file", type=Path)
    ap.add_argument("--preview", type=Path, help="с --dry-run: бэкап, к которому применить план → data/backups/preview-recurring.json (для цифр прогноза)")
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
        now_iso = dt.datetime.now(dt.timezone.utc).isoformat()
        p = plan(data, read_db(rest, uid), today_berlin(), now_iso)
        for line in report(p, applied=args.apply and not p.errors):
            print(line)
        DETAILS.write_text("\n".join(["Регулярные платежи — что сделает загрузчик (не в git)", *p.details, ""]), encoding="utf-8")
        print(f"  подробно: {DETAILS.relative_to(DETAILS.parents[1])}")
        if p.errors:
            return 1
        if args.dry_run:
            if args.preview:
                backup = json.loads(args.preview.read_text(encoding="utf-8"))
                out = args.preview.resolve().parent / "preview-recurring.json"
                out.write_text(json.dumps(preview(backup, uid, p.writes, now_iso), ensure_ascii=False, indent=1, default=str), encoding="utf-8")
                print(f"  предпросмотр базы после записи: {out.relative_to(DETAILS.parents[1])}")
            return 0
        done = apply(rest, uid, p.writes)
        print("✓ записано: " + (" · ".join(f"{k} {v}" for k, v in done.items()) or "нечего — всё уже в базе"))
        print("  дальше: npm run backup")
        return 0
    except (ConfigError, SupabaseError) as err:
        print(f"✗ {err}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
