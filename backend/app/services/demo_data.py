from __future__ import annotations

import random
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.ai import AIConversation
from app.models.debt import Debt
from app.models.finance import Budget, Expense, Income, SalaryAllocation
from app.models.goals import FinancialGoal, FuturePlan, SavingsContribution, SavingsGoal
from app.models.insights import FinancialSnapshot, MonthlyReport, Notification, PurchaseDecision
from app.models.investments import Investment, InvestmentTransaction
from app.models.user import FinancialProfile, User
from app.services.finance.helpers import add_months, days_in_month, month_range, round2

# A deterministic seed keeps the demo dashboard identical between installs,
# which matters when someone is comparing behaviour or filing a bug.
RNG_SEED = 20240817

# Recurring commitments - the "fixed expenses" half of the demo profile.
FIXED_EXPENSES = [
    ("RENT", "Room rent", 6000),
    ("BILLS", "Electricity", 700),
    ("BILLS", "WiFi / broadband", 800),
    ("FAMILY", "Family contribution", 2000),
    ("SUBSCRIPTIONS", "Mobile plan", 300),
    ("SUBSCRIPTIONS", "Streaming", 200),
]

# Variable spending patterns: (category, description pool, min, max, count/month)
VARIABLE_PATTERNS = [
    ("FOOD", ["Groceries", "Vegetables", "Milk and eggs", "Monthly provisions"], 300, 900, 4),
    ("FOOD", ["Lunch out", "Coffee", "Food delivery", "Dinner with friends"], 120, 450, 5),
    ("TRAVEL", ["Bus pass", "Auto fare", "Petrol", "Cab"], 60, 400, 4),
    ("SHOPPING", ["T-shirt", "Shoes", "Headphone case", "Household items"], 250, 1200, 2),
    ("ENTERTAINMENT", ["Movie ticket", "Cricket match", "Game purchase"], 150, 600, 2),
    ("HEALTH", ["Pharmacy", "Doctor visit"], 200, 700, 1),
    ("EDUCATION", ["Online course", "Books"], 300, 900, 1),
]


def has_demo_data(db: Session, user: User) -> bool:
    return db.query(Expense).filter(Expense.user_id == user.id, Expense.is_demo.is_(True)).count() > 0


