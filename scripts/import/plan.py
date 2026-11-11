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
