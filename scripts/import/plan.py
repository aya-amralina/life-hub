"""Dry-run preview of what the app will do right after the import: the study rollover (rule 20/21) and the
section-6 control numbers. Mirrors src/lib/rules/study.ts (planRollover) and money.ts (balanceAt) — keep in sync.
"""
from __future__ import annotations

import datetime as dt
from collections import defaultdict
from dataclasses import dataclass

CAPACITY_DEFAULT = (27.0, 36.0)
CAPACITY_HALF = (13.5, 18.0)


def is_open(i: dict) -> bool:
    return i.get("done_at") is None and i.get("status") not in ("готово", "Готово", "Erledigt", "снято", "Отменено", "Verworfen")


def is_fixed(i: dict) -> bool:
    return i["is_fixed"] if i.get("is_fixed") is not None else i.get("due_date") is not None


def capacity(week: dict | None) -> tuple[float, float]:
    half = "½" in ((week or {}).get("place_mode") or "") or "½" in ((week or {}).get("study_mode") or "")
    base, mx = CAPACITY_HALF if half else CAPACITY_DEFAULT
    return (float((week or {}).get("capacity_base_h") or base), float((week or {}).get("capacity_max_h") or mx))


@dataclass
class WeekStat:
    label: str
    monday: dt.date
    total: int = 0
    done: int = 0
    flexible_open: int = 0
    moves: int = 0
    waiting: int = 0


def rollover_preview(items: list[dict], weeks: dict[dt.date, dict], today: dt.date):
    """Per study week: items, done (✓), open flexible; for past weeks how many move into the current week and how
    many wait for a decision (current week stays ≤ its maximum)."""
    current = today - dt.timedelta(days=today.weekday())
    study = [i for i in items if i["sphere"] == "study" and i.get("week")]
    stats: dict[dt.date, WeekStat] = {}
    for i in study:
        w = i["week"]
        s = stats.setdefault(w, WeekStat((weeks.get(w) or {}).get("study_week") or w.strftime("%d.%m"), w))
        s.total += 1
        s.done += not is_open(i)
        s.flexible_open += is_open(i) and not is_fixed(i)
    base, mx = capacity(weeks.get(current))
    load = sum(float(i.get("hours_est") or 0) for i in study if i["week"] == current)
    load_before = load
    candidates = sorted(
        (i for i in study if i["week"] < current and is_open(i) and not is_fixed(i)),
        key=lambda i: (i["week"], i.get("ready_by") or "9999", i.get("sort_order") or 0, i["source_id"]),
    )
    moved_hours = waiting_hours = 0.0
    for i in candidates:
        h = float(i.get("hours_est") or 0)
        if load + h <= mx + 1e-9:
            load = round(load + h, 2)
            stats[i["week"]].moves += 1
            moved_hours += h
        else:
            stats[i["week"]].waiting += 1
            waiting_hours += h
    summary = {
        "current": current,
        "label": (weeks.get(current) or {}).get("study_week") or current.strftime("%d.%m"),
        "base": base,
        "max": mx,
        "load_before": round(load_before, 2),
        "load_after": round(load, 2),
        "moved_hours": round(moved_hours, 2),
        "waiting_hours": round(waiting_hours, 2),
    }
    return sorted(stats.values(), key=lambda s: s.monday), summary


def signed(t: dict) -> float:
    if t["kind"] in ("opening", "income"):
        return t["amount_eur"]
    if t["kind"] == "expense":
        return -t["amount_eur"]
    return 0.0


def balance_end(txs: list[dict], end: str = "2026-12-31") -> float:
    return round(sum(signed(t) for t in txs if t["date"] <= end), 2)


def week_hours(items: list[dict], label: str, weeks: dict[dt.date, dict]) -> float:
    mon = next((m for m, w in weeks.items() if w.get("study_week") == label), None)
    return round(sum(float(i.get("hours_est") or 0) for i in items if i["sphere"] == "study" and i.get("week") == mon and "dl:" not in i["source_id"]), 2)


