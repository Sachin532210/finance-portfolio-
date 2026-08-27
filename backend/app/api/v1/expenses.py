from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.constants import EXPENSE_CATEGORIES
from app.core.deps import get_current_user, owned_or_404
from app.db.session import get_db
from app.models.finance import Expense, Income
from app.models.user import User
from app.schemas.common import DeletedResponse, Page
from app.schemas.finance import (
    ExpenseCreate,
    ExpenseOut,
    ExpenseUpdate,
    IncomeCreate,
    IncomeOut,
)
from app.services.finance.helpers import month_range, pct, round2, start_of_week

router = APIRouter(tags=["expenses"])


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------

@router.get("/expenses", response_model=Page[ExpenseOut])
def list_expenses(
    month: Optional[int] = Query(default=None, ge=1, le=12),
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    category: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None, max_length=100),
    payment_method: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Expense).where(Expense.user_id == user.id)

    if month and year:
        start, end = month_range(year, month)
        query = query.where(Expense.spent_at >= start, Expense.spent_at <= end)
    if category and category.upper() in EXPENSE_CATEGORIES:
        query = query.where(Expense.category == category.upper())
    if payment_method:
        query = query.where(Expense.payment_method == payment_method.upper())
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(Expense.description.like(pattern))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = list(
        db.scalars(
            query.order_by(Expense.spent_at.desc(), Expense.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )

    return Page[ExpenseOut](
        items=[ExpenseOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, -(-total // page_size)),
    )


@router.post("/expenses", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(
    payload: ExpenseCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    expense = Expense(user_id=user.id, **payload.model_dump())
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return ExpenseOut.model_validate(expense)


@router.get("/expenses/{expense_id}", response_model=ExpenseOut)
def get_expense(expense_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    expense = owned_or_404(db.get(Expense, expense_id), user, "Expense")
    return ExpenseOut.model_validate(expense)


@router.patch("/expenses/{expense_id}", response_model=ExpenseOut)
def update_expense(
    expense_id: str,
    payload: ExpenseUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    expense = owned_or_404(db.get(Expense, expense_id), user, "Expense")
    for key, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(expense, key, value)
    db.commit()
    db.refresh(expense)
    return ExpenseOut.model_validate(expense)


@router.delete("/expenses/{expense_id}", response_model=DeletedResponse)
def delete_expense(
    expense_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    expense = owned_or_404(db.get(Expense, expense_id), user, "Expense")
    db.delete(expense)
    db.commit()
    return DeletedResponse(id=expense_id)


@router.get("/expenses-stats/summary")
def expense_stats(
    month: Optional[int] = Query(default=None, ge=1, le=12),
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Daily / weekly / monthly / category / average spend for one period."""
    now = datetime.utcnow()
    year = year or now.year
    month = month or now.month
    start, end = month_range(year, month)

    rows = list(
        db.scalars(
            select(Expense).where(
                Expense.user_id == user.id, Expense.spent_at >= start, Expense.spent_at <= end
            )
        )
    )

    total = round2(sum(float(e.amount) for e in rows))
    is_current = year == now.year and month == now.month
    days_elapsed = now.day if is_current else (end.day)
    today_start = datetime(now.year, now.month, now.day)
    week_start = start_of_week(now)

    by_category: dict[str, float] = {}
    by_method: dict[str, float] = {}
    by_day: dict[str, float] = {}
    for e in rows:
        amount = float(e.amount)
        by_category[e.category] = round2(by_category.get(e.category, 0) + amount)
        by_method[e.payment_method] = round2(by_method.get(e.payment_method, 0) + amount)
        key = e.spent_at.strftime("%Y-%m-%d")
        by_day[key] = round2(by_day.get(key, 0) + amount)

    daily_series = []
    for day in range(1, end.day + 1):
        key = f"{year}-{month:02d}-{day:02d}"
        daily_series.append({"date": key, "day": day, "amount": by_day.get(key, 0.0)})

    return {
        "month": month,
        "year": year,
        "total": total,
        "today": round2(sum(float(e.amount) for e in rows if e.spent_at >= today_start)),
        "week_to_date": round2(sum(float(e.amount) for e in rows if e.spent_at >= week_start)),
        "month_to_date": total,
        "daily_average": round2(total / max(days_elapsed, 1)),
        "transaction_count": len(rows),
        "average_transaction": round2(total / len(rows)) if rows else 0.0,
        "largest": max(
            (
                {
                    "description": e.description,
                    "amount": round2(e.amount),
                    "category": e.category,
                    "date": e.spent_at,
                }
                for e in rows
            ),
            key=lambda x: x["amount"],
            default=None,
        ),
        "by_category": sorted(
            (
                {"category": c, "amount": a, "share": pct(a, total)}
                for c, a in by_category.items()
            ),
            key=lambda x: -x["amount"],
        ),
        "by_payment_method": sorted(
            ({"method": m, "amount": a, "share": pct(a, total)} for m, a in by_method.items()),
            key=lambda x: -x["amount"],
        ),
        "daily_series": daily_series,
    }


# ---------------------------------------------------------------------------
# Income
# ---------------------------------------------------------------------------

@router.get("/incomes", response_model=List[IncomeOut])
def list_incomes(
    month: Optional[int] = Query(default=None, ge=1, le=12),
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Income).where(Income.user_id == user.id)
    if month and year:
        start, end = month_range(year, month)
        query = query.where(Income.received_at >= start, Income.received_at <= end)
    rows = db.scalars(query.order_by(Income.received_at.desc()))
    return [IncomeOut.model_validate(r) for r in rows]


@router.post("/incomes", response_model=IncomeOut, status_code=status.HTTP_201_CREATED)
def create_income(
    payload: IncomeCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    income = Income(user_id=user.id, **payload.model_dump())
    db.add(income)
    db.commit()
    db.refresh(income)
    return IncomeOut.model_validate(income)


@router.delete("/incomes/{income_id}", response_model=DeletedResponse)
def delete_income(
    income_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    income = owned_or_404(db.get(Income, income_id), user, "Income")
    db.delete(income)
    db.commit()
    return DeletedResponse(id=income_id)
