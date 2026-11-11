"""Shared parsing for the Excel import: files, dates, text dates, week math. No printing of cell values.

Dates in the trackers are Excel dates (datetime / serial numbers) or texts like «Fr 23.10»,
«Mi 28.10 10:00», «Fr 30.10 (допущ.)», «So 08.11 9:00». The year is implied: Oct–Dec → 2026,
Jan–Apr → 2027 (WiSe 26/27 and the budget Oct–Dec).
"""
from __future__ import annotations

import datetime as dt
import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"

# File name patterns (names differ from SPEC — decision 2026-11-09).
FILES = {
    "budget": ["Budget*.xlsx"],
    "work": ["Localiser*.xlsx"],
    "study": ["Wochenplan*WiSe*.xlsx", "WiSe*.xlsx"],
    "glow": ["Глоу*.xlsx", "Glow*.xlsx"],
}


def find_file(kind: str, folder: Path = DATA) -> Path:
    for pattern in FILES[kind]:
        found = sorted(p for p in folder.glob(pattern) if not p.name.startswith("~$"))
        if found:
            return found[0]
    raise FileNotFoundError(f"в {folder.name}/ нет файла для «{kind}» ({', '.join(FILES[kind])})")


def year_for_month(month: int) -> int:
    """Oct–Dec → 2026, Jan–Apr → 2027. Other months do not occur in the trackers."""
    if 10 <= month <= 12:
        return 2026
    if 1 <= month <= 4:
        return 2027
    raise ValueError(f"месяц {month} вне семестра")


EXCEL_EPOCH = dt.date(1899, 12, 30)


def excel_date(value: Any) -> dt.date | None:
    """Excel date cell: datetime, date or serial number (46308 = 13.10.2026)."""
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool) and 30000 < value < 60000:
        return EXCEL_EPOCH + dt.timedelta(days=int(value))
    return None


@dataclass(frozen=True)
class TextDate:
    date: dt.date
    time: str | None  # 'HH:MM'
    assumption: bool  # «(допущ.)», «?»


_TEXT_DATE = re.compile(
    r"^(?:(?P<wd>[A-Za-zА-Яа-яЁё]{2,3})\.?\s+)?(?P<d>\d{1,2})\.(?P<m>\d{1,2})\.?(?:(?P<y>\d{2,4}))?"
    r"(?:\s+(?P<h>\d{1,2})[:.](?P<min>\d{2}))?(?P<rest>.*)$"
)


def parse_text_date(text: str) -> TextDate | None:
    """«Fr 23.10», «Mi 28.10 10:00», «Fr 30.10 (допущ.)», «28.10.2026» → date (+ time, assumption)."""
    s = text.strip()
    m = _TEXT_DATE.match(s)
    if not m:
        return None
    day, month = int(m["d"]), int(m["m"])
    year = int(m["y"]) if m["y"] else None
    if year is not None and year < 100:
        year += 2000
    try:
        date = dt.date(year or year_for_month(month), month, day)
    except ValueError:
        return None
    time = f"{int(m['h']):02d}:{m['min']}" if m["h"] else None
    rest = (m["rest"] or "").lower()
    return TextDate(date, time, "допущ" in rest or "?" in rest)


def any_date(value: Any) -> TextDate | None:
    d = excel_date(value)
    if d:
        t = value.strftime("%H:%M") if isinstance(value, dt.datetime) and (value.hour or value.minute) else None
        return TextDate(d, t, False)
    if isinstance(value, str):
        return parse_text_date(value)
    return None


_RANGE = re.compile(r"(\d{1,2})\.(\d{1,2})\.?\s*[–—-]\s*(?:[A-Za-zА-Яа-я]{2,3}\.?\s+)?(\d{1,2})\.(\d{1,2})")


def parse_range(text: str) -> tuple[dt.date, dt.date] | None:
    """«12.10–18.10», «Mo 12.10–So 18.10», «21.12–08.01» (across the new year)."""
    m = _RANGE.search(text)
    if not m:
        return None
    d1, m1, d2, m2 = map(int, m.groups())
    try:
        return dt.date(year_for_month(m1), m1, d1), dt.date(year_for_month(m2), m2, d2)
    except ValueError:
        return None


_TIME = re.compile(r"^(\d{1,2})[:.](\d{2})")


def parse_time(value: Any) -> str | None:
    if isinstance(value, dt.time):
        return value.strftime("%H:%M")
    if isinstance(value, dt.datetime):
        return value.strftime("%H:%M")
    if isinstance(value, str):
        m = _TIME.match(value.strip())
        if m:
            return f"{int(m[1]):02d}:{m[2]}"
    return None


def monday(d: dt.date) -> dt.date:
    return d - dt.timedelta(days=d.weekday())


def sunday(d: dt.date) -> dt.date:
    return monday(d) + dt.timedelta(days=6)


def text(value: Any) -> str | None:
    """Trimmed text or None (also for «—», «-», empty)."""
    if value is None:
        return None
    s = str(value).strip()
    return None if s in ("", "—", "-", "–", "None") else s


def number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        s = value.strip().replace(",", ".").replace(" ", "")
        try:
            return float(s)
        except ValueError:
            return None
    return None


def is_check(value: Any) -> bool:
    return isinstance(value, str) and value.strip() in ("✓", "✔", "x", "X", "да", "Да") or value is True


def stable_id(*parts: Any) -> str:
    """Short stable hash for source_id when the sheet has no ID column."""
    raw = "␟".join("" if p is None else str(p).strip().lower() for p in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]


def mask(s: str) -> str:
    """Shape of a text without its content (letters → a, digits → 9) — for logs."""
    return re.sub(r"\d", "9", re.sub(r"[A-Za-zÀ-ÿА-Яа-яЁё]+", "a", s))[:40]


def rows(ws, header_row: int):
    """(excel_row_number, values) for every non-empty row below the header."""
    for i, values in enumerate(ws.iter_rows(min_row=header_row + 1, values_only=True), start=header_row + 1):
        if any(v not in (None, "") for v in values):
            yield i, values


def col(letter: str) -> int:
    n = 0
    for ch in letter:
        n = n * 26 + ord(ch) - 64
    return n - 1
