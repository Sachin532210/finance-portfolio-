from __future__ import annotations

from datetime import datetime
from typing import Iterable, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import (
    ESSENTIAL_CATEGORIES,
    FOOD_ESSENTIAL_SHARE,
    LIFESTYLE_CATEGORIES,
    currency_symbol,
)
from app.models.debt import Debt
from app.models.finance import Budget, Expense, Income
from app.models.goals import FinancialGoal, SavingsGoal
from app.models.investments import Investment, InvestmentTransaction
from app.models.user import FinancialProfile, User
from app.services.finance.debt_calc import estimate_remaining_interest
from app.services.finance.health_score import HealthScoreInput, calculate_health_score
from app.services.finance.helpers import (
    add_months,
    clamp,
    days_in_month,
    month_name,
    month_range,
    pct,
    previous_month,
    round2,
    start_of_week,
    total as sum_of,
)
from app.services.finance.projections import build_goal_progress

HISTORY_MONTHS = 6

DEFAULT_PROFILE = {
    "monthly_salary": 0.0,
    "salary_day": 1,
    "other_monthly_income": 0.0,
    "expected_growth_pct": 0.0,
    "employment_type": "SALARIED",
    "bank_balance": 0.0,
    "cash_balance": 0.0,
    "existing_savings": 0.0,
    "emergency_fund": 0.0,
    "other_assets": 0.0,
    "emergency_fund_months": 6,
    "target_savings_rate": 20.0,
    "inflation_assumption": 6.0,
    "investment_return_pct": 10.0,
    "risk_tolerance": "MODERATE",
}


def split_essential_lifestyle(expenses: Iterable[Expense]) -> tuple[float, float]:
    """
    Classifies spend into needs vs wants.

    Food is split (groceries are a need, eating out is not) and anything
    unclassified splits down the middle rather than flattering either number.
    """
    essentials = 0.0
    lifestyle = 0.0
    for e in expenses:
        amount = float(e.amount or 0)
        if e.category == "FOOD":
            essentials += amount * FOOD_ESSENTIAL_SHARE
            lifestyle += amount * (1 - FOOD_ESSENTIAL_SHARE)
        elif e.is_fixed or e.category in ESSENTIAL_CATEGORIES:
            essentials += amount
        elif e.category in LIFESTYLE_CATEGORIES:
            lifestyle += amount
        else:
            essentials += amount * 0.5
            lifestyle += amount * 0.5
    return round2(essentials), round2(lifestyle)


def build_portfolio(investments: List[Investment]) -> dict:
    """
    Values every holding.

    When no current price has been supplied the holding is valued at cost -
    the app never invents a market price.
    """
    holdings = []
    for inv in investments:
        quantity = float(inv.quantity or 0)
        avg = float(inv.avg_buy_price or 0)
        invested = round2(quantity * avg)
        price = float(inv.current_price or 0) or avg
        current_value = round2(quantity * price)
        profit_loss = round2(current_value - invested)
        prev_close = float(inv.previous_close) if inv.previous_close else None

        holdings.append(
            {
                "id": inv.id,
                "name": inv.name,
                "ticker": inv.ticker,
                "type": inv.type,
                "quantity": quantity,
                "avg_buy_price": round2(avg),
                "current_price": round2(price),
                "invested": invested,
                "current_value": current_value,
                "profit_loss": profit_loss,
                "profit_loss_pct": pct(profit_loss, invested),
                "day_change": round2((price - prev_close) * quantity) if prev_close else None,
                "day_change_pct": round2((price - prev_close) / prev_close * 100) if prev_close else None,
                "price_source": inv.price_source,
                "price_updated_at": inv.price_updated_at,
                "currency": inv.currency,
                "notes": inv.notes,
                "is_demo": inv.is_demo,
            }
        )

    total_invested = round2(sum(h["invested"] for h in holdings))
    current_value = round2(sum(h["current_value"] for h in holdings))
    profit_loss = round2(current_value - total_invested)

    allocation_map: dict[str, float] = {}
    for h in holdings:
        allocation_map[h["type"]] = round2(allocation_map.get(h["type"], 0) + h["current_value"])
    allocation = sorted(
        (
            {"type": t, "value": v, "share": pct(v, current_value)}
            for t, v in allocation_map.items()
        ),
        key=lambda a: -a["value"],
    )

    ranked = sorted(
        (h for h in holdings if h["invested"] > 0), key=lambda h: -h["profit_loss_pct"]
    )
    day_changes = [h["day_change"] for h in holdings if h["day_change"] is not None]

    return {
        "holdings": holdings,
        "total_invested": total_invested,
        "current_value": current_value,
        "profit_loss": profit_loss,
        "profit_loss_pct": pct(profit_loss, total_invested),
        "day_change": round2(sum(day_changes)) if day_changes else None,
        "allocation": allocation,
        "best_performer": ranked[0] if ranked else None,
        "worst_performer": ranked[-1] if len(ranked) > 1 else None,
        "has_live_prices": any(h["price_source"] == "LIVE_MARKET" for h in holdings),
        "holdings_count": len(holdings),
    }


