from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List

from app.services.finance.helpers import clamp, money_str, round2

RISK_INVEST_SHARE = {
    "CONSERVATIVE": 0.25,
    "MODERATE": 0.40,
    "AGGRESSIVE": 0.55,
}


@dataclass
class AllocationInput:
    salary: float
    other_income: float
    essential_expenses: float      # committed, unavoidable monthly costs
    family_contribution: float     # money sent to family, shown separately
    emi_total: float               # every active EMI
    observed_lifestyle_spend: float  # typical discretionary spend recently
    emergency_fund_current: float
    emergency_fund_target: float
    goal_required_monthly: float   # required contributions across active goals
    target_savings_rate: float     # %
    risk_tolerance: str = "MODERATE"
    high_interest_debt: bool = False
    currency_symbol: str = ""


@dataclass
class Allocation:
    income: float = 0.0
    essentials: float = 0.0
    family: float = 0.0
    debt_payments: float = 0.0
    emergency: float = 0.0
    savings: float = 0.0
    investments: float = 0.0
    lifestyle: float = 0.0
    buffer: float = 0.0
    remaining: float = 0.0
    rationale: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "income": self.income,
            "essentials": self.essentials,
            "family": self.family,
            "debt_payments": self.debt_payments,
            "emergency": self.emergency,
            "savings": self.savings,
            "investments": self.investments,
            "lifestyle": self.lifestyle,
            "buffer": self.buffer,
            "remaining": self.remaining,
            "rationale": self.rationale,
            "warnings": self.warnings,
            "total_allocated": round2(
                self.essentials
                + self.family
                + self.debt_payments
                + self.emergency
                + self.savings
                + self.investments
                + self.lifestyle
                + self.buffer
            ),
            "savings_side_total": round2(self.emergency + self.savings + self.investments),
            "savings_rate": round2(
                ((self.emergency + self.savings + self.investments) / self.income * 100)
                if self.income > 0
                else 0
            ),
        }