def seed_demo_data(db: Session, user: User, months: int = 4) -> dict:
    """
    Creates a realistic, clearly-labelled demo dataset so the dashboard is
    meaningful the moment someone signs in.

    Every row is flagged `is_demo`, so `clear_demo_data` can remove exactly
    this data and nothing the user entered themselves.
    """
    rng = random.Random(RNG_SEED)
    now = datetime.utcnow()

    # --- Profile -----------------------------------------------------------
    profile = db.scalar(select(FinancialProfile).where(FinancialProfile.user_id == user.id))
    if not profile:
        profile = FinancialProfile(user_id=user.id)
        db.add(profile)
        db.flush()

    profile.monthly_salary = 25000
    profile.salary_day = 1
    profile.other_monthly_income = 1500
    profile.expected_growth_pct = 8
    profile.employment_type = "SALARIED"
    profile.bank_balance = 32000
    profile.cash_balance = 3000
    profile.existing_savings = 18000
    profile.emergency_fund = 25000
    profile.other_assets = 0
    profile.emergency_fund_months = 6
    profile.target_savings_rate = 20
    profile.inflation_assumption = 6
    profile.investment_return_pct = 10
    profile.risk_tolerance = "MODERATE"

    counts = {
        "expenses": 0,
        "incomes": 0,
        "budgets": 0,
        "savings_goals": 0,
        "investments": 0,
        "goals": 0,
        "future_plans": 0,
        "debts": 0,
        "snapshots": 0,
    }

    # --- Income and expenses across the last few months --------------------
    for offset in range(months - 1, -1, -1):
        anchor = add_months(datetime(now.year, now.month, 1), -offset)
        y, m = anchor.year, anchor.month
        is_current = offset == 0
        last_day = days_in_month(y, m)
        # For the current month only generate up to today, so "spent so far"
        # is honest rather than a full month of spending on the 3rd.
        max_day = min(now.day, last_day) if is_current else last_day

        db.add(
            Income(
                user_id=user.id,
                source="Monthly salary",
                amount=25000,
                category="SALARY",
                recurring=True,
                received_at=datetime(y, m, 1, 10, 0),
                is_demo=True,
            )
        )
        db.add(
            Income(
                user_id=user.id,
                source="Freelance project",
                amount=1500,
                category="FREELANCE",
                received_at=datetime(y, m, min(12, max_day), 15, 0),
                is_demo=True,
            )
        )
        counts["incomes"] += 2

        for category, description, amount in FIXED_EXPENSES:
            day = min(3, max_day)
            db.add(
                Expense(
                    user_id=user.id,
                    amount=amount,
                    category=category,
                    description=description,
                    payment_method="BANK_TRANSFER" if amount > 1000 else "UPI",
                    spent_at=datetime(y, m, day, 9, 0),
                    is_fixed=True,
                    is_recurring=True,
                    is_demo=True,
                )
            )
            counts["expenses"] += 1

        for category, pool, low, high, per_month in VARIABLE_PATTERNS:
            # Scale the count down for a partial current month.
            n = per_month if not is_current else max(1, round(per_month * max_day / last_day))
            for _ in range(n):
                day = rng.randint(1, max_day)
                db.add(
                    Expense(
                        user_id=user.id,
                        amount=round2(rng.randint(low, high)),
                        category=category,
                        description=rng.choice(pool),
                        payment_method=rng.choice(["UPI", "CASH", "DEBIT_CARD"]),
                        spent_at=datetime(y, m, day, rng.randint(8, 21), rng.choice([0, 15, 30, 45])),
                        is_demo=True,
                    )
                )
                counts["expenses"] += 1

        # Monthly SIP into the index fund.
        db.add(
            SalaryAllocation(
                user_id=user.id,
                month=m,
                year=y,
                salary=25000,
                essentials=11000,
                lifestyle=3000,
                savings=4000,
                investments=3000,
                debt_payments=1800,
                family=2000,
                emergency=1500,
                buffer=200,
                source="RULE_BASED",
                rationale="Generated from the demo profile's commitments.",
                is_demo=True,
            )
        )

    # --- Budgets for the current month -------------------------------------
    for category, amount in [
        ("FOOD", 3000),
        ("TRAVEL", 1200),
        ("SHOPPING", 1500),
        ("ENTERTAINMENT", 800),
        ("BILLS", 1600),
        ("SUBSCRIPTIONS", 600),
    ]:
        db.add(
            Budget(
                user_id=user.id,
                category=category,
                amount=amount,
                month=now.month,
                year=now.year,
                is_demo=True,
            )
        )
        counts["budgets"] += 1

    # --- Savings goals -----------------------------------------------------
    savings_goals = [
        ("Emergency Fund", "EMERGENCY", 90000, 25000, 18, 2500, True, 1),
        ("New Laptop", "GADGET", 55000, 12000, 10, 3000, False, 2),
        ("Phone Upgrade", "GADGET", 20000, 8000, 6, 1500, False, 3),
        ("Bike Down Payment", "VEHICLE", 40000, 6000, 14, 2000, False, 3),
        ("Kerala Trip", "TRAVEL", 25000, 9500, 8, 1500, False, 4),
    ]
    for name, category, target, current, months_out, monthly, is_emergency, priority in savings_goals:
        goal = SavingsGoal(
            user_id=user.id,
            name=name,
            category=category,
            target_amount=target,
            current_amount=current,
            target_date=add_months(now, months_out),
            monthly_contribution=monthly,
            is_emergency_fund=is_emergency,
            priority=priority,
            is_demo=True,
        )
        db.add(goal)
        db.flush()
        counts["savings_goals"] += 1

        # A few contributions so the history is not empty.
        remaining = current
        for i in range(min(4, months_out)):
            amount = round2(min(monthly, remaining))
            if amount <= 0:
                break
            db.add(
                SavingsContribution(
                    goal_id=goal.id,
                    user_id=user.id,
                    amount=amount,
                    note="Monthly contribution",
                    occurred_at=add_months(now, -(i + 1)),
                    is_demo=True,
                )
            )
            remaining = round2(remaining - amount)

    # --- Financial goals ---------------------------------------------------
    financial_goals = [
        ("Build 6-month emergency fund", "SHORT", 90000, 25000, 18, 2500, 1,
         "Cover six months of essential expenses before taking any investment risk."),
        ("Buy a laptop for freelance work", "SHORT", 55000, 12000, 10, 3000, 2,
         "A faster machine pays for itself through freelance income."),
        ("Higher education fund", "MEDIUM", 300000, 35000, 36, 7000, 2,
         "Part-time masters programme, self-funded."),
        ("Start a side business", "MEDIUM", 150000, 20000, 42, 3000, 3,
         "Initial working capital and equipment."),
        ("House down payment", "LONG", 1200000, 60000, 84, 12000, 2,
         "20% down payment to keep the loan affordable."),
        ("Financial independence", "LONG", 5000000, 145000, 240, 15000, 4,
         "Investment corpus that covers annual expenses without salary."),
    ]
    for name, horizon, target, current, months_out, monthly, priority, description in financial_goals:
        db.add(
            FinancialGoal(
                user_id=user.id,
                name=name,
                description=description,
                horizon=horizon,
                target_amount=target,
                current_amount=current,
                target_date=add_months(now, months_out),
                monthly_contribution=monthly,
                priority=priority,
                is_demo=True,
            )
        )
        counts["goals"] += 1

    # --- Future plans ------------------------------------------------------
    future_plans = [
        ("Buy a motorcycle", "VEHICLE", 120000, 2.0, 6, 10, 6000, "Commuter bike, bought outright."),
        ("Masters degree", "EDUCATION", 400000, 4.0, 8, 10, 35000, "Fees plus living costs."),
        ("Buy a house", "HOUSE", 3500000, 8.0, 7, 11, 60000, "Down payment target of 20%."),
        ("Marriage", "MARRIAGE", 600000, 5.0, 7, 10, 25000, "Modest ceremony, no debt."),
        ("Retirement corpus", "RETIREMENT", 8000000, 30.0, 6, 11, 145000,
         "Target corpus at 25x annual expenses."),
    ]
    for name, category, cost, years, inflation, ret, saved, notes in future_plans:
        db.add(
            FuturePlan(
                user_id=user.id,
                name=name,
                category=category,
                current_cost=cost,
                years_away=years,
                inflation_pct=inflation,
                expected_return_pct=ret,
                already_saved=saved,
                notes=notes,
                is_demo=True,
            )
        )
        counts["future_plans"] += 1

    # --- Investments -------------------------------------------------------
    # Prices below are the user's own entries, flagged USER_ENTERED. They are
    # not represented as live market data anywhere in the app.
    investments = [
        ("Nifty 50 Index Fund", None, "MUTUAL_FUND", 145.0, 210.50, 232.10),
        ("Flexi Cap Fund", None, "MUTUAL_FUND", 88.0, 165.00, 178.40),
        ("Apple Inc.", "AAPL", "STOCK", 4.0, 3900.00, 4180.00),
        ("Microsoft Corp.", "MSFT", "STOCK", 2.0, 8200.00, 8650.00),
        ("Gold ETF", "GOLDBEES", "ETF", 60.0, 62.50, 68.20),
        ("Sovereign Gold", None, "GOLD", 5.0, 5800.00, 6250.00),
    ]
    for name, ticker, type_, qty, buy, current in investments:
        inv = Investment(
            user_id=user.id,
            name=name,
            ticker=ticker,
            type=type_,
            quantity=qty,
            avg_buy_price=buy,
            current_price=current,
            price_source="USER_ENTERED",
            price_updated_at=now - timedelta(days=1),
            currency=user.currency,
            is_demo=True,
        )
        db.add(inv)
        db.flush()
        counts["investments"] += 1

        # Spread the position across a few monthly buys (a SIP pattern).
        tranches = 3
        per = round2(qty / tranches)
        for i in range(tranches):
            db.add(
                InvestmentTransaction(
                    user_id=user.id,
                    investment_id=inv.id,
                    type="BUY",
                    quantity=per,
                    price=round2(buy * (0.97 + i * 0.02)),
                    occurred_at=add_months(now, -(tranches - i)),
                    notes="Monthly contribution",
                    is_demo=True,
                )
            )

    # --- Debt --------------------------------------------------------------
    demo_debts = [
        ("Education loan", "EDUCATION_LOAN", 120000, 78000, 1800, 9.5, 48, 5),
        ("Credit card balance", "CREDIT_CARD", 18000, 12500, 1500, 36.0, 10, 18),
    ]
    for name, type_, principal, outstanding, emi, rate, months_left, due_day in demo_debts:
        db.add(
            Debt(
                user_id=user.id,
                name=name,
                type=type_,
                principal=principal,
                outstanding=outstanding,
                emi=emi,
                interest_rate=rate,
                remaining_months=months_left,
                due_day=due_day,
                is_demo=True,
            )
        )
        counts["debts"] += 1

    # --- Net-worth snapshots ----------------------------------------------
    base_net_worth = 40000
    for offset in range(6, 0, -1):
        taken = add_months(now, -offset)
        growth = round2(base_net_worth + (6 - offset) * 6800 + rng.randint(-1500, 1500))
        db.add(
            FinancialSnapshot(
                user_id=user.id,
                taken_at=taken,
                net_worth=growth,
                total_assets=round2(growth + 95000),
                total_liabilities=95000,
                cash=round2(30000 + offset * 400),
                savings=round2(45000 + (6 - offset) * 3000),
                investments=round2(38000 + (6 - offset) * 4200),
                emergency_fund=round2(18000 + (6 - offset) * 1200),
                health_score=55 + (6 - offset) * 3,
                is_demo=True,
            )
        )
        counts["snapshots"] += 1

    user.has_demo_data = True
    user.onboarded = True
    db.commit()

    return {
        "message": "Demo data created. Everything is labelled as demo and can be removed in one click.",
        "counts": counts,
    }


