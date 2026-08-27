from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from typing import Iterable, Optional, Tuple

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def round2(value: Optional[float]) -> float:
    """Every money figure in the app goes through here."""
    if value is None:
        return 0.0
    try:
        return round(float(value) + 0.0, 2)
    except (TypeError, ValueError):
        return 0.0


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def pct(part: float, whole: float) -> float:
    """Safe percentage - returns 0 instead of dividing by zero."""
    if not whole:
        return 0.0
    return round2((part / whole) * 100)


def total(values: Iterable[float]) -> float:
    return round2(sum(float(v or 0) for v in values))


def month_name(month: int) -> str:
    return MONTH_NAMES[int(clamp(month, 1, 12)) - 1]


def days_in_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def month_range(year: int, month: int) -> Tuple[datetime, datetime]:
    """Inclusive [start, end] datetimes covering a calendar month."""
    start = datetime(year, month, 1, 0, 0, 0)
    end = datetime(year, month, days_in_month(year, month), 23, 59, 59, 999999)
    return start, end


def add_months(d: datetime, months: int) -> datetime:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, days_in_month(year, month))
    return d.replace(year=year, month=month, day=day)


def previous_month(year: int, month: int) -> Tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def months_until(target: Optional[datetime], frm: Optional[datetime] = None) -> Optional[int]:
    """Whole months from `frm` to `target`, floored at 0. None when no target."""
    if target is None:
        return None
    frm = frm or datetime.utcnow()
    if target <= frm:
        return 0
    delta_days = (target - frm).days
    return max(0, -(-delta_days // 30) if delta_days % 30 else delta_days // 30) or 1


def start_of_week(d: datetime) -> datetime:
    """Week starts on Monday."""
    base = datetime(d.year, d.month, d.day)
    return base - timedelta(days=base.weekday())


def to_date(value) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day)
    return None


def money_str(value: float, symbol: str = "") -> str:
    """Plain grouped formatting used inside generated explanations."""
    return f"{symbol}{round2(value):,.0f}"