def per_week_done(items: list[dict]) -> dict[dt.date, int]:
    out: dict[dt.date, int] = defaultdict(int)
    for i in items:
        if i["sphere"] == "study" and not is_open(i):
            out[i["week"]] += 1
    return out


WEEK_CATEGORIES = {"Продукты", "Кофейни и перекусы", "Выходы и еда вне дома", "Мелочи", "Шопинг", "Доставка"}


def _week_row(t: dict) -> bool:
    return t.get("entry_kind") in ("week_budget", "week_total")


def _is_fact(t: dict) -> bool:
    return not t.get("cancelled_at") and (not t.get("is_planned") or bool(t.get("confirmed_at")))


def app_forecast_all(txs: list[dict], today: dt.date, end: str = "2026-12-31") -> float:
    """«На счетах 31.12» exactly as money.ts balanceAt(plan) computes it over all rows of the base (rule 26):
    planned week budgets — finished weeks drop out, the current week costs max(budget, spent), later weeks in
    full; a confirmed week fact replaces the app's weekly-category expenses of that week in the balance."""
    def monday(s: str) -> dt.date:
        d = dt.date.fromisoformat(s[:10])
        return d - dt.timedelta(days=d.weekday())

    live = [t for t in txs if not t.get("cancelled_at")]
    fact_weeks = {monday(t["date"]) for t in live if t.get("entry_kind") == "week_total" and _is_fact(t)}

    def spent(week: dt.date) -> float:
        return sum(float(t["amount_eur"]) for t in live if t["kind"] == "expense" and not _week_row(t) and _is_fact(t) and t.get("category") in WEEK_CATEGORIES and monday(t["date"]) == week)

    total = 0.0
    for t in live:
        if t["date"] > end:
            continue
        amount = float(t["amount_eur"])
        if not _week_row(t) and t["kind"] == "expense" and t.get("category") in WEEK_CATEGORIES and monday(t["date"]) in fact_weeks:
            continue
        if t.get("entry_kind") == "week_budget" and not _is_fact(t):
            w = monday(t["date"])
            if w + dt.timedelta(days=6) < today:
                continue
            if w <= today:
                total -= max(0.0, amount - spent(w))
                continue
        total += {"opening": amount, "income": amount, "expense": -amount}.get(t["kind"], 0.0)
    return round(total, 2)


ACCOUNTS = ("Revolut", "Sparkasse", "Наличные", "Казахстанская карта")


def fact_balance(txs: list[dict], date: str) -> float:
    """«сейчас» as money.ts balanceAt(fact): start + operations with status «факт», not cancelled; a week with
    «итог недели» counts that total instead of the app's weekly-category expenses of the week."""
    def monday(s: str) -> dt.date:
        d = dt.date.fromisoformat(s[:10])
        return d - dt.timedelta(days=d.weekday())

    live = [t for t in txs if not t.get("cancelled_at") and _is_fact(t) and t["date"][:10] <= date]
    fact_weeks = {monday(t["date"]) for t in live if t.get("entry_kind") == "week_total"}
    total = 0.0
    for t in live:
        if not _week_row(t) and t["kind"] == "expense" and t.get("category") in WEEK_CATEGORIES and monday(t["date"]) in fact_weeks:
            continue
        amount = float(t["amount_eur"])
        total += {"opening": amount, "income": amount, "expense": -amount}.get(t["kind"], 0.0)
    return round(total, 2)


def reconcile(balances: list[dict], txs: list[dict]) -> dict | None:
    """Latest date of «Остатки» with account rows: their sum against the calculated balance on that date."""
    rows = [b for b in balances if b["account"] in ACCOUNTS]
    if not rows:
        return None
    date = max(b["date"][:10] for b in rows)
    on = {b["account"]: float(b["amount_eur"]) for b in rows if b["date"][:10] == date}
    actual = round(sum(on.values()), 2)
    calc = fact_balance(txs, date)
    return {"date": date, "actual": actual, "calculated": calc, "diff": round(actual - calc, 2), "missing": [a for a in ACCOUNTS if a not in on]}
