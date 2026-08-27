from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.finance import SalaryAllocation
from app.models.user import User
from app.schemas.finance import AllocationOverride
from app.services.finance.allocation import AllocationInput, build_allocation
from app.services.finance.context import build_financial_context
from app.services.finance.helpers import round2

router = APIRouter(prefix="/salary-planner", tags=["salary-planner"])


def _allocation_input(ctx: dict, salary_override: Optional[float] = None) -> AllocationInput:
    family = next(
        (c["amount"] for c in ctx["spend"]["by_category"] if c["category"] == "FAMILY"), 0.0
    )
    goal_required = round2(
        sum(
            g["required_monthly"]
            for g in ctx["goals"] + ctx["savings"]["goals"]
            if g["status"] != "COMPLETE"
        )
    )
    salary = salary_override if salary_override is not None else ctx["profile"]["monthly_salary"]
    if not salary:
        salary = ctx["income"]["monthly"]

    # Essentials exclude the family bucket, which is allocated separately.
    essentials = max(ctx["spend"]["essentials"], ctx["fixed_monthly_expenses"]) - family
    return AllocationInput(
        salary=salary,
        other_income=ctx["profile"]["other_monthly_income"],
        essential_expenses=max(essentials, 0),
        family_contribution=family,
        emi_total=ctx["debt"]["monthly_emi"],
        observed_lifestyle_spend=ctx["spend"]["lifestyle"],
        emergency_fund_current=ctx["emergency"]["current"],
        emergency_fund_target=ctx["emergency"]["target"],
        goal_required_monthly=goal_required,
        target_savings_rate=ctx["profile"]["target_savings_rate"],
        risk_tolerance=ctx["profile"]["risk_tolerance"],
        high_interest_debt=ctx["debt"]["has_high_interest"],
        currency_symbol=ctx["currency_symbol"],
    )


@router.get("")
def get_plan(
    month: Optional[int] = Query(default=None, ge=1, le=12),
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    salary: Optional[float] = Query(default=None, ge=0, description="Preview a different salary"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Returns the generated plan for the month, and the saved plan if the user
    has edited one. The generated plan is never a fixed 50/30/20 split - it is
    derived from the user's real commitments.
    """
    ctx = build_financial_context(db, user, month=month, year=year)
    generated = build_allocation(_allocation_input(ctx, salary)).as_dict()

    saved = db.scalar(
        select(SalaryAllocation).where(
            SalaryAllocation.user_id == user.id,
            SalaryAllocation.month == ctx["month"],
            SalaryAllocation.year == ctx["year"],
        )
    )

    saved_dict = None
    if saved:
        saved_dict = {
            "salary": round2(saved.salary),
            "essentials": round2(saved.essentials),
            "lifestyle": round2(saved.lifestyle),
            "savings": round2(saved.savings),
            "investments": round2(saved.investments),
            "debt_payments": round2(saved.debt_payments),
            "family": round2(saved.family),
            "emergency": round2(saved.emergency),
            "buffer": round2(saved.buffer),
            "source": saved.source,
            "updated_at": saved.updated_at,
        }
        saved_dict["total_allocated"] = round2(
            sum(
                saved_dict[k]
                for k in (
                    "essentials",
                    "lifestyle",
                    "savings",
                    "investments",
                    "debt_payments",
                    "family",
                    "emergency",
                    "buffer",
                )
            )
        )
        saved_dict["unallocated"] = round2(saved_dict["salary"] - saved_dict["total_allocated"])

    return {
        "month": ctx["month"],
        "year": ctx["year"],
        "month_label": ctx["month_label"],
        "currency": ctx["currency"],
        "currency_symbol": ctx["currency_symbol"],
        "generated": generated,
        "saved": saved_dict,
        "context": {
            "monthly_income": ctx["income"]["monthly"],
            "salary": ctx["profile"]["monthly_salary"],
            "other_income": ctx["profile"]["other_monthly_income"],
            "salary_day": ctx["profile"]["salary_day"],
            "actual_spend": ctx["spend"]["month_to_date"],
            "essentials_spent": ctx["spend"]["essentials"],
            "lifestyle_spent": ctx["spend"]["lifestyle"],
            "emi_total": ctx["debt"]["monthly_emi"],
            "emergency_current": ctx["emergency"]["current"],
            "emergency_target": ctx["emergency"]["target"],
            "target_savings_rate": ctx["profile"]["target_savings_rate"],
            "risk_tolerance": ctx["profile"]["risk_tolerance"],
        },
    }


@router.put("")
def save_plan(
    payload: AllocationOverride,
    month: Optional[int] = Query(default=None, ge=1, le=12),
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Saves a manually adjusted plan. Any omitted bucket keeps the generated value."""
    ctx = build_financial_context(db, user, month=month, year=year)
    generated = build_allocation(_allocation_input(ctx)).as_dict()
    overrides = payload.model_dump(exclude_none=True)

    values = {
        "salary": overrides.get("salary", generated["income"]),
        "essentials": overrides.get("essentials", generated["essentials"]),
        "lifestyle": overrides.get("lifestyle", generated["lifestyle"]),
        "savings": overrides.get("savings", generated["savings"]),
        "investments": overrides.get("investments", generated["investments"]),
        "debt_payments": overrides.get("debt_payments", generated["debt_payments"]),
        "family": overrides.get("family", generated["family"]),
        "emergency": overrides.get("emergency", generated["emergency"]),
        "buffer": overrides.get("buffer", generated["buffer"]),
    }

    existing = db.scalar(
        select(SalaryAllocation).where(
            SalaryAllocation.user_id == user.id,
            SalaryAllocation.month == ctx["month"],
            SalaryAllocation.year == ctx["year"],
        )
    )
    if existing:
        for k, v in values.items():
            setattr(existing, k, v)
        existing.source = "MANUAL" if overrides else "RULE_BASED"
        existing.rationale = "\n".join(generated["rationale"])
        row = existing
    else:
        row = SalaryAllocation(
            user_id=user.id,
            month=ctx["month"],
            year=ctx["year"],
            source="MANUAL" if overrides else "RULE_BASED",
            rationale="\n".join(generated["rationale"]),
            **values,
        )
        db.add(row)
    db.commit()

    allocated = round2(sum(v for k, v in values.items() if k != "salary"))
    return {
        "message": "Plan saved.",
        "allocated": allocated,
        "salary": round2(values["salary"]),
        "unallocated": round2(values["salary"] - allocated),
        "over_allocated": allocated > values["salary"] + 0.01,
    }


@router.delete("")
def reset_plan(
    month: Optional[int] = Query(default=None, ge=1, le=12),
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Discards manual edits so the generated plan applies again."""
    ctx = build_financial_context(db, user, month=month, year=year)
    db.query(SalaryAllocation).filter(
        SalaryAllocation.user_id == user.id,
        SalaryAllocation.month == ctx["month"],
        SalaryAllocation.year == ctx["year"],
    ).delete()
    db.commit()
    return {"message": "Reverted to the generated plan."}
