from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from app.services.finance.helpers import clamp, round2


@dataclass
class HealthScoreInput:
    monthly_income: float
    savings_rate: float          # %
    target_savings_rate: float   # %
    monthly_expenses: float
    budgets_set: int
    budgets_overspent: int
    emergency_months_covered: float
    emergency_target_months: int
    debt_to_income_ratio: float  # % of income going to EMIs
    monthly_invested: float
    months_with_investment: int  # out of the last 6
    goals_total: int
    goals_on_track: int


@dataclass
class ScoreComponent:
    key: str
    label: str
    score: float
    max: float
    detail: str


@dataclass
class HealthScore:
    score: int
    grade: str
    breakdown: List[ScoreComponent] = field(default_factory=list)
    strengths: List[str] = field(default_factory=list)
    weaknesses: List[str] = field(default_factory=list)
    summary: str = ""


WEIGHTS = {
    "savings_rate": 25,
    "expense_control": 20,
    "emergency_fund": 20,
    "debt": 15,
    "investing": 10,
    "goals": 10,
}


def _grade(score: int) -> str:
    if score >= 85:
        return "Excellent"
    if score >= 70:
        return "Good"
    if score >= 55:
        return "Fair"
    if score >= 40:
        return "Needs work"
    return "At risk"


def calculate_health_score(i: HealthScoreInput) -> HealthScore:
    """
    Weighted 0-100 score across six dimensions.

    Where a dimension is simply unmeasured (no budgets, no goals) it earns
    partial credit rather than a zero, so an incomplete profile is not
    mistaken for a bad one.
    """
    breakdown: List[ScoreComponent] = []
    strengths: List[str] = []
    weaknesses: List[str] = []

    # --- 1. Savings rate ---------------------------------------------------
    target = max(i.target_savings_rate, 10.0)
    savings_score = round2(clamp(i.savings_rate / target, 0, 1) * WEIGHTS["savings_rate"])
    breakdown.append(
        ScoreComponent(
            "savings_rate",
            "Savings rate",
            savings_score,
            WEIGHTS["savings_rate"],
            "No income recorded yet."
            if i.monthly_income <= 0
            else f"You are saving {i.savings_rate:.1f}% of income against a {target:.0f}% target.",
        )
    )
    if i.monthly_income > 0:
        if i.savings_rate >= target:
            strengths.append(
                f"Saving {i.savings_rate:.0f}% of income, at or above your {target:.0f}% target."
            )
        else:
            weaknesses.append(
                f"Savings rate is {i.savings_rate:.0f}%, below your {target:.0f}% target."
            )

    # --- 2. Expense control ------------------------------------------------
    expense_ratio = (i.monthly_expenses / i.monthly_income) if i.monthly_income > 0 else 1.0
    # 50% of income on expenses = full marks; 100% = zero.
    expense_score = clamp((1 - expense_ratio) / 0.5, 0, 1) * (WEIGHTS["expense_control"] * 0.7)
    budget_share = WEIGHTS["expense_control"] * 0.3
    if i.budgets_set == 0:
        expense_score += budget_share * 0.4  # unmeasured, not failing
    else:
        kept = (i.budgets_set - i.budgets_overspent) / i.budgets_set
        expense_score += budget_share * clamp(kept, 0, 1)
    expense_score = round2(expense_score)

    if i.monthly_income > 0:
        budget_note = (
            f"; {i.budgets_overspent} of {i.budgets_set} budgets exceeded."
            if i.budgets_set > 0
            else "; no category budgets set yet."
        )
        detail = f"Expenses are {expense_ratio * 100:.0f}% of income{budget_note}"
    else:
        detail = "Add income to measure expense control."
    breakdown.append(
        ScoreComponent("expense_control", "Expense control", expense_score, WEIGHTS["expense_control"], detail)
    )
    if i.monthly_income > 0 and expense_ratio <= 0.6:
        strengths.append(f"Expenses stay at {expense_ratio * 100:.0f}% of income.")
    if i.monthly_income > 0 and expense_ratio > 0.8:
        weaknesses.append(
            f"Expenses consume {expense_ratio * 100:.0f}% of income, leaving little room to save."
        )
    if i.budgets_overspent > 0:
        weaknesses.append(
            f"{i.budgets_overspent} budget{'s' if i.budgets_overspent > 1 else ''} exceeded this month."
        )

    # --- 3. Emergency fund -------------------------------------------------
    em_target = max(i.emergency_target_months, 3)
    em_score = round2(clamp(i.emergency_months_covered / em_target, 0, 1) * WEIGHTS["emergency_fund"])
    breakdown.append(
        ScoreComponent(
            "emergency_fund",
            "Emergency fund",
            em_score,
            WEIGHTS["emergency_fund"],
            f"Covers {i.emergency_months_covered:.1f} months of essentials (target {em_target} months).",
        )
    )
    if i.emergency_months_covered >= em_target:
        strengths.append(
            f"Emergency fund covers {i.emergency_months_covered:.1f} months of essentials."
        )
    elif i.emergency_months_covered < 3:
        weaknesses.append(
            f"Emergency fund covers only {i.emergency_months_covered:.1f} months - below the 3-month floor."
        )

    # --- 4. Debt level -----------------------------------------------------
    debt_score = round2(clamp(1 - i.debt_to_income_ratio / 40, 0, 1) * WEIGHTS["debt"])
    breakdown.append(
        ScoreComponent(
            "debt",
            "Debt level",
            debt_score,
            WEIGHTS["debt"],
            f"EMIs take {i.debt_to_income_ratio:.1f}% of monthly income (healthy is under 20%)."
            if i.debt_to_income_ratio > 0
            else "No active debt recorded.",
        )
    )
    if i.debt_to_income_ratio == 0:
        strengths.append("No active debt obligations.")
    elif i.debt_to_income_ratio > 36:
        weaknesses.append(
            f"Debt-to-income ratio is {i.debt_to_income_ratio:.0f}% - well above the 36% comfort line."
        )

    # --- 5. Investment consistency -----------------------------------------
    consistency = clamp(i.months_with_investment / 6, 0, 1)
    amount = clamp(i.monthly_invested / (i.monthly_income * 0.1), 0, 1) if i.monthly_income > 0 else 0
    invest_score = round2((consistency * 0.5 + amount * 0.5) * WEIGHTS["investing"])
    breakdown.append(
        ScoreComponent(
            "investing",
            "Investment consistency",
            invest_score,
            WEIGHTS["investing"],
            f"Invested in {i.months_with_investment} of the last 6 months.",
        )
    )
    if i.months_with_investment >= 5:
        strengths.append("Investment contributions have been consistent.")
    elif i.months_with_investment <= 1:
        weaknesses.append("Investment contributions are irregular or missing.")

    # --- 6. Goal progress --------------------------------------------------
    if i.goals_total == 0:
        goal_score = round2(WEIGHTS["goals"] * 0.4)
        goal_detail = "No financial goals set yet."
    else:
        goal_score = round2(clamp(i.goals_on_track / i.goals_total, 0, 1) * WEIGHTS["goals"])
        goal_detail = f"{i.goals_on_track} of {i.goals_total} goals are on track."
    breakdown.append(ScoreComponent("goals", "Goal progress", goal_score, WEIGHTS["goals"], goal_detail))
    if i.goals_total > 0 and i.goals_on_track == i.goals_total:
        strengths.append("Every goal is on track.")
    if i.goals_total > 0 and i.goals_on_track < i.goals_total:
        behind = i.goals_total - i.goals_on_track
        weaknesses.append(f"{behind} goal(s) are behind schedule.")

    total_score = int(round(clamp(sum(c.score for c in breakdown), 0, 100)))
    weakest = min(breakdown, key=lambda c: c.score / c.max)
    strongest = max(breakdown, key=lambda c: c.score / c.max)

    if total_score >= 70:
        summary = (
            f"Your finances are in {_grade(total_score).lower()} shape. {strongest.label} is your "
            f"strongest area, while {weakest.label.lower()} has the most room to improve."
        )
    else:
        summary = (
            f"Your score is held back mainly by {weakest.label.lower()}. {weakest.detail} "
            "Improving this one area would move the score the most."
        )

    return HealthScore(
        score=total_score,
        grade=_grade(total_score),
        breakdown=breakdown,
        strengths=strengths,
        weaknesses=weaknesses,
        summary=summary,
    )
