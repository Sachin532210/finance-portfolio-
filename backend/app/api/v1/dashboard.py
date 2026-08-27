from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import (
    CURRENCY_SYMBOLS,
    DEBT_TYPES,
    DISCLAIMER,
    EMPLOYMENT_TYPES,
    EXPENSE_CATEGORIES,
    FUTURE_PLAN_CATEGORIES,
    GOAL_HORIZONS,
    INCOME_CATEGORIES,
    INVESTMENT_TYPES,
    NECESSITY_LEVELS,
    PAYMENT_METHODS,
    RISK_TOLERANCES,
    SAVINGS_CATEGORIES,
)
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.insights import FinancialSnapshot, Notification
from app.models.user import User
from app.schemas.common import OptionsResponse
from app.services.finance.context import build_financial_context
from app.services.finance.helpers import round2
from app.services.finance.purchase import build_buying_guide
from app.services.finance.rules_engine import evaluate_rules, persist_insights
from app.services.market_data import provider_status

router = APIRouter(tags=["dashboard"])


@router.get("/options", response_model=OptionsResponse)
def get_options():
    """Server-owned vocabulary, so the UI selects can never drift from validation."""
    return OptionsResponse(
        expense_categories=EXPENSE_CATEGORIES,
        payment_methods=PAYMENT_METHODS,
        income_categories=INCOME_CATEGORIES,
        employment_types=EMPLOYMENT_TYPES,
        investment_types=INVESTMENT_TYPES,
        debt_types=DEBT_TYPES,
        savings_categories=SAVINGS_CATEGORIES,
        goal_horizons=GOAL_HORIZONS,
        future_plan_categories=FUTURE_PLAN_CATEGORIES,
        risk_tolerances=RISK_TOLERANCES,
        necessity_levels=NECESSITY_LEVELS,
        currencies=list(CURRENCY_SYMBOLS.keys()),
        disclaimer=DISCLAIMER,
    )


