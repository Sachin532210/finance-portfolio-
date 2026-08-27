from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import DISCLAIMER
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.finance import Expense, Income
from app.models.insights import FinancialSnapshot, MonthlyReport
from app.models.investments import InvestmentTransaction
from app.models.user import User
from app.services.finance.context import build_financial_context
from app.services.finance.helpers import month_name, month_range, pct, round2
from app.services.finance.reports import (
    expenses_to_csv,
    generate_monthly_report,
    net_worth_to_csv,
    report_to_csv,
)

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/monthly")
def monthly_report(
    month: Optional[int] = Query(default=None, ge=1, le=12),
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The AI Monthly Financial Review for one period."""
    now = datetime.utcnow()
    return {
        **generate_monthly_report(db, user, month or now.month, year or now.year),
        "disclaimer": DISCLAIMER,
    }


@router.get("/monthly/history")
def report_history(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(
        select(MonthlyReport)
        .where(MonthlyReport.user_id == user.id)
        .order_by(MonthlyReport.year.desc(), MonthlyReport.month.desc())
        .limit(24)
    )
    return [
        {
            "month": r.month,
            "year": r.year,
            "period_label": f"{month_name(r.month)} {r.year}",
            "total_income": round2(r.total_income),
            "total_expenses": round2(r.total_expenses),
            "total_savings": round2(r.total_savings),
            "total_invested": round2(r.total_invested),
            "savings_rate": round2(r.savings_rate),
            "health_score": r.health_score,
            "summary": r.summary,
            "top_categories": json.loads(r.top_categories or "[]"),
            "good_decisions": json.loads(r.good_decisions or "[]"),
            "problems": json.loads(r.problems or "[]"),
            "next_month_plan": json.loads(r.next_month_plan or "[]"),
        }
        for r in rows
    ]


@router.get("/yearly")
def yearly_report(
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Twelve-month roll-up: income, expenses, savings and category totals."""
    year = year or datetime.utcnow().year
    start = datetime(year, 1, 1)
    end = datetime(year, 12, 31, 23, 59, 59)

    expenses = list(
        db.scalars(
            select(Expense).where(
                Expense.user_id == user.id, Expense.spent_at >= start, Expense.spent_at <= end
            )
        )
    )
    incomes = list(
        db.scalars(
            select(Income).where(
                Income.user_id == user.id, Income.received_at >= start, Income.received_at <= end
            )
        )
    )
    txns = list(
        db.scalars(
            select(InvestmentTransaction).where(
                InvestmentTransaction.user_id == user.id,
                InvestmentTransaction.occurred_at >= start,
                InvestmentTransaction.occurred_at <= end,
                InvestmentTransaction.type == "BUY",
            )
        )
    )

    ctx = build_financial_context(db, user)
    planned = ctx["income"]["planned_monthly"]

    months = []
    for m in range(1, 13):
        m_start, m_end = month_range(year, m)
        inc = round2(sum(float(i.amount) for i in incomes if m_start <= i.received_at <= m_end))
        exp = round2(sum(float(e.amount) for e in expenses if m_start <= e.spent_at <= m_end))
        inv = round2(
            sum(
                float(t.quantity) * float(t.price) + float(t.fees or 0)
                for t in txns
                if m_start <= t.occurred_at <= m_end
            )
        )
        has_data = inc > 0 or exp > 0
        effective = inc if inc > 0 else (planned if has_data else 0)
        months.append(
            {
                "month": m,
                "label": month_name(m)[:3],
                "income": effective,
                "expenses": exp,
                "savings": round2(effective - exp),
                "invested": inv,
                "has_data": has_data,
            }
        )

    by_category: dict[str, float] = {}
    for e in expenses:
        by_category[e.category] = round2(by_category.get(e.category, 0) + float(e.amount))

    total_income = round2(sum(m["income"] for m in months))
    total_expenses = round2(sum(m["expenses"] for m in months))
    active = [m for m in months if m["has_data"]]

    return {
        "year": year,
        "months": months,
        "totals": {
            "income": total_income,
            "expenses": total_expenses,
            "savings": round2(total_income - total_expenses),
            "invested": round2(sum(m["invested"] for m in months)),
            "savings_rate": pct(total_income - total_expenses, total_income),
        },
        "averages": {
            "income": round2(total_income / len(active)) if active else 0.0,
            "expenses": round2(total_expenses / len(active)) if active else 0.0,
            "savings": round2((total_income - total_expenses) / len(active)) if active else 0.0,
        },
        "by_category": sorted(
            (
                {"category": c, "amount": a, "share": pct(a, total_expenses)}
                for c, a in by_category.items()
            ),
            key=lambda x: -x["amount"],
        ),
        "best_month": max(active, key=lambda m: m["savings"], default=None),
        "worst_month": min(active, key=lambda m: m["savings"], default=None),
        "currency_symbol": ctx["currency_symbol"],
        "disclaimer": DISCLAIMER,
    }


@router.get("/summary")
def reports_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Everything the Reports page needs in one call."""
    ctx = build_financial_context(db, user)
    snapshots = list(
        db.scalars(
            select(FinancialSnapshot)
            .where(FinancialSnapshot.user_id == user.id)
            .order_by(FinancialSnapshot.taken_at.asc())
            .limit(120)
        )
    )
    return {
        "currency_symbol": ctx["currency_symbol"],
        "income_vs_expense": ctx["history"],
        "savings_trend": [
            {"label": h["label"], "savings": h["savings"], "rate": pct(h["savings"], h["income"])}
            for h in ctx["history"]
        ],
        "category_spending": ctx["spend"]["by_category"],
        "net_worth_series": [
            {
                "label": s.taken_at.strftime("%d %b"),
                "date": s.taken_at.strftime("%Y-%m-%d"),
                "net_worth": round2(s.net_worth),
                "assets": round2(s.total_assets),
                "liabilities": round2(s.total_liabilities),
            }
            for s in snapshots
        ],
        "current_net_worth": ctx["net_worth"],
        "portfolio": {
            "invested": ctx["portfolio"]["total_invested"],
            "current_value": ctx["portfolio"]["current_value"],
            "profit_loss": ctx["portfolio"]["profit_loss"],
            "profit_loss_pct": ctx["portfolio"]["profit_loss_pct"],
            "allocation": ctx["portfolio"]["allocation"],
            "has_live_prices": ctx["portfolio"]["has_live_prices"],
        },
        "health_score": ctx["health_score"],
        "disclaimer": DISCLAIMER,
    }


# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------

def _csv_response(content: str, filename: str) -> Response:
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/expenses.csv")
def export_expenses(
    month: Optional[int] = Query(default=None, ge=1, le=12),
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    csv_text = expenses_to_csv(db, user, month, year)
    suffix = f"-{year}-{month:02d}" if month and year else ""
    return _csv_response(csv_text, f"finance-track-expenses{suffix}.csv")


@router.get("/export/monthly.csv")
def export_monthly(
    month: Optional[int] = Query(default=None, ge=1, le=12),
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    report = generate_monthly_report(db, user, month or now.month, year or now.year, persist=False)
    return _csv_response(
        report_to_csv(report), f"finance-track-report-{report['year']}-{report['month']:02d}.csv"
    )


@router.get("/export/net-worth.csv")
def export_net_worth(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    snapshots = list(
        db.scalars(
            select(FinancialSnapshot)
            .where(FinancialSnapshot.user_id == user.id)
            .order_by(FinancialSnapshot.taken_at.asc())
        )
    )
    return _csv_response(net_worth_to_csv(snapshots), "finance-track-net-worth.csv")