def clear_demo_data(db: Session, user: User) -> dict:
    """
    Removes only rows flagged `is_demo`. Anything the user entered themselves
    is left untouched.
    """
    deleted = {}

    # Contributions and transactions first - they hang off goals/investments.
    demo_goal_ids = [
        g.id
        for g in db.scalars(
            select(SavingsGoal).where(SavingsGoal.user_id == user.id, SavingsGoal.is_demo.is_(True))
        )
    ]
    if demo_goal_ids:
        deleted["contributions"] = (
            db.query(SavingsContribution)
            .filter(SavingsContribution.goal_id.in_(demo_goal_ids))
            .delete(synchronize_session=False)
        )

    for label, model in (
        ("investment_transactions", InvestmentTransaction),
        ("investments", Investment),
        ("expenses", Expense),
        ("incomes", Income),
        ("budgets", Budget),
        ("salary_allocations", SalaryAllocation),
        ("savings_goals", SavingsGoal),
        ("financial_goals", FinancialGoal),
        ("future_plans", FuturePlan),
        ("debts", Debt),
        ("snapshots", FinancialSnapshot),
    ):
        deleted[label] = (
            db.query(model)
            .filter(model.user_id == user.id, model.is_demo.is_(True))
            .delete(synchronize_session=False)
        )

    # Notifications, reports and decisions are all derived from the demo data,
    # so they go too - otherwise the user is left with alerts about rows that
    # no longer exist.
    deleted["notifications"] = (
        db.query(Notification).filter(Notification.user_id == user.id).delete(synchronize_session=False)
    )
    deleted["reports"] = (
        db.query(MonthlyReport).filter(MonthlyReport.user_id == user.id).delete(synchronize_session=False)
    )
    deleted["purchase_decisions"] = (
        db.query(PurchaseDecision)
        .filter(PurchaseDecision.user_id == user.id)
        .delete(synchronize_session=False)
    )

    profile = db.scalar(select(FinancialProfile).where(FinancialProfile.user_id == user.id))
    if profile:
        for field, value in (
            ("monthly_salary", 0),
            ("other_monthly_income", 0),
            ("bank_balance", 0),
            ("cash_balance", 0),
            ("existing_savings", 0),
            ("emergency_fund", 0),
            ("other_assets", 0),
        ):
            setattr(profile, field, value)

    user.has_demo_data = False
    db.commit()

    return {"message": "Demo data removed.", "deleted": deleted}
