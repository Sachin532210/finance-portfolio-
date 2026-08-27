from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.debt import Debt
from app.models.finance import Expense
from app.models.goals import SavingsGoal
from app.models.user import FinancialProfile, User
from app.schemas.auth import UserOut
from app.schemas.common import MessageResponse
from app.schemas.finance import (
    FinancialProfileOut,
    FinancialProfileUpdate,
    OnboardingRequest,
)
from app.services.finance.helpers import round2

router = APIRouter(prefix="/profile", tags=["profile"])


def _get_or_create(db: Session, user: User) -> FinancialProfile:
    profile = db.scalar(select(FinancialProfile).where(FinancialProfile.user_id == user.id))
    if not profile:
        profile = FinancialProfile(user_id=user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.get("", response_model=FinancialProfileOut)
def get_profile(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return FinancialProfileOut.model_validate(_get_or_create(db, user))


@router.patch("", response_model=FinancialProfileOut)
def update_profile(
    payload: FinancialProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    profile = _get_or_create(db, user)
    for key, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(profile, key, value)
    db.commit()
    db.refresh(profile)
    return FinancialProfileOut.model_validate(profile)


@router.post("/onboarding")
def complete_onboarding(
    payload: OnboardingRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Saves the initial financial profile.

    Every field is optional - a user who only knows their salary can skip the
    rest and fill it in later from Settings.
    """
    profile = _get_or_create(db, user)

    for field in (
        "monthly_salary",
        "salary_day",
        "other_monthly_income",
        "expected_growth_pct",
        "employment_type",
        "bank_balance",
        "cash_balance",
        "existing_savings",
        "emergency_fund",
        "other_assets",
        "emergency_fund_months",
        "target_savings_rate",
        "inflation_assumption",
        "investment_return_pct",
        "risk_tolerance",
    ):
        setattr(profile, field, getattr(payload, field))

    # Fixed expenses become recurring expense records dated to this month, so
    # the dashboard has real data to work with from day one.
    now = datetime.utcnow()
    created_expenses = 0
    for item in payload.fixed_expenses:
        if item.amount <= 0:
            continue
        db.add(
            Expense(
                user_id=user.id,
                amount=item.amount,
                category=item.category,
                description=item.description,
                payment_method="BANK_TRANSFER",
                spent_at=datetime(now.year, now.month, min(now.day, 28)),
                is_fixed=True,
                is_recurring=True,
            )
        )
        created_expenses += 1

    created_debts = 0
    for d in payload.debts:
        if d.outstanding <= 0:
            continue
        db.add(Debt(user_id=user.id, **d.model_dump()))
        created_debts += 1

    # An emergency fund figure becomes a real, trackable goal.
    if payload.emergency_fund > 0 or payload.emergency_fund_months:
        existing = db.scalar(
            select(SavingsGoal).where(
                SavingsGoal.user_id == user.id, SavingsGoal.is_emergency_fund.is_(True)
            )
        )
        if not existing:
            essentials = round2(sum(f.amount for f in payload.fixed_expenses))
            target = round2(max(essentials, payload.monthly_salary * 0.5) * payload.emergency_fund_months)
            db.add(
                SavingsGoal(
                    user_id=user.id,
                    name="Emergency Fund",
                    category="EMERGENCY",
                    target_amount=max(target, payload.emergency_fund, 1),
                    current_amount=payload.emergency_fund,
                    is_emergency_fund=True,
                    priority=1,
                )
            )

    user.onboarded = True
    db.commit()

    return {
        "message": "Profile saved.",
        "created_expenses": created_expenses,
        "created_debts": created_debts,
        "onboarded": True,
    }


@router.post("/skip-onboarding", response_model=UserOut)
def skip_onboarding(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Lets the user into the app immediately; the profile can be filled later."""
    _get_or_create(db, user)
    user.onboarded = True
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/all-data", response_model=MessageResponse)
def delete_all_data(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Wipes every financial record for this account, keeping the login.

    Irreversible - the UI confirms before calling it.
    """
    from app.models.ai import AIConversation
    from app.models.finance import Budget, Income, SalaryAllocation
    from app.models.goals import FinancialGoal, FuturePlan, SavingsContribution
    from app.models.insights import (
        FinancialSnapshot,
        MonthlyReport,
        Notification,
        PurchaseDecision,
    )
    from app.models.investments import Investment, InvestmentTransaction

    for model in (
        SavingsContribution,
        InvestmentTransaction,
        Investment,
        Expense,
        Income,
        Budget,
        SalaryAllocation,
        SavingsGoal,
        FinancialGoal,
        FuturePlan,
        Debt,
        Notification,
        MonthlyReport,
        FinancialSnapshot,
        PurchaseDecision,
        AIConversation,
    ):
        db.query(model).filter(model.user_id == user.id).delete(synchronize_session=False)

    profile = db.scalar(select(FinancialProfile).where(FinancialProfile.user_id == user.id))
    if profile:
        db.delete(profile)

    user.onboarded = False
    user.has_demo_data = False
    db.commit()

    return MessageResponse(
        message="All financial data deleted. Your account and login are unchanged."
    )
