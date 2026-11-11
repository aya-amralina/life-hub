"""Three-way update of imported rows: old Excel (baseline) ↔ new Excel ↔ the base.

For every row key (table + source_id: budget IDs like N8, otherwise stable keys from the sheet):
- new key — insert;
- changed only in Excel (the base still equals the old Excel) — update the Excel-owned fields;
- changed in Excel and in the app (an edit, a confirmation, a done mark) — conflict: left as is unless
  `--excel-wins` names it;
- gone from Excel — operations get cancelled_at, open items are taken off, envelopes archived, the rest stays.
Fields the app never edits (week classification, notes, weeks) follow Excel without conflicts.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any

from model import noon

DONE_STATUS = {"work": "Erledigt", "body": "Готово", "study": "готово"}
REOPEN_STATUS = {"work": "Offen", "body": "Не начато", "study": "открыто"}
CANCEL_STATUS = {"work": "Verworfen", "body": "Отменено", "study": "снято", "money": "снято", "personal": "снято"}
DONE_WORDS = {"Erledigt", "готово", "Готово"}
CANCEL_WORDS = {"Verworfen", "снято", "Отменено"}

# Per table: Excel-owned fields compared three-way, fields that just follow Excel, app state that counts as an app
# change, what to do with a key that disappeared from Excel. Items get their fields per row (see item_fields).
SPEC: dict[str, dict[str, Any]] = {
    "transactions": {"fields": ["date", "amount_eur", "title", "note", "account", "grp", "kind"], "always": ["week_budget"], "state": ["confirmed", "cancelled"], "removed": "cancel"},
    "week_limits": {"fields": ["limit_eur"], "always": [], "state": [], "removed": "keep"},
    "envelopes": {"fields": ["type", "planned_eur", "when_text", "note"], "always": [], "state": [], "removed": "archive"},
    "items": {"fields": None, "always": [], "state": [], "removed": "take_off"},
    "notes": {"fields": [], "always": ["title", "body_md", "pinned"], "state": [], "removed": "keep"},
    "people": {"fields": [], "always": ["role"], "state": [], "removed": "keep"},
    "plan_stages": {"fields": ["start_date", "end_date", "targets", "habits", "care_items"], "always": [], "state": [], "removed": "keep"},
}
ITEM_META = {"source_id", "sphere", "sort_order", "created_at", "updated_at", "done_at", "user_id", "id"}


def item_fields(row: dict) -> list[str]:
    keys = set(row) - ITEM_META
    if row.get("sphere") in ("study", "money", "personal"):
        keys.discard("status")
        keys.add("done")
    return sorted(keys)


def _norm(table: str, k: str, v: Any, ctx: dict) -> Any:
    if k == "week":
        if isinstance(v, dt.date):
            return v.isoformat()
        return v
    if v in ("", None, []):
        return None
    if k in ("amount_eur", "limit_eur", "planned_eur", "hours_est", "capacity_base_h", "capacity_max_h"):
        return round(float(v), 2)
    if k in ("date", "due_date", "starts_on", "happens_on", "ready_by", "start_date", "end_date"):
        return str(v)[:10]
    if k in ("due_time", "happens_time"):
        return str(v)[:5]
    if k in ("people", "links"):
        return tuple(sorted(v))
    if k in ("habits", "care_items"):
        return tuple(v)
    if k == "targets":
        return tuple(sorted((a, round(float(b), 2)) for a, b in (v or {}).items() if a != "activity_points_week")) or None
    if isinstance(v, str):
        return v.strip()
    return v


def comparable(table: str, row: dict, fields: list[str], ctx: dict) -> dict:
    """The row as the update compares it — the same shape for an Excel row and a base row."""
    out = {}
    for k in fields:
        if k == "done":
            out[k] = bool(row.get("done_at")) and row.get("status") not in CANCEL_WORDS or row.get("status") in DONE_WORDS
        elif k == "confirmed":
            out[k] = (not row.get("is_planned")) or bool(row.get("confirmed_at"))
        elif k == "cancelled":
            out[k] = bool(row.get("cancelled_at"))
        elif k == "week" and "week_id" in row:
            out[k] = ctx["week_start"].get(row["week_id"])
        else:
            out[k] = _norm(table, k, row.get(k), ctx)
    return out


@dataclass
class Change:
    table: str
    key: str
    kind: str  # insert | update | conflict | remove | keep-removed | always
    fields: list[str] = field(default_factory=list)
    app_fields: list[str] = field(default_factory=list)
    patch: dict[str, Any] = field(default_factory=dict)
    row: dict[str, Any] | None = None
    db_id: str | None = None
    title: str = ""
    detail: str = ""


def display_key(table: str, key: str) -> str:
    return key.removeprefix("budget:") if table == "transactions" else key


def diff(table: str, new_rows: list[dict], old: dict[str, dict], base: dict[str, dict], ctx: dict, excel_wins: set[str], today: dt.date) -> list[Change]:
    """old: baseline comparable records by key (from the last import); base: rows in the base by source_id."""
    spec = SPEC[table]
    changes: list[Change] = []
    seen = set()
    for row in new_rows:
        key = row["source_id"]
        seen.add(key)
        title = str(row.get("title") or row.get("name") or "")
        have = base.get(key)
        if have is None:
            changes.append(Change(table, key, "insert", row=row, title=title))
            continue
        fields = item_fields(row) if spec["fields"] is None else spec["fields"]
        e_new = comparable(table, row, fields, ctx)
        d = comparable(table, have, fields, ctx)
        e_old = old.get(key, {}).get("fields") or d  # no baseline for this key: treat the base as the old Excel
        always_patch = {k: row.get(k) for k in spec["always"] if _norm(table, k, row.get(k), ctx) != _norm(table, k, have.get(k), ctx)}
        # a field counts only where the base differs from the new Excel (already equal = nothing to do or decide)
        excel_changed = [k for k in fields if e_new.get(k) != e_old.get(k) and e_new.get(k) != d.get(k)]
        if not excel_changed:
            if always_patch:
                changes.append(Change(table, key, "always", fields=list(always_patch), patch=always_patch | _extra(table, row, have, always_patch), db_id=have["id"], title=title))
            continue
        state_old = old.get(key, {}).get("state")
        state_new = comparable(table, have, spec["state"], ctx)
        app_changed = [k for k in fields if d.get(k) != e_old.get(k) and d.get(k) != e_new.get(k)] + (
            [k for k in spec["state"] if state_old is not None and state_new.get(k) != state_old.get(k)]
        )
        patch = _patch(table, row, have, excel_changed, ctx, today, e_old) | always_patch
        patch |= _extra(table, row, have, patch)
        detail = "; ".join(f"{k}: было {e_old.get(k)!r} → в Excel {e_new.get(k)!r}, в базе {d.get(k, state_new.get(k))!r}" for k in sorted(set(excel_changed) | set(app_changed)))
        if app_changed and display_key(table, key) not in excel_wins and "all" not in excel_wins:
            changes.append(Change(table, key, "conflict", fields=excel_changed, app_fields=app_changed, patch=patch, db_id=have["id"], title=title, detail=detail))
        else:
            changes.append(Change(table, key, "update", fields=excel_changed, app_fields=app_changed, patch=patch, db_id=have["id"], title=title, detail=detail))
    for key in sorted(set(old) | set(base)):
        if key in seen or key not in base or old.get(key, {}).get("removed"):
            continue
        have = base[key]
        title = str(have.get("title") or have.get("name") or "")
        action = spec["removed"]
        patch = _removal(table, action, have, today)
        if patch:
            changes.append(Change(table, key, "remove", patch=patch, db_id=have["id"], title=title))
        else:
            changes.append(Change(table, key, "keep-removed", db_id=have["id"], title=title))
    return changes


def _patch(table: str, row: dict, have: dict, changed: list[str], ctx: dict, today: dt.date, e_old: dict) -> dict:
    out: dict[str, Any] = {}
    for k in changed:
        if k == "done":
            sphere = row.get("sphere", "")
            if row.get("done_at") or row.get("status") in DONE_WORDS:
                out["done_at"] = row.get("done_at") or noon(today)
                if sphere in DONE_STATUS:
                    out["status"] = DONE_STATUS[sphere]
            else:
                out["done_at"] = None
                if sphere in REOPEN_STATUS:
                    out["status"] = REOPEN_STATUS[sphere]
        elif k == "week":
            out["week_id"] = ctx["week_id"].get(row["week"].isoformat()) if row.get("week") else None
        elif k == "targets":
            # Excel owns its target keys (a key gone from Excel goes away); the app's own keys stay
            old_keys = {a for a, _ in (e_old.get("targets") or ())}
            merged = {a: v for a, v in (have.get("targets") or {}).items() if a not in old_keys}
            merged.update(row.get("targets") or {})
            out["targets"] = merged
        else:
            out[k] = row.get(k)
    if table == "items" and row.get("sphere") == "work" and "status" in out:
        out["done_at"] = row.get("done_at") if out["status"] == "Erledigt" else None
    return out


def _extra(table: str, row: dict, have: dict, patch: dict) -> dict:
    """A week row that Excel now marks as the week's fact gets confirmed as such."""
    if table == "transactions" and row.get("week_budget") and not row.get("is_planned") and have.get("is_planned") and not have.get("confirmed_at"):
        return {"is_planned": False, "confirmed_at": row.get("confirmed_at")}
    return {}