def build_financial_context(
    db: Session, user: User, month: Optional[int] = None, year: Optional[int] = None
) -> dict:
    """
    The single source of truth for a user's financial picture.

    Every page, the rules engine, the report generator and the AI context
    builder read from this, so the numbers can never disagree across screens.
    """
    now = datetime.utcnow()
    year = year or now.year
    month = month or now.month
    start, end = month_range(year, month)

    first_of_period = datetime(year, month, 1)
    history_anchor = add_months(first_of_period, -(HISTORY_MONTHS - 1))
    history_start, _ = month_range(history_anchor.year, history_anchor.month)

    profile: Optional[FinancialProfile] = db.scalar(
        select(FinancialProfile).where(FinancialProfile.user_id == user.id)
    )
    p = {
        k: (getattr(profile, k) if profile is not None else v) for k, v in DEFAULT_PROFILE.items()
    }
    for key in ("monthly_salary", "other_monthly_income", "bank_balance", "cash_balance",
                "existing_savings", "emergency_fund", "other_assets", "target_savings_rate",
                "inflation_assumption", "investment_return_pct", "expected_growth_pct"):
        p[key] = float(p[key] or 0)

    expenses: List[Expense] = list(
        db.scalars(
            select(Expense)
            .where(Expense.user_id == user.id, Expense.spent_at >= history_start, Expense.spent_at <= end)
            .order_by(Expense.spent_at.desc())
        )
    )
    incomes: List[Income] = list(
        db.scalars(
            select(Income).where(
                Income.user_id == user.id, Income.received_at >= history_start, Income.received_at <= end
            )
        )
    )
    budgets: List[Budget] = list(
        db.scalars(select(Budget).where(Budget.user_id == user.id, Budget.month == month, Budget.year == year))
    )
    savings_goals: List[SavingsGoal] = list(
        db.scalars(select(SavingsGoal).where(SavingsGoal.user_id == user.id, SavingsGoal.archived.is_(False)))
    )
    investments: List[Investment] = list(
        db.scalars(select(Investment).where(Investment.user_id == user.id))
    )
    txns: List[InvestmentTransaction] = list(
        db.scalars(
            select(InvestmentTransaction).where(
                InvestmentTransaction.user_id == user.id,
                InvestmentTransaction.occurred_at >= history_start,
                InvestmentTransaction.occurred_at <= end,
            )
        )
    )
    debts: List[Debt] = list(db.scalars(select(Debt).where(Debt.user_id == user.id, Debt.closed.is_(False))))
    goals: List[FinancialGoal] = list(
        db.scalars(select(FinancialGoal).where(FinancialGoal.user_id == user.id, FinancialGoal.completed.is_(False)))
    )

    # ------------------------------------------------------------------ spend
    this_month = [e for e in expenses if start <= e.spent_at <= end]
    prev_y, prev_m = previous_month(year, month)
    prev_start, prev_end = month_range(prev_y, prev_m)
    last_month = [e for e in expenses if prev_start <= e.spent_at <= prev_end]

    total_spend = sum_of(e.amount for e in this_month)
    last_month_spend = sum_of(e.amount for e in last_month)

    is_current_month = (year == now.year and month == now.month)
    total_days = days_in_month(year, month)
    days_elapsed = now.day if is_current_month else total_days
    daily_average = round2(total_spend / max(days_elapsed, 1))

    today_start = datetime(now.year, now.month, now.day)
    spent_today = sum_of(e.amount for e in this_month if e.spent_at >= today_start)
    week_start = start_of_week(now)
    week_to_date = sum_of(e.amount for e in this_month if e.spent_at >= week_start)

    by_category_map: dict[str, float] = {}
    for e in this_month:
        by_category_map[e.category] = round2(by_category_map.get(e.category, 0) + float(e.amount or 0))
    budget_map = {b.category: float(b.amount or 0) for b in budgets}
    by_category = sorted(
        (
            {
                "category": cat,
                "amount": amt,
                "budget": budget_map.get(cat),
                "share": pct(amt, total_spend),
            }
            for cat, amt in by_category_map.items()
        ),
        key=lambda c: -c["amount"],
    )

    essentials, lifestyle = split_essential_lifestyle(this_month)
    fixed_monthly = sum_of(e.amount for e in this_month if e.is_fixed)

    # ----------------------------------------------------------------- income
    recorded_this_month = sum_of(i.amount for i in incomes if start <= i.received_at <= end)
    planned_monthly = round2(p["monthly_salary"] + p["other_monthly_income"])
    monthly_income = recorded_this_month if recorded_this_month > 0 else planned_monthly

    # ---------------------------------------------------------------- savings
    emergency_from_goals = sum_of(g.current_amount for g in savings_goals if g.is_emergency_fund)
    emergency_current = round2(max(p["emergency_fund"], emergency_from_goals))

    total_saved = round2(sum_of(g.current_amount for g in savings_goals) + p["existing_savings"])
    monthly_savings = round2(monthly_income - total_spend)
    savings_rate = pct(max(monthly_savings, 0), monthly_income)

    savings_goal_progress = [
        build_goal_progress(
            id=g.id,
            name=g.name,
            target_amount=float(g.target_amount or 0),
            current_amount=float(g.current_amount or 0),
            target_date=g.target_date,
            monthly_contribution=float(g.monthly_contribution or 0),
            category=g.category,
        )
        for g in savings_goals
    ]
    goal_progress = [
        build_goal_progress(
            id=g.id,
            name=g.name,
            target_amount=float(g.target_amount or 0),
            current_amount=float(g.current_amount or 0),
            target_date=g.target_date,
            monthly_contribution=float(g.monthly_contribution or 0),
            horizon=g.horizon,
        )
        for g in goals
    ]

    # -------------------------------------------------------- emergency fund
    monthly_emi = sum_of(d.emi for d in debts)
    monthly_essentials = round2((essentials if essentials > 0 else fixed_monthly) + monthly_emi)
    target_months = int(p["emergency_fund_months"] or 6)
    em_target = round2(monthly_essentials * target_months)
    emergency = {
        "current": emergency_current,
        "monthly_essentials": monthly_essentials,
        "min_recommended": round2(monthly_essentials * 3),
        "max_recommended": round2(monthly_essentials * 6),
        "target_months": target_months,
        "target": em_target,
        "months_covered": round2(emergency_current / monthly_essentials) if monthly_essentials > 0 else 0.0,
        "progress_pct": clamp(pct(emergency_current, em_target), 0, 100) if em_target > 0 else 0.0,
        "shortfall": round2(max(0.0, em_target - emergency_current)),
    }

    # -------------------------------------------------------------- portfolio
    portfolio = build_portfolio(investments)

    # ------------------------------------------------------------------- debt
    debt_items = []
    for d in debts:
        outstanding = float(d.outstanding or 0)
        debt_items.append(
            {
                "id": d.id,
                "name": d.name,
                "type": d.type,
                "principal": round2(d.principal),
                "outstanding": round2(outstanding),
                "emi": round2(d.emi),
                "interest_rate": float(d.interest_rate or 0),
                "remaining_months": d.remaining_months,
                "due_day": d.due_day,
                "estimated_interest": estimate_remaining_interest(
                    outstanding, float(d.emi or 0), float(d.interest_rate or 0), d.remaining_months
                ),
            }
        )
    total_outstanding = round2(sum(d["outstanding"] for d in debt_items))
    debt = {
        "total_outstanding": total_outstanding,
        "monthly_emi": monthly_emi,
        "weighted_interest_rate": round2(
            sum(d["interest_rate"] * d["outstanding"] for d in debt_items) / total_outstanding
        )
        if total_outstanding > 0
        else 0.0,
        "debt_to_income_ratio": pct(monthly_emi, monthly_income),
        "estimated_interest_remaining": round2(sum(d["estimated_interest"] for d in debt_items)),
        "items": debt_items,
        "has_high_interest": any(d["interest_rate"] >= 15 and d["outstanding"] > 0 for d in debt_items),
    }

    # -------------------------------------------------------------- net worth
    credit_card = round2(sum(d["outstanding"] for d in debt_items if d["type"] == "CREDIT_CARD"))
    # The emergency fund is already inside `total_saved` when it comes from a
    # goal; only the profile-held remainder is added again.
    emergency_not_in_goals = round2(max(0.0, emergency_current - emergency_from_goals))
    total_assets = round2(
        p["cash_balance"]
        + p["bank_balance"]
        + total_saved
        + emergency_not_in_goals
        + portfolio["current_value"]
        + p["other_assets"]
    )
    net_worth = {
        "cash": round2(p["cash_balance"]),
        "bank": round2(p["bank_balance"]),
        "savings": total_saved,
        "emergency_fund": emergency_current,
        "investments": portfolio["current_value"],
        "other_assets": round2(p["other_assets"]),
        "total_assets": total_assets,
        "loans": round2(total_outstanding - credit_card),
        "credit_card": credit_card,
        "total_liabilities": total_outstanding,
        "net_worth": round2(total_assets - total_outstanding),
    }

    # --------------------------------------------------------------- budgets
    budget_rows = []
    for b in budgets:
        amount = float(b.amount or 0)
        spent = by_category_map.get(b.category, 0.0)
        used = pct(spent, amount)
        budget_rows.append(
            {
                "id": b.id,
                "category": b.category,
                "amount": round2(amount),
                "spent": round2(spent),
                "remaining": round2(amount - spent),
                "used_pct": used,
                "status": "OVER" if used >= 100 else ("WARNING" if used >= 80 else "SAFE"),
                "month": b.month,
                "year": b.year,
            }
        )
    budget_rows.sort(key=lambda b: -b["used_pct"])

    # --------------------------------------------------------------- history
    history = []
    for offset in range(HISTORY_MONTHS - 1, -1, -1):
        d = add_months(first_of_period, -offset)
        m_start, m_end = month_range(d.year, d.month)
        inc = sum_of(x.amount for x in incomes if m_start <= x.received_at <= m_end)
        exp = sum_of(x.amount for x in expenses if m_start <= x.spent_at <= m_end)
        inv = sum_of(
            float(t.quantity) * float(t.price) + float(t.fees or 0)
            for t in txns
            if t.type == "BUY" and m_start <= t.occurred_at <= m_end
        )
        effective_income = inc if inc > 0 else planned_monthly
        history.append(
            {
                "month": d.month,
                "year": d.year,
                "label": f"{month_name(d.month)[:3]} {str(d.year)[2:]}",
                "income": effective_income,
                "expenses": exp,
                "savings": round2(effective_income - exp),
                "invested": inv,
            }
        )

    months_with_investment = sum(1 for h in history if h["invested"] > 0)
    invested_this_month = history[-1]["invested"] if history else 0.0

    # --------------------------------------------------------- safe-to-spend
    committed_remaining = round2(max(0.0, monthly_essentials - essentials))
    savings_target = round2((p["target_savings_rate"] / 100) * monthly_income)
    disposable = round2(monthly_income - total_spend - committed_remaining - savings_target)
    days_left = max(1, total_days - days_elapsed)

    # ---------------------------------------------------------- health score
    all_goals = savings_goal_progress + goal_progress
    health = calculate_health_score(
        HealthScoreInput(
            monthly_income=monthly_income,
            savings_rate=savings_rate,
            target_savings_rate=p["target_savings_rate"],
            monthly_expenses=total_spend,
            budgets_set=len(budget_rows),
            budgets_overspent=sum(1 for b in budget_rows if b["status"] == "OVER"),
            emergency_months_covered=emergency["months_covered"],
            emergency_target_months=target_months,
            debt_to_income_ratio=debt["debt_to_income_ratio"],
            monthly_invested=invested_this_month,
            months_with_investment=months_with_investment,
            goals_total=len(all_goals),
            goals_on_track=sum(1 for g in all_goals if g["status"] in ("ON_TRACK", "COMPLETE")),
        )
    )

    return {
        "user_id": user.id,
        "currency": user.currency,
        "currency_symbol": currency_symbol(user.currency),
        "as_of": now,
        "month": month,
        "year": year,
        "month_label": f"{month_name(month)} {year}",
        "profile": {
            "monthly_salary": round2(p["monthly_salary"]),
            "salary_day": int(p["salary_day"] or 1),
            "other_monthly_income": round2(p["other_monthly_income"]),
            "expected_growth_pct": p["expected_growth_pct"],
            "employment_type": p["employment_type"],
            "emergency_fund_months": target_months,
            "target_savings_rate": p["target_savings_rate"],
            "inflation_assumption": p["inflation_assumption"],
            "investment_return_pct": p["investment_return_pct"],
            "risk_tolerance": p["risk_tolerance"],
            "bank_balance": round2(p["bank_balance"]),
            "cash_balance": round2(p["cash_balance"]),
        },
        "income": {
            "monthly": monthly_income,
            "recorded_this_month": recorded_this_month,
            "planned_monthly": planned_monthly,
            "uses_planned_figure": recorded_this_month <= 0,
        },
        "spend": {
            "month_to_date": total_spend,
            "last_month": last_month_spend,
            "daily_average": daily_average,
            "week_to_date": week_to_date,
            "today": spent_today,
            "projected_month_end": round2(daily_average * total_days),
            "essentials": essentials,
            "lifestyle": lifestyle,
            "by_category": by_category,
            "days_elapsed": days_elapsed,
            "days_in_month": total_days,
            "days_left": days_left,
            "transaction_count": len(this_month),
            "vs_last_month_pct": pct(total_spend - last_month_spend, last_month_spend)
            if last_month_spend > 0
            else 0.0,
        },
        "fixed_monthly_expenses": fixed_monthly if fixed_monthly > 0 else monthly_essentials,
        "savings": {
            "monthly_savings": monthly_savings,
            "savings_rate": savings_rate,
            "savings_target": savings_target,
            "total_saved": total_saved,
            "goals": savings_goal_progress,
        },
        "emergency": emergency,
        "net_worth": net_worth,
        "portfolio": portfolio,
        "debt": debt,
        "goals": goal_progress,
        "budgets": budget_rows,
        "history": history,
        "disposable_this_month": disposable,
        "safe_to_spend_this_month": round2(max(0.0, disposable)),
        "safe_daily_spend": round2(max(0.0, disposable) / days_left),
        "health_score": {
            "score": health.score,
            "grade": health.grade,
            "summary": health.summary,
            "strengths": health.strengths,
            "weaknesses": health.weaknesses,
            "breakdown": [
                {"key": c.key, "label": c.label, "score": c.score, "max": c.max, "detail": c.detail}
                for c in health.breakdown
            ],
        },
    }