@router.get("/dashboard")
def get_dashboard(
    month: Optional[int] = Query(default=None, ge=1, le=12),
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    The full financial picture for one month.

    Everything the dashboard renders comes from this single response, so no two
    cards can disagree about a number.
    """
    ctx = build_financial_context(db, user, month=month, year=year)

    # Run the rules engine on every dashboard load; dedupe keys stop the same
    # alert being written twice.
    insights = evaluate_rules(ctx)
    persist_insights(db, user.id, insights)

    unread = db.scalar(
        select(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .order_by(Notification.created_at.desc())
    )
    unread_count = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.read_at.is_(None))
        .count()
    )

    upcoming = _upcoming_payments(ctx)

    return {
        **ctx,
        "insights": [
            {
                "type": i.type,
                "severity": i.severity,
                "title": i.title,
                "message": i.message,
                "action_url": i.action_url,
            }
            for i in insights
        ],
        "buying_guide": build_buying_guide(ctx),
        "upcoming_payments": upcoming,
        "unread_notifications": unread_count,
        "latest_notification": (
            {"title": unread.title, "message": unread.message, "severity": unread.severity}
            if unread
            else None
        ),
        "market_data": provider_status(),
        "disclaimer": DISCLAIMER,
    }


@router.get("/net-worth/history")
def net_worth_history(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Historical net worth, plus today's live figure appended."""
    snapshots = list(
        db.scalars(
            select(FinancialSnapshot)
            .where(FinancialSnapshot.user_id == user.id)
            .order_by(FinancialSnapshot.taken_at.asc())
        )
    )
    ctx = build_financial_context(db, user)
    series = [
        {
            "date": s.taken_at.strftime("%Y-%m-%d"),
            "label": s.taken_at.strftime("%b %y"),
            "net_worth": round2(s.net_worth),
            "assets": round2(s.total_assets),
            "liabilities": round2(s.total_liabilities),
            "investments": round2(s.investments),
            "savings": round2(s.savings),
        }
        for s in snapshots
    ]
    today = datetime.utcnow()
    live = {
        "date": today.strftime("%Y-%m-%d"),
        "label": today.strftime("%b %y"),
        "net_worth": ctx["net_worth"]["net_worth"],
        "assets": ctx["net_worth"]["total_assets"],
        "liabilities": ctx["net_worth"]["total_liabilities"],
        "investments": ctx["net_worth"]["investments"],
        "savings": ctx["net_worth"]["savings"],
        "is_current": True,
    }
    if series and series[-1]["date"] == live["date"]:
        series[-1] = live
    else:
        series.append(live)

    first = series[0]["net_worth"] if series else 0
    return {
        "series": series,
        "current": ctx["net_worth"],
        "change_since_start": round2(live["net_worth"] - first),
        "change_pct": round2(((live["net_worth"] - first) / abs(first) * 100) if first else 0),
        "currency": ctx["currency"],
        "currency_symbol": ctx["currency_symbol"],
    }


@router.post("/net-worth/snapshot")
def take_snapshot(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Records today's net worth so the growth chart has a real data point."""
    ctx = build_financial_context(db, user)
    nw = ctx["net_worth"]
    snapshot = FinancialSnapshot(
        user_id=user.id,
        net_worth=nw["net_worth"],
        total_assets=nw["total_assets"],
        total_liabilities=nw["total_liabilities"],
        cash=round2(nw["cash"] + nw["bank"]),
        savings=nw["savings"],
        investments=nw["investments"],
        emergency_fund=nw["emergency_fund"],
        health_score=ctx["health_score"]["score"],
    )
    db.add(snapshot)
    db.commit()
    return {"message": "Snapshot saved.", "net_worth": nw["net_worth"], "id": snapshot.id}


@router.get("/calendar")
def financial_calendar(
    month: Optional[int] = Query(default=None, ge=1, le=12),
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Salary date, EMI dates, recurring bills, goal dates and contributions."""
    ctx = build_financial_context(db, user, month=month, year=year)
    m, y = ctx["month"], ctx["year"]
    days = ctx["spend"]["days_in_month"]
    events = []

    def day_of(d: int) -> str:
        return f"{y}-{m:02d}-{min(max(d, 1), days):02d}"

    if ctx["profile"]["monthly_salary"] > 0:
        events.append(
            {
                "date": day_of(ctx["profile"]["salary_day"]),
                "type": "SALARY",
                "title": "Salary credited",
                "amount": ctx["profile"]["monthly_salary"],
                "direction": "IN",
            }
        )

    for d in ctx["debt"]["items"]:
        if d["emi"] > 0:
            events.append(
                {
                    "date": day_of(d["due_day"]),
                    "type": "EMI",
                    "title": f"{d['name']} EMI",
                    "amount": d["emi"],
                    "direction": "OUT",
                }
            )

    from app.models.finance import Expense

    recurring = db.scalars(
        select(Expense).where(Expense.user_id == user.id, Expense.is_recurring.is_(True))
    )
    seen = set()
    for e in recurring:
        key = (e.description, e.spent_at.day)
        if key in seen:
            continue
        seen.add(key)
        events.append(
            {
                "date": day_of(e.spent_at.day),
                "type": "BILL",
                "title": e.description,
                "amount": round2(e.amount),
                "direction": "OUT",
                "category": e.category,
            }
        )

    for g in ctx["savings"]["goals"]:
        if g["planned_monthly"] > 0:
            events.append(
                {
                    "date": day_of(ctx["profile"]["salary_day"] + 1),
                    "type": "SAVINGS",
                    "title": f"Contribute to {g['name']}",
                    "amount": g["planned_monthly"],
                    "direction": "OUT",
                }
            )
        if g["target_date"] and g["target_date"].month == m and g["target_date"].year == y:
            events.append(
                {
                    "date": g["target_date"].strftime("%Y-%m-%d"),
                    "type": "GOAL",
                    "title": f"Target date: {g['name']}",
                    "amount": g["target_amount"],
                    "direction": "NONE",
                }
            )

    for g in ctx["goals"]:
        if g["target_date"] and g["target_date"].month == m and g["target_date"].year == y:
            events.append(
                {
                    "date": g["target_date"].strftime("%Y-%m-%d"),
                    "type": "GOAL",
                    "title": f"Target date: {g['name']}",
                    "amount": g["target_amount"],
                    "direction": "NONE",
                }
            )

    events.sort(key=lambda e: e["date"])
    return {
        "month": m,
        "year": y,
        "month_label": ctx["month_label"],
        "days_in_month": days,
        "events": events,
        "currency_symbol": ctx["currency_symbol"],
        "total_in": round2(sum(e["amount"] for e in events if e["direction"] == "IN")),
        "total_out": round2(sum(e["amount"] for e in events if e["direction"] == "OUT")),
    }


def _upcoming_payments(ctx: dict) -> list[dict]:
    """EMIs and recurring bills falling in the next 10 days."""
    today = ctx["as_of"].day if isinstance(ctx["as_of"], datetime) else datetime.utcnow().day
    days = ctx["spend"]["days_in_month"]
    out = []
    for d in ctx["debt"]["items"]:
        if d["emi"] <= 0:
            continue
        due = d["due_day"]
        days_away = due - today if due >= today else (days - today) + due
        if days_away <= 10:
            out.append(
                {
                    "title": f"{d['name']} EMI",
                    "amount": d["emi"],
                    "due_day": due,
                    "days_away": days_away,
                    "type": "EMI",
                }
            )
    salary_day = ctx["profile"]["salary_day"]
    if ctx["profile"]["monthly_salary"] > 0:
        days_away = salary_day - today if salary_day >= today else (days - today) + salary_day
        if days_away <= 10:
            out.append(
                {
                    "title": "Salary credit",
                    "amount": ctx["profile"]["monthly_salary"],
                    "due_day": salary_day,
                    "days_away": days_away,
                    "type": "INCOME",
                }
            )
    out.sort(key=lambda x: x["days_away"])
    return out
