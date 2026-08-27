from __future__ import annotations

from datetime import datetime
from typing import Optional

from app.services.finance.helpers import add_months, clamp, months_until, round2

# Status vocabulary shared with the frontend:
#   ON_TRACK | SLIGHTLY_BEHIND | BEHIND | COMPLETE


def required_monthly(
    target_amount: float, current_amount: float, target_date: Optional[datetime]
) -> float:
    """
    Required Monthly Saving = (Target - Current) / Remaining Months

    With no date set we assume a 12-month horizon so the figure stays
    actionable instead of dividing by zero; an overdue goal returns the whole
    remaining amount.
    """
    gap = max(0.0, round2(target_amount) - round2(current_amount))
    if gap == 0:
        return 0.0
    months = months_until(target_date)
    if months is None:
        return round2(gap / 12)
    if months == 0:
        return round2(gap)
    return round2(gap / months)


def goal_status(
    target_amount: float,
    current_amount: float,
    target_date: Optional[datetime],
    planned_monthly: float,
) -> str:
    if target_amount > 0 and current_amount >= target_amount:
        return "COMPLETE"
    need = required_monthly(target_amount, current_amount, target_date)
    if need == 0:
        return "COMPLETE"
    if planned_monthly <= 0:
        return "BEHIND" if target_date else "SLIGHTLY_BEHIND"
    ratio = planned_monthly / need
    if ratio >= 0.98:
        return "ON_TRACK"
    if ratio >= 0.75:
        return "SLIGHTLY_BEHIND"
    return "BEHIND"


def build_goal_progress(
    *,
    id: str,
    name: str,
    target_amount: float,
    current_amount: float,
    target_date: Optional[datetime],
    monthly_contribution: float,
    horizon: Optional[str] = None,
    category: Optional[str] = None,
) -> dict:
    progress = (current_amount / target_amount * 100) if target_amount > 0 else 0.0
    return {
        "id": id,
        "name": name,
        "target_amount": round2(target_amount),
        "current_amount": round2(current_amount),
        "progress_pct": round2(clamp(progress, 0, 100)),
        "target_date": target_date,
        "months_remaining": months_until(target_date),
        "required_monthly": required_monthly(target_amount, current_amount, target_date),
        "planned_monthly": round2(monthly_contribution),
        "status": goal_status(target_amount, current_amount, target_date, monthly_contribution),
        "horizon": horizon,
        "category": category,
        "remaining_amount": round2(max(0.0, target_amount - current_amount)),
    }


def months_to_reach(
    target_amount: float, current_amount: float, monthly_contribution: float
) -> Optional[int]:
    gap = max(0.0, target_amount - current_amount)
    if gap == 0:
        return 0
    if monthly_contribution <= 0:
        return None
    return int(-(-gap // monthly_contribution))  # ceil


def projected_completion_date(
    target_amount: float, current_amount: float, monthly_contribution: float
) -> Optional[datetime]:
    months = months_to_reach(target_amount, current_amount, monthly_contribution)
    if months is None:
        return None
    return add_months(datetime.utcnow(), months)


# ---------------------------------------------------------------------------
# Future Planner
# ---------------------------------------------------------------------------

def project_future_plan(
    *,
    current_cost: float,
    years_away: float,
    inflation_pct: float,
    expected_return_pct: float,
    already_saved: float,
) -> dict:
    """
    Future cost = current cost x (1 + inflation) ^ years.

    Two required-monthly figures are returned: a flat one that assumes no
    investment growth (the conservative number) and one that assumes the
    stated annual return. Both are estimates and the UI labels them as such.
    """
    years = max(0.0, float(years_away))
    months = max(1, int(round(years * 12)))
    future_cost = round2(current_cost * ((1 + inflation_pct / 100) ** years))

    r = expected_return_pct / 100 / 12
    projected_savings = round2(already_saved * ((1 + r) ** months) if r > 0 else already_saved)

    gap = round2(max(0.0, future_cost - projected_savings))
    required_flat = round2(max(0.0, future_cost - already_saved) / months)

    if r > 0:
        annuity_factor = ((1 + r) ** months - 1) / r
        required_with_returns = round2(gap / annuity_factor) if annuity_factor else required_flat
    else:
        required_with_returns = required_flat

    return {
        "current_cost": round2(current_cost),
        "future_cost": future_cost,
        "years_away": years,
        "months_away": months,
        "inflation_pct": inflation_pct,
        "expected_return_pct": expected_return_pct,
        "already_saved": round2(already_saved),
        "projected_value_of_savings": projected_savings,
        "gap": gap,
        "required_monthly_flat": required_flat,
        "required_monthly_with_returns": required_with_returns,
        "target_date": add_months(datetime.utcnow(), months),
        "inflation_impact": round2(future_cost - current_cost),
    }


def project_portfolio(
    principal: float, monthly_contribution: float, annual_return_pct: float, months: int
) -> float:
    """Future value of a lump sum plus level monthly contributions."""
    r = annual_return_pct / 100 / 12
    if r == 0:
        return round2(principal + monthly_contribution * months)
    fv_principal = principal * ((1 + r) ** months)
    fv_contrib = monthly_contribution * (((1 + r) ** months - 1) / r)
    return round2(fv_principal + fv_contrib)