def _removal(table: str, action: str, have: dict, today: dt.date) -> dict:
    if action == "cancel" and not have.get("cancelled_at"):
        return {"cancelled_at": noon(today)}
    if action == "take_off" and not have.get("done_at") and have.get("status") not in DONE_WORDS | CANCEL_WORDS:
        return {"status": CANCEL_STATUS.get(have.get("sphere", ""), "снято"), "done_at": None}
    if action == "archive" and not have.get("archived"):
        return {"archived": True}
    return {}


def baseline_records(table: str, rows: list[dict], ctx: dict) -> dict[str, dict]:
    """What to remember after this run: per key the comparable Excel fields and app state."""
    spec = SPEC[table]
    out = {}
    for row in rows:
        fields = item_fields(row) if spec["fields"] is None else spec["fields"]
        out[row["source_id"]] = {"fields": comparable(table, row, fields, ctx), "state": comparable(table, row, spec["state"], ctx)}
    return out


def to_json(v: Any) -> Any:
    if isinstance(v, dict):
        return {k: to_json(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [to_json(x) for x in v]
    return v


def from_json(rec: dict) -> dict:
    """Baseline from the base: lists back to tuples, as `comparable` makes them."""
    def back(v: Any) -> Any:
        if isinstance(v, list):
            return tuple(back(x) if not isinstance(x, list) else tuple(x) for x in v)
        return v

    return {"fields": {k: back(v) for k, v in (rec.get("fields") or {}).items()}, "state": rec.get("state") or {}, "removed": rec.get("removed", False)}
