from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import EXPENSE_CATEGORIES
from app.core.deps import get_current_user, owned_or_404
from app.db.session import get_db
from app.models.finance import Budget
from app.models.user import User
from app.schemas.common import DeletedResponse
from app.schemas.finance import BudgetUpsert
from app.services.finance.context import build_financial_context
from app.services.finance.helpers import previous_month, round2

router = APIRouter(prefix="/budgets", tags=["budgets"])


@router.get("")
def list_budgets(
    month: Optional[int] = Query(default=None, ge=1, le=12),
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Budgets with live spend attached, plus every category that has no budget
    yet so the UI can offer to create one.
    """
    ctx = build_financial_context(db, user, month=month, year=year)
    budgeted = {b["category"] for b in ctx["budgets"]}

    unbudgeted = [
        {"category": c["category"], "spent": c["amount"]}
        for c in ctx["spend"]["by_category"]
        if c["category"] not in budgeted
    ]
    available = [c for c in EXPENSE_CATEGORIES if c not in budgeted]

    total_budget = round2(sum(b["amount"] for b in ctx["budgets"]))
    total_spent = round2(sum(b["spent"] for b in ctx["budgets"]))

    return {
        "month": ctx["month"],
        "year": ctx["year"],
        "month_label": ctx["month_label"],
        "currency_symbol": ctx["currency_symbol"],
        "budgets": ctx["budgets"],
        "unbudgeted_spending": unbudgeted,
        "available_categories": available,
        "totals": {
            "budget": total_budget,
            "spent": total_spent,
            "remaining": round2(total_budget - total_spent),
            "used_pct": round2(total_spent / total_budget * 100) if total_budget else 0.0,
            "unbudgeted": round2(sum(u["spent"] for u in unbudgeted)),
        },
        "counts": {
            "safe": sum(1 for b in ctx["budgets"] if b["status"] == "SAFE"),
            "warning": sum(1 for b in ctx["budgets"] if b["status"] == "WARNING"),
            "over": sum(1 for b in ctx["budgets"] if b["status"] == "OVER"),
        },
        "days_left": ctx["spend"]["days_left"],
        "monthly_income": ctx["income"]["monthly"],
    }


@router.put("")
def upsert_budget(
    payload: BudgetUpsert, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Creates or updates one category budget for a period."""
    existing = db.scalar(
        select(Budget).where(
            Budget.user_id == user.id,
            Budget.category == payload.category,
            Budget.month == payload.month,
            Budget.year == payload.year,
        )
    )
    if existing:
        existing.amount = payload.amount
        db.commit()
        db.refresh(existing)
        budget = existing
    else:
        budget = Budget(user_id=user.id, **payload.model_dump())
        db.add(budget)
        db.commit()
        db.refresh(budget)

    return {
        "id": budget.id,
        "category": budget.category,
        "amount": round2(budget.amount),
        "month": budget.month,
        "year": budget.year,
    }


@router.post("/bulk")
def bulk_upsert(
    payloads: List[BudgetUpsert],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    saved = 0
    for payload in payloads[:30]:
        existing = db.scalar(
            select(Budget).where(
                Budget.user_id == user.id,
                Budget.category == payload.category,
                Budget.month == payload.month,
                Budget.year == payload.year,
            )
        )
        if existing:
            existing.amount = payload.amount
        else:
            db.add(Budget(user_id=user.id, **payload.model_dump()))
        saved += 1
    db.commit()
    return {"saved": saved}


@router.post("/copy-previous")
def copy_previous_month(
    month: int = Query(ge=1, le=12),
    year: int = Query(ge=2000, le=2100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Copies last month's budgets forward - the common case each month."""
    prev_year, prev_month = previous_month(year, month)
    previous = list(
        db.scalars(
            select(Budget).where(
                Budget.user_id == user.id, Budget.month == prev_month, Budget.year == prev_year
            )
        )
    )
    if not previous:
        return {"copied": 0, "message": "No budgets found for the previous month."}

    existing = {
        b.category
        for b in db.scalars(
            select(Budget).where(Budget.user_id == user.id, Budget.month == month, Budget.year == year)
        )
    }
    copied = 0
    for b in previous:
        if b.category in existing:
            continue
        db.add(Budget(user_id=user.id, category=b.category, amount=b.amount, month=month, year=year))
        copied += 1
    db.commit()
    return {"copied": copied, "message": f"Copied {copied} budget(s) from the previous month."}


@router.delete("/{budget_id}", response_model=DeletedResponse)
def delete_budget(
    budget_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    budget = owned_or_404(db.get(Budget, budget_id), user, "Budget")
    db.delete(budget)
    db.commit()
    return DeletedResponse(id=budget_id)
