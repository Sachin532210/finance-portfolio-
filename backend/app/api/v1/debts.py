from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, owned_or_404
from app.db.session import get_db
from app.models.debt import Debt
from app.models.user import User
from app.schemas.common import DeletedResponse
from app.schemas.finance import DebtCreate, DebtOut, DebtUpdate
from app.services.finance.context import build_financial_context
from app.services.finance.debt_calc import (
    calculate_emi,
    extra_payment_impact,
    payoff_months,
    simulate_payoff,
)
from app.services.finance.helpers import money_str, round2

router = APIRouter(prefix="/debts", tags=["debts"])


@router.get("")
def list_debts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Debt dashboard: balances, EMIs, interest estimate and DTI."""
    ctx = build_financial_context(db, user)
    sym = ctx["currency_symbol"]
    fmt = lambda n: money_str(n, sym)  # noqa: E731
    debt = ctx["debt"]

    items = []
    for d in debt["items"]:
        months = payoff_months(d["outstanding"], d["emi"], d["interest_rate"])
        items.append(
            {
                **d,
                "payoff_months": months,
                "payoff_never": months is None and d["emi"] > 0,
                "progress_pct": round2(
                    (d["principal"] - d["outstanding"]) / d["principal"] * 100
                )
                if d["principal"] > 0
                else 0.0,
                "monthly_interest": round2(d["outstanding"] * d["interest_rate"] / 100 / 12),
            }
        )

    dti = debt["debt_to_income_ratio"]
    if dti == 0:
        health = "NONE"
        health_note = "You have no active debt recorded."
    elif dti < 20:
        health = "HEALTHY"
        health_note = f"EMIs take {dti:.1f}% of income, comfortably inside the 20% guideline."
    elif dti <= 36:
        health = "MANAGEABLE"
        health_note = (
            f"EMIs take {dti:.1f}% of income. That is manageable but leaves less room to save."
        )
    else:
        health = "STRESSED"
        health_note = (
            f"EMIs take {dti:.1f}% of income, above the 36% line widely treated as financial "
            "stress. Prioritise the highest-rate balance and avoid new borrowing."
        )

    return {
        "items": items,
        "summary": {
            "total_outstanding": debt["total_outstanding"],
            "total_principal": round2(sum(d["principal"] for d in items)),
            "monthly_emi": debt["monthly_emi"],
            "weighted_interest_rate": debt["weighted_interest_rate"],
            "debt_to_income_ratio": dti,
            "estimated_interest_remaining": debt["estimated_interest_remaining"],
            "monthly_income": ctx["income"]["monthly"],
            "health": health,
            "health_note": health_note,
            "has_high_interest": debt["has_high_interest"],
        },
        "currency_symbol": sym,
        "guidance": (
            f"You owe {fmt(debt['total_outstanding'])} in total with {fmt(debt['monthly_emi'])} "
            f"leaving your account each month. Estimated interest still to pay across every loan "
            f"is {fmt(debt['estimated_interest_remaining'])}."
            if debt["total_outstanding"] > 0
            else "No active debt. Keeping it that way is one of the strongest financial positions "
            "you can hold."
        ),
    }


@router.post("", response_model=DebtOut, status_code=status.HTTP_201_CREATED)
def create_debt(
    payload: DebtCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    data = payload.model_dump()
    # Derive the EMI when the user knows the rate and tenure but not the payment.
    if not data.get("emi") and data.get("remaining_months") and data.get("outstanding"):
        data["emi"] = calculate_emi(
            data["outstanding"], data["interest_rate"], data["remaining_months"]
        )
    debt = Debt(user_id=user.id, **data)
    db.add(debt)
    db.commit()
    db.refresh(debt)
    return DebtOut.model_validate(debt)


@router.patch("/{debt_id}", response_model=DebtOut)
def update_debt(
    debt_id: str,
    payload: DebtUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    debt = owned_or_404(db.get(Debt, debt_id), user, "Debt")
    for key, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(debt, key, value)
    if float(debt.outstanding) <= 0:
        debt.closed = True
    db.commit()
    db.refresh(debt)
    return DebtOut.model_validate(debt)


@router.delete("/{debt_id}", response_model=DeletedResponse)
def delete_debt(debt_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    debt = owned_or_404(db.get(Debt, debt_id), user, "Debt")
    db.delete(debt)
    db.commit()
    return DeletedResponse(id=debt_id)


@router.post("/{debt_id}/payment")
def record_payment(
    debt_id: str,
    amount: float = Query(gt=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Reduces the outstanding balance and closes the debt when it hits zero."""
    debt = owned_or_404(db.get(Debt, debt_id), user, "Debt")
    new_balance = round2(max(0.0, float(debt.outstanding) - amount))
    debt.outstanding = new_balance
    if new_balance <= 0:
        debt.closed = True
        debt.remaining_months = 0
    elif debt.remaining_months > 0:
        debt.remaining_months = max(0, debt.remaining_months - 1)
    db.commit()
    return {
        "message": "Payment recorded." if new_balance > 0 else f"{debt.name} is fully paid off.",
        "outstanding": new_balance,
        "closed": debt.closed,
    }


@router.get("/strategies")
def strategies(
    extra_payment: float = Query(default=0, ge=0, le=10_000_000),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Compares avalanche and snowball payoff orders against the user's actual
    balances, and shows what an extra monthly payment would save.

    Educational only - it never suggests borrowing more.
    """
    ctx = build_financial_context(db, user)
    sym = ctx["currency_symbol"]
    fmt = lambda n: money_str(n, sym)  # noqa: E731

    debts = [
        {
            "id": d["id"],
            "name": d["name"],
            "outstanding": d["outstanding"],
            "emi": d["emi"],
            "interest_rate": d["interest_rate"],
        }
        for d in ctx["debt"]["items"]
    ]

    if not debts:
        return {
            "has_debt": False,
            "message": "No active debt to plan for.",
            "avalanche": None,
            "snowball": None,
            "extra_payment_impact": None,
        }

    avalanche = simulate_payoff(debts, "AVALANCHE", extra_payment)
    snowball = simulate_payoff(debts, "SNOWBALL", extra_payment)
    impact = extra_payment_impact(debts, extra_payment) if extra_payment > 0 else None

    difference = round2(snowball["total_interest"] - avalanche["total_interest"])
    comparison = (
        f"Avalanche saves {fmt(difference)} in interest compared with snowball."
        if difference > 0
        else "Both orders cost about the same in interest here, so pick whichever you will stick to."
    )

    return {
        "has_debt": True,
        "avalanche": avalanche,
        "snowball": snowball,
        "comparison": comparison,
        "interest_difference": difference,
        "extra_payment": round2(extra_payment),
        "extra_payment_impact": impact,
        "spare_capacity": max(ctx["disposable_this_month"], 0),
        "currency_symbol": sym,
        "note": (
            "These are educational projections based on the balances, rates and EMIs you entered. "
            "They assume rates stay fixed and every payment is made on time."
        ),
    }


@router.get("/emi-calculator")
def emi_calculator(
    principal: float = Query(gt=0),
    interest_rate: float = Query(ge=0, le=100),
    months: int = Query(gt=0, le=600),
    user: User = Depends(get_current_user),
):
    emi = calculate_emi(principal, interest_rate, months)
    total_payable = round2(emi * months)
    return {
        "principal": round2(principal),
        "interest_rate": interest_rate,
        "months": months,
        "emi": emi,
        "total_payable": total_payable,
        "total_interest": round2(total_payable - principal),
        "interest_share_pct": round2((total_payable - principal) / total_payable * 100)
        if total_payable
        else 0.0,
    }
