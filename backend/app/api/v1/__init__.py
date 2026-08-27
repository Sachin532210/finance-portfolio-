from fastapi import APIRouter

from app.api.v1 import (
    ai,
    auth,
    budgets,
    dashboard,
    debts,
    decisions,
    demo,
    expenses,
    goals,
    investments,
    notifications,
    planner,
    profile,
    reports,
    savings,
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(profile.router)
api_router.include_router(dashboard.router)
api_router.include_router(expenses.router)
api_router.include_router(budgets.router)
api_router.include_router(planner.router)
api_router.include_router(savings.router)
api_router.include_router(goals.router)
api_router.include_router(investments.router)
api_router.include_router(debts.router)
api_router.include_router(decisions.router)
api_router.include_router(ai.router)
api_router.include_router(notifications.router)
api_router.include_router(reports.router)
api_router.include_router(demo.router)

__all__ = ["api_router"]
