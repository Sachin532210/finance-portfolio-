from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, owned_or_404
from app.db.session import get_db
from app.models.goals import SavingsContribution, SavingsGoal
from app.models.user import FinancialProfile, User
from app.schemas.common import DeletedResponse
from app.schemas.finance import (
    ContributionCreate,
    SavingsGoalCreate,
    SavingsGoalOut,
    SavingsGoalUpdate,
)
from app.services.finance.context import build_financial_context
from app.services.finance.helpers import money_str, round2
from app.services.finance.projections import (
    build_goal_progress,
    months_to_reach,
    projected_completion_date,
)

router = APIRouter(prefix="/savings", tags=["savings"])


@router.get("/goals")
def list_goals(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ctx = build_financial_context(db, user)
    rows = list(
        db.scalars(
            select(SavingsGoal)
            .where(SavingsGoal.user_id == user.id, SavingsGoal.archived.is_(False))
            .order_by(SavingsGoal.priority.asc(), SavingsGoal.created_at.desc())
        )
    )

    goals = []
    for g in rows:
        progress = build_goal_progress(
            id=g.id,
            name=g.name,
            target_amount=float(g.target_amount),
            current_amount=float(g.current_amount),
            target_date=g.target_date,
            monthly_contribution=float(g.monthly_contribution),
            category=g.category,
        )
        progress.update(
            {
                "is_emergency_fund": g.is_emergency_fund,
                "priority": g.priority,
                "is_demo": g.is_demo,
                "projected_completion": projected_completion_date(
                    float(g.target_amount), float(g.current_amount), float(g.monthly_contribution)
                ),
                "months_at_current_pace": months_to_reach(
                    float(g.target_amount), float(g.current_amount), float(g.monthly_contribution)
                ),
            }
        )
        goals.append(progress)

    total_target = round2(sum(g["target_amount"] for g in goals))
    total_saved = round2(sum(g["current_amount"] for g in goals))

    return {
        "goals": goals,
        "totals": {
            "target": total_target,
            "saved": total_saved,
            "remaining": round2(total_target - total_saved),
            "progress_pct": round2(total_saved / total_target * 100) if total_target else 0.0,
            "monthly_committed": round2(sum(g["planned_monthly"] for g in goals)),
            "monthly_required": round2(sum(g["required_monthly"] for g in goals)),
        },
        "emergency": ctx["emergency"],
        "currency_symbol": ctx["currency_symbol"],
        "monthly_capacity": max(ctx["disposable_this_month"], 0),
    }


@router.post("/goals", response_model=SavingsGoalOut, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: SavingsGoalCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    data = payload.model_dump()
    if data.get("category") == "EMERGENCY":
        data["is_emergency_fund"] = True
    goal = SavingsGoal(user_id=user.id, **data)
    db.add(goal)
    db.commit()
    db.refresh(goal)
    _sync_emergency_profile(db, user)
    return SavingsGoalOut.model_validate(goal)


@router.patch("/goals/{goal_id}", response_model=SavingsGoalOut)
def update_goal(
    goal_id: str,
    payload: SavingsGoalUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    goal = owned_or_404(db.get(SavingsGoal, goal_id), user, "Savings goal")
    for key, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(goal, key, value)
    db.commit()
    db.refresh(goal)
    _sync_emergency_profile(db, user)
    return SavingsGoalOut.model_validate(goal)


@router.delete("/goals/{goal_id}", response_model=DeletedResponse)
def delete_goal(goal_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    goal = owned_or_404(db.get(SavingsGoal, goal_id), user, "Savings goal")
    db.delete(goal)
    db.commit()
    _sync_emergency_profile(db, user)
    return DeletedResponse(id=goal_id)


@router.post("/goals/{goal_id}/contribute")
def contribute(
    goal_id: str,
    payload: ContributionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Adds money to a goal and records the contribution for history."""
    goal = owned_or_404(db.get(SavingsGoal, goal_id), user, "Savings goal")

    contribution = SavingsContribution(
        goal_id=goal.id,
        user_id=user.id,
        amount=payload.amount,
        note=payload.note,
        occurred_at=payload.occurred_at or datetime.utcnow(),
    )
    db.add(contribution)
    goal.current_amount = round2(float(goal.current_amount) + payload.amount)
    db.commit()
    db.refresh(goal)
    _sync_emergency_profile(db, user)

    progress = build_goal_progress(
        id=goal.id,
        name=goal.name,
        target_amount=float(goal.target_amount),
        current_amount=float(goal.current_amount),
        target_date=goal.target_date,
        monthly_contribution=float(goal.monthly_contribution),
        category=goal.category,
    )
    return {
        "message": f"Added to {goal.name}.",
        "goal": progress,
        "reached": float(goal.current_amount) >= float(goal.target_amount),
    }


@router.post("/goals/{goal_id}/withdraw")
def withdraw(
    goal_id: str,
    payload: ContributionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    goal = owned_or_404(db.get(SavingsGoal, goal_id), user, "Savings goal")
    if payload.amount > float(goal.current_amount):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You only have {round2(goal.current_amount)} saved in this goal.",
        )
    db.add(
        SavingsContribution(
            goal_id=goal.id,
            user_id=user.id,
            amount=-payload.amount,
            note=payload.note or "Withdrawal",
            occurred_at=payload.occurred_at or datetime.utcnow(),
        )
    )
    goal.current_amount = round2(float(goal.current_amount) - payload.amount)
    db.commit()
    _sync_emergency_profile(db, user)
    return {"message": f"Withdrew from {goal.name}.", "current_amount": round2(goal.current_amount)}


@router.get("/goals/{goal_id}/contributions")
def contributions(
    goal_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    goal = owned_or_404(db.get(SavingsGoal, goal_id), user, "Savings goal")
    rows = db.scalars(
        select(SavingsContribution)
        .where(SavingsContribution.goal_id == goal.id)
        .order_by(SavingsContribution.occurred_at.desc())
        .limit(100)
    )
    return [
        {
            "id": c.id,
            "amount": round2(c.amount),
            "note": c.note,
            "occurred_at": c.occurred_at,
        }
        for c in rows
    ]


@router.get("/emergency-fund")
def emergency_fund(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Sizes the emergency fund from actual essential spending plus EMIs, and
    shows progress against the 3-month floor and the user's own target.
    """
    ctx = build_financial_context(db, user)
    em = ctx["emergency"]
    sym = ctx["currency_symbol"]
    fmt = lambda n: money_str(n, sym)  # noqa: E731

    goals = list(
        db.scalars(
            select(SavingsGoal).where(
                SavingsGoal.user_id == user.id,
                SavingsGoal.is_emergency_fund.is_(True),
                SavingsGoal.archived.is_(False),
            )
        )
    )

    monthly_fill = round2(em["shortfall"] / 12) if em["shortfall"] > 0 else 0.0
    if em["monthly_essentials"] <= 0:
        explanation = (
            "Add your fixed monthly expenses (rent, bills, groceries) and mark them as fixed, and "
            "this will size your emergency fund from real numbers."
        )
    elif em["shortfall"] <= 0:
        explanation = (
            f"You hold {fmt(em['current'])}, covering {em['months_covered']:.1f} months of "
            f"{fmt(em['monthly_essentials'])} in essentials. You are at target - surplus cash can go "
            "to goals or investments instead."
        )
    else:
        explanation = (
            f"Your essential monthly outgo is {fmt(em['monthly_essentials'])} (fixed expenses plus "
            f"EMIs). Three months would be {fmt(em['min_recommended'])} and six months "
            f"{fmt(em['max_recommended'])}. You hold {fmt(em['current'])}, so you are "
            f"{fmt(em['shortfall'])} short of your {em['target_months']}-month target. Setting aside "
            f"{fmt(monthly_fill)} a month closes it within a year."
        )

    return {
        **em,
        "currency_symbol": sym,
        "explanation": explanation,
        "suggested_monthly": monthly_fill,
        "linked_goals": [
            {
                "id": g.id,
                "name": g.name,
                "current_amount": round2(g.current_amount),
                "target_amount": round2(g.target_amount),
            }
            for g in goals
        ],
        "status": (
            "COMPLETE"
            if em["months_covered"] >= em["target_months"]
            else "ON_TRACK"
            if em["months_covered"] >= 3
            else "BEHIND"
            if em["months_covered"] >= 1
            else "CRITICAL"
        ),
    }


def _sync_emergency_profile(db: Session, user: User) -> None:
    """
    Keeps the profile's emergency-fund figure in step with the emergency goals,
    so the dashboard and the savings page can never disagree.
    """
    total = round2(
        sum(
            float(g.current_amount)
            for g in db.scalars(
                select(SavingsGoal).where(
                    SavingsGoal.user_id == user.id,
                    SavingsGoal.is_emergency_fund.is_(True),
                    SavingsGoal.archived.is_(False),
                )
            )
        )
    )
    profile = db.scalar(select(FinancialProfile).where(FinancialProfile.user_id == user.id))
    if profile and total > 0:
        profile.emergency_fund = total
        db.commit()