def build_allocation(i: AllocationInput) -> Allocation:
    """
    Builds a personalised monthly plan.

    Deliberately NOT a fixed 50/30/20 split. Claims are settled in order:
      essentials -> family -> debt -> emergency top-up -> goals -> investments
      -> lifestyle -> buffer
    Each stage receives only what the previous stage left behind, so a user
    with heavy fixed costs gets a smaller but honest savings figure rather than
    a plan that does not add up.
    """
    sym = i.currency_symbol
    fmt = lambda n: money_str(n, sym)  # noqa: E731

    income = round2(i.salary + i.other_income)
    alloc = Allocation(income=income)

    if income <= 0:
        alloc.rationale.append("Add your monthly income to generate a plan.")
        return alloc

    # --- 1. Essentials -----------------------------------------------------
    alloc.essentials = round2(min(i.essential_expenses, income))
    pool = round2(income - alloc.essentials)
    alloc.rationale.append(
        f"Essentials of {fmt(alloc.essentials)} are committed first - that is "
        f"{alloc.essentials / income * 100:.0f}% of income."
    )
    if alloc.essentials / income > 0.6:
        alloc.warnings.append(
            f"Fixed essentials take {alloc.essentials / income * 100:.0f}% of your income. Above 60% "
            "leaves very little room to save; the fix is usually structural (rent, transport, "
            "subscriptions) rather than trimming daily spend."
        )

    # --- 2. Family ---------------------------------------------------------
    alloc.family = round2(min(i.family_contribution, pool))
    pool = round2(pool - alloc.family)
    if alloc.family > 0:
        alloc.rationale.append(f"{fmt(alloc.family)} is reserved for family contribution.")

    # --- 3. Debt EMIs ------------------------------------------------------
    alloc.debt_payments = round2(min(i.emi_total, pool))
    pool = round2(pool - alloc.debt_payments)
    if alloc.debt_payments > 0:
        alloc.rationale.append(
            f"{fmt(alloc.debt_payments)} covers your EMIs, which are non-negotiable."
        )
        if alloc.debt_payments < i.emi_total:
            alloc.warnings.append(
                "Your EMIs exceed what is left after essentials. That is a cash-flow shortfall - "
                "review the Debt page before anything else."
            )

    if pool <= 0:
        alloc.remaining = round2(pool)
        alloc.rationale.append(
            "Committed costs consume the entire income, so there is nothing left to allocate."
        )
        alloc.warnings.append(
            "Committed costs meet or exceed income. Reducing a fixed cost or adding income is the "
            "only route to savings here."
        )
        return alloc

    # --- 4. Emergency fund top-up ------------------------------------------
    emergency_gap = round2(max(0.0, i.emergency_fund_target - i.emergency_fund_current))
    if emergency_gap > 0:
        critical = i.emergency_fund_current < i.emergency_fund_target * 0.5
        cap = pool * (0.55 if critical else 0.40)
        alloc.emergency = round2(clamp(emergency_gap / 12, 0, cap))
        pool = round2(pool - alloc.emergency)
        if alloc.emergency > 0:
            months_to_close = math.ceil(emergency_gap / alloc.emergency)
            alloc.rationale.append(
                f"{fmt(alloc.emergency)} goes to the emergency fund - you are {fmt(emergency_gap)} "
                f"short of target, and this pace closes the gap in about {months_to_close} months."
            )
    else:
        alloc.rationale.append(
            "Your emergency fund is already at target, so nothing extra is allocated to it."
        )

    # --- 5. Goal-driven savings --------------------------------------------
    savings_cap = pool * 0.6
    alloc.savings = round2(clamp(i.goal_required_monthly, 0, savings_cap))
    pool = round2(pool - alloc.savings)
    if alloc.savings > 0:
        alloc.rationale.append(f"{fmt(alloc.savings)} funds your active savings goals.")
        if alloc.savings < i.goal_required_monthly:
            alloc.warnings.append(
                f"Your goals need {fmt(i.goal_required_monthly)} per month but only "
                f"{fmt(alloc.savings)} fits this month. Either extend a target date or reduce a "
                "target amount."
            )

    # --- 6. Investments ----------------------------------------------------
    emergency_ok = i.emergency_fund_current >= i.emergency_fund_target * 0.5
    if i.high_interest_debt:
        alloc.investments = 0.0
        alloc.rationale.append(
            "Investments are held at zero this month: you carry high-interest debt, and clearing "
            "it is a guaranteed return that no investment can promise."
        )
    elif not emergency_ok:
        alloc.investments = round2(pool * 0.15)
        pool = round2(pool - alloc.investments)
        alloc.rationale.append(
            "Investments stay small until the emergency fund is at least half funded - otherwise a "
            "surprise expense forces you to sell at a bad time."
        )
    else:
        share = RISK_INVEST_SHARE.get(i.risk_tolerance, RISK_INVEST_SHARE["MODERATE"])
        alloc.investments = round2(pool * share)
        pool = round2(pool - alloc.investments)
        alloc.rationale.append(
            f"{fmt(alloc.investments)} is allocated to investments, sized to your "
            f"{i.risk_tolerance.lower()} risk preference."
        )

    # --- 7. Lifestyle ------------------------------------------------------
    lifestyle_target = i.observed_lifestyle_spend if i.observed_lifestyle_spend > 0 else pool * 0.6
    alloc.lifestyle = round2(clamp(lifestyle_target, 0, pool * 0.85))
    pool = round2(pool - alloc.lifestyle)
    alloc.rationale.append(
        f"{fmt(alloc.lifestyle)} for lifestyle spending, based on what you actually spent in recent "
        "months rather than a generic percentage."
        if i.observed_lifestyle_spend > 0
        else f"{fmt(alloc.lifestyle)} is set aside for lifestyle spending."
    )

    # --- 8. Buffer ---------------------------------------------------------
    alloc.buffer = round2(max(0.0, pool))
    alloc.remaining = alloc.buffer
    alloc.rationale.append(
        f"{fmt(alloc.buffer)} stays unallocated as a monthly buffer for irregular costs."
        if alloc.buffer > 0
        else "Nothing is left as a buffer this month - consider trimming lifestyle spend so "
        "unexpected costs do not break the plan."
    )

    savings_side = round2(alloc.emergency + alloc.savings + alloc.investments)
    rate = savings_side / income * 100
    if rate < i.target_savings_rate:
        shortfall = round2((i.target_savings_rate / 100) * income - savings_side)
        alloc.warnings.append(
            f"This plan saves {rate:.1f}% of income, below your {i.target_savings_rate:.0f}% target. "
            f"The gap is {fmt(shortfall)} per month."
        )

    return alloc
