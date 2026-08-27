from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import DISCLAIMER
from app.core.deps import get_current_user, owned_or_404
from app.db.session import get_db
from app.models.goals import FinancialGoal, FuturePlan
from app.models.user import User
from app.schemas.common import DeletedResponse
from app.schemas.finance import (
    FinancialGoalCreate,
    FinancialGoalUpdate,
    FuturePlanCreate,
    FuturePlanUpdate,
)
from app.services.finance.context import build_financial_context
from app.services.finance.helpers import money_str, round2
from app.services.finance.projections import (
    build_goal_progress,
    months_to_reach,
    project_future_plan,
    projected_completion_date,
)

router = APIRouter(tags=["goals"])


# ---------------------------------------------------------------------------
# Financial goals (short / medium / long term)
# ---------------------------------------------------------------------------

@router.get("/goals")
def list_goals(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ctx = build_financial_context(db, user)
    rows = list(
        db.scalars(
            select(FinancialGoal)
            .where(FinancialGoal.user_id == user.id)
            .order_by(FinancialGoal.priority.asc(), FinancialGoal.target_date.asc())
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
            horizon=g.horizon,
        )
        progress.update(
            {
                "description": g.description,
                "priority": g.priority,
                "completed": g.completed,
                "is_demo": g.is_demo,
                "projected_completion": projected_completion_date(
                    float(g.target_amount), float(g.current_amount), float(g.monthly_contribution)
                ),
                "months_at_current_pace": months_to_reach(
                    float(g.target_amount), float(g.current_amount), float(g.monthly_contribution)
                ),
                "required_savings_rate": round2(
                    progress["required_monthly"] / ctx["income"]["monthly"] * 100
                )
                if ctx["income"]["monthly"] > 0
                else 0.0,
            }
        )
        goals.append(progress)

    by_horizon = {
        h: [g for g in goals if g["horizon"] == h] for h in ("SHORT", "MEDIUM", "LONG")
    }

    return {
        "goals": goals,
        "by_horizon": by_horizon,
        "summary": {
            "total": len(goals),
            "on_track": sum(1 for g in goals if g["status"] == "ON_TRACK"),
            "slightly_behind": sum(1 for g in goals if g["status"] == "SLIGHTLY_BEHIND"),
            "behind": sum(1 for g in goals if g["status"] == "BEHIND"),
            "complete": sum(1 for g in goals if g["status"] == "COMPLETE"),
            "total_target": round2(sum(g["target_amount"] for g in goals)),
            "total_saved": round2(sum(g["current_amount"] for g in goals)),
            "monthly_committed": round2(sum(g["planned_monthly"] for g in goals)),
            "monthly_required": round2(sum(g["required_monthly"] for g in goals)),
        },
        "monthly_capacity": max(ctx["disposable_this_month"], 0),
        "currency_symbol": ctx["currency_symbol"],
    }


@router.post("/goals", status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: FinancialGoalCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    goal = FinancialGoal(user_id=user.id, **payload.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return build_goal_progress(
        id=goal.id,
        name=goal.name,
        target_amount=float(goal.target_amount),
        current_amount=float(goal.current_amount),
        target_date=goal.target_date,
        monthly_contribution=float(goal.monthly_contribution),
        horizon=goal.horizon,
    )


@router.patch("/goals/{goal_id}")
def update_goal(
    goal_id: str,
    payload: FinancialGoalUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    goal = owned_or_404(db.get(FinancialGoal, goal_id), user, "Goal")
    for key, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(goal, key, value)
    db.commit()
    db.refresh(goal)
    return build_goal_progress(
        id=goal.id,
        name=goal.name,
        target_amount=float(goal.target_amount),
        current_amount=float(goal.current_amount),
        target_date=goal.target_date,
        monthly_contribution=float(goal.monthly_contribution),
        horizon=goal.horizon,
    )


@router.delete("/goals/{goal_id}", response_model=DeletedResponse)
def delete_goal(goal_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    goal = owned_or_404(db.get(FinancialGoal, goal_id), user, "Goal")
    db.delete(goal)
    db.commit()
    return DeletedResponse(id=goal_id)


# ---------------------------------------------------------------------------
# Future planner (inflation-adjusted)
# ---------------------------------------------------------------------------

@router.get("/future-plans")
def list_future_plans(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ctx = build_financial_context(db, user)
    sym = ctx["currency_symbol"]
    fmt = lambda n: money_str(n, sym)  # noqa: E731

    rows = list(
        db.scalars(
            select(FuturePlan)
            .where(FuturePlan.user_id == user.id)
            .order_by(FuturePlan.years_away.asc())
        )
    )

    plans = []
    for p in rows:
        projection = project_future_plan(
            current_cost=float(p.current_cost),
            years_away=float(p.years_away),
            inflation_pct=float(p.inflation_pct),
            expected_return_pct=float(p.expected_return_pct),
            already_saved=float(p.already_saved),
        )
        affordable = (
            projection["required_monthly_with_returns"] <= max(ctx["disposable_this_month"], 0)
        )
        plans.append(
            {
                "id": p.id,
                "name": p.name,
                "category": p.category,
                "notes": p.notes,
                "is_demo": p.is_demo,
                **projection,
                "affordable_now": affordable,
                "explanation": (
                    f"{p.name} costs {fmt(projection['current_cost'])} today. At "
                    f"{projection['inflation_pct']:.1f}% inflation it is estimated to cost "
                    f"{fmt(projection['future_cost'])} in {projection['years_away']:.1f} years - "
                    f"{fmt(projection['inflation_impact'])} more. Saving "
                    f"{fmt(projection['required_monthly_flat'])} a month with no growth gets you "
                    f"there; at your assumed {projection['expected_return_pct']:.1f}% return, "
                    f"{fmt(projection['required_monthly_with_returns'])} a month is estimated to be "
                    "enough. Both figures are estimates, not guarantees."
                ),
            }
        )

    return {
        "plans": plans,
        "totals": {
            "current_cost": round2(sum(p["current_cost"] for p in plans)),
            "future_cost": round2(sum(p["future_cost"] for p in plans)),
            "required_monthly": round2(sum(p["required_monthly_with_returns"] for p in plans)),
            "already_saved": round2(sum(p["already_saved"] for p in plans)),
        },
        "monthly_capacity": max(ctx["disposable_this_month"], 0),
        "default_inflation": ctx["profile"]["inflation_assumption"],
        "default_return": ctx["profile"]["investment_return_pct"],
        "currency_symbol": sym,
        "disclaimer": DISCLAIMER,
    }


@router.post("/future-plans", status_code=status.HTTP_201_CREATED)
def create_future_plan(
    payload: FuturePlanCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    plan = FuturePlan(user_id=user.id, **payload.model_dump())
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return {
        "id": plan.id,
        "name": plan.name,
        "category": plan.category,
        **project_future_plan(
            current_cost=float(plan.current_cost),
            years_away=float(plan.years_away),
            inflation_pct=float(plan.inflation_pct),
            expected_return_pct=float(plan.expected_return_pct),
            already_saved=float(plan.already_saved),
        ),
    }


@router.patch("/future-plans/{plan_id}")
def update_future_plan(
    plan_id: str,
    payload: FuturePlanUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    plan = owned_or_404(db.get(FuturePlan, plan_id), user, "Future plan")
    for key, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(plan, key, value)
    db.commit()
    db.refresh(plan)
    return {
        "id": plan.id,
        "name": plan.name,
        "category": plan.category,
        **project_future_plan(
            current_cost=float(plan.current_cost),
            years_away=float(plan.years_away),
            inflation_pct=float(plan.inflation_pct),
            expected_return_pct=float(plan.expected_return_pct),
            already_saved=float(plan.already_saved),
        ),
    }


@router.delete("/future-plans/{plan_id}", response_model=DeletedResponse)
def delete_future_plan(
    plan_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    plan = owned_or_404(db.get(FuturePlan, plan_id), user, "Future plan")
    db.delete(plan)
    db.commit()
    return DeletedResponse(id=plan_id)


@router.post("/future-plans/simulate")
def simulate_future_plan(
    payload: FuturePlanCreate, user: User = Depends(get_current_user)
):
    """Projects a plan without saving it - used by the 'what if' calculator."""
    return project_future_plan(
        current_cost=payload.current_cost,
        years_away=payload.years_away,
        inflation_pct=payload.inflation_pct,
        expected_return_pct=payload.expected_return_pct,
        already_saved=payload.already_saved,
    )
