"""What one import run produces: rows per table, merged weeks, and three kinds of messages.

- `report` — counts and aggregates, printed in the terminal;
- `issues` — problems with Excel row numbers, printed;
- `questions` — decisions for Ая, printed (no cell contents);
- `private` — details that need contents (titles of candidate rows), written only to data/ (gitignored).
"""
from __future__ import annotations

import datetime as dt
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Batch:
    today: dt.date
    # date of the first import: week budgets that ended before it came as «Неделя N (факт)» (decision 2026-11-11)
    anchor: dt.date | None = None
    rows: dict[str, list[dict[str, Any]]] = field(default_factory=lambda: defaultdict(list))
    weeks: dict[dt.date, dict[str, Any]] = field(default_factory=dict)
    report: list[str] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)
    questions: list[str] = field(default_factory=list)
    private: list[str] = field(default_factory=list)
    # study week label «Н04» → Monday (from «План по неделям»)
    study_weeks: dict[str, dt.date] = field(default_factory=dict)

    def add(self, table: str, row: dict[str, Any]) -> None:
        self.rows[table].append(row)

    def week(self, monday: dt.date, **fields: Any) -> None:
        """Merge week fields; the first non-empty value of a field wins (budget, then study, then glow-up)."""
        w = self.weeks.setdefault(monday, {"start_date": monday.isoformat(), "end_date": (monday + dt.timedelta(days=6)).isoformat()})
        for k, v in fields.items():
            if v is None or v == "":
                continue
            if k == "events" and w.get("events") and v not in w["events"]:
                w["events"] = f"{w['events']} · {v}"
            else:
                w.setdefault(k, v)


def noon(d: dt.date) -> str:
    """A date as a timestamp at noon Berlin time (done_at, confirmed_at) — stays on that day in any view."""
    return f"{d.isoformat()}T12:00:00+01:00"


def rows_list(numbers: list[int], limit: int = 25) -> str:
    """«12, 15, 19 …» — Excel row numbers for logs."""
    shown = ", ".join(str(n) for n in numbers[:limit])
    return shown + (f" … (+{len(numbers) - limit})" if len(numbers) > limit else "")
