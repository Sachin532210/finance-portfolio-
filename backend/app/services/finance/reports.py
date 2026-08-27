from __future__ import annotations

import csv
import io
import json
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.finance import Expense
from app.models.insights import MonthlyReport
from app.models.user import User
from app.services.finance.context import build_financial_context
from app.services.finance.helpers import money_str, month_name, month_range, round2


def generate_monthly_report(db: Session, user: User, month: int, year: int, persist: bool = True) -> dict:
    """
    Builds the end-of-month review: totals, top categories, what went well,
    what did not, and a concrete plan for next month.

    Every recommendation is derived from the user's own numbers - no generic
    advice is emitted.
    """
    ctx = build_financial_context(db, user, month=month, year=year)
    sym = ctx["currency_symbol"]
    fmt = lambda n: money_str(n, sym)  # noqa: E731

    income = ctx["income"]["monthly"]
    expenses = ctx["spend"]["month_to_date"]
    savings = ctx["savings"]["monthly_savings"]
    invested = ctx["history"][-1]["invested"] if ctx["history"] else 0.0

    top_categories = [
        {
            "category": c["category"],
            "amount": c["amount"],
            "share": c["share"],
            "budget": c["budget"],
        }
        for c in ctx["spend"]["by_category"][:5]
    ]

    good: List[str] = []
    problems: List[str] = []
    plan: List[str] = []

    # --- What went well ----------------------------------------------------
    target_rate = ctx["profile"]["target_savings_rate"]
    if ctx["savings"]["savings_rate"] >= target_rate and income > 0:
        good.append(
            f"You saved {fmt(savings)} ({ctx['savings']['savings_rate']:.1f}% of income), meeting "
            f"your {target_rate:.0f}% target."
        )
    kept_budgets = [b for b in ctx["budgets"] if b["status"] == "SAFE"]
    if kept_budgets:
        good.append(
            f"You stayed comfortably inside {len(kept_budgets)} budget(s): "
            + ", ".join(b["category"].lower() for b in kept_budgets[:4])
            + "."
        )
    if invested > 0:
        good.append(f"You invested {fmt(invested)} this month, keeping the contribution habit going.")
    if ctx["emergency"]["months_covered"] >= 3:
        good.append(
            f"Your emergency fund covers {ctx['emergency']['months_covered']:.1f} months of "
            "essentials, which is above the three-month floor."
        )
    prev = ctx["history"][-2] if len(ctx["history"]) >= 2 else None
    if prev and prev["expenses"] > 0 and expenses < prev["expenses"]:
        cut = round2(prev["expenses"] - expenses)
        good.append(f"Total spending fell by {fmt(cut)} compared with the previous month.")
    if not good:
        good.append(
            "No standout wins this month - the fastest one to create next month is a single "
            "automatic transfer to savings on salary day."
        )

    # --- Problems ----------------------------------------------------------
    over = [b for b in ctx["budgets"] if b["status"] == "OVER"]
    for b in over[:3]:
        problems.append(
            f"{b['category'].title()} went {fmt(abs(b['remaining']))} over its {fmt(b['amount'])} budget."
        )
    if income > 0 and ctx["savings"]["savings_rate"] < target_rate:
        gap = round2(ctx["savings"]["savings_target"] - max(savings, 0))
        problems.append(
            f"Savings came in {fmt(gap)} below your {target_rate:.0f}% target "
            f"({ctx['savings']['savings_rate']:.1f}% actual)."
        )
    if ctx["emergency"]["months_covered"] < 3:
        problems.append(
            f"Emergency fund covers only {ctx['emergency']['months_covered']:.1f} months - "
            f"{fmt(ctx['emergency']['shortfall'])} short of your "
            f"{ctx['emergency']['target_months']}-month target."
        )
    if ctx["debt"]["debt_to_income_ratio"] > 36:
        problems.append(
            f"EMIs take {ctx['debt']['debt_to_income_ratio']:.0f}% of income, above the 36% comfort line."
        )
    behind_goals = [g for g in ctx["goals"] + ctx["savings"]["goals"] if g["status"] == "BEHIND"]
    for g in behind_goals[:2]:
        problems.append(
            f"\"{g['name']}\" is behind: contributing {fmt(g['planned_monthly'])} against "
            f"{fmt(g['required_monthly'])} needed."
        )
    if invested == 0 and income > 0 and ctx["portfolio"]["holdings_count"] > 0:
        problems.append("No investment contribution was recorded this month.")
    if not problems:
        problems.append("Nothing flagged this month - budgets, savings and debt all stayed within range.")

    # --- Next month plan (3-5 concrete actions) ----------------------------
    for b in over[:2]:
        suggested_cut = round2(abs(b["remaining"]))
        plan.append(
            f"Cut {b['category'].lower()} by {fmt(suggested_cut)} to bring it back inside the "
            f"{fmt(b['amount'])} budget."
        )
    if ctx["emergency"]["shortfall"] > 0:
        monthly_fill = round2(min(ctx["emergency"]["shortfall"] / 12, max(ctx["disposable_this_month"], 0) or ctx["emergency"]["shortfall"] / 12))
        if monthly_fill > 0:
            plan.append(
                f"Move {fmt(monthly_fill)} to the emergency fund on salary day, before any "
                "discretionary spending."
            )
    if income > 0 and ctx["savings"]["savings_rate"] < target_rate:
        gap = round2(ctx["savings"]["savings_target"] - max(savings, 0))
        plan.append(f"Increase savings by {fmt(gap)} to reach your {target_rate:.0f}% target.")
    if behind_goals:
        g = behind_goals[0]
        plan.append(
            f"Raise the \"{g['name']}\" contribution to {fmt(g['required_monthly'])} a month, or "
            "push its target date back so the plan is realistic."
        )
    high_interest = [d for d in ctx["debt"]["items"] if d["interest_rate"] >= 15]
    if high_interest:
        plan.append(
            f"Direct any surplus at {high_interest[0]['name']} ({high_interest[0]['interest_rate']:.1f}%) "
            "before adding to investments."
        )
    elif invested == 0 and income > 0 and ctx["emergency"]["months_covered"] >= 3:
        plan.append(
            f"Restart the investment contribution - even {fmt(round2(income * 0.05))} keeps the habit alive."
        )
    buffer = round2(max(income * 0.08, 0))
    if buffer > 0 and len(plan) < 5:
        plan.append(f"Keep at least {fmt(buffer)} unallocated as a monthly buffer for irregular costs.")
    plan = plan[:5]

    summary = (
        f"In {month_name(month)} {year} you earned {fmt(income)}, spent {fmt(expenses)} and saved "
        f"{fmt(savings)} ({ctx['savings']['savings_rate']:.1f}%). Your financial health score is "
        f"{ctx['health_score']['score']}/100 ({ctx['health_score']['grade']}). "
        f"{ctx['health_score']['summary']}"
    )

    report = {
        "month": month,
        "year": year,
        "period_label": f"{month_name(month)} {year}",
        "currency": ctx["currency"],
        "currency_symbol": sym,
        "total_income": income,
        "total_expenses": expenses,
        "total_savings": savings,
        "total_invested": invested,
        "savings_rate": ctx["savings"]["savings_rate"],
        "health_score": ctx["health_score"]["score"],
        "health_grade": ctx["health_score"]["grade"],
        "top_categories": top_categories,
        "good_decisions": good,
        "problems": problems,
        "next_month_plan": plan,
        "summary": summary,
        "net_worth": ctx["net_worth"]["net_worth"],
        "generated_by": "RULE_BASED",
    }

    if persist:
        existing = db.scalar(
            select(MonthlyReport).where(
                MonthlyReport.user_id == user.id,
                MonthlyReport.month == month,
                MonthlyReport.year == year,
            )
        )
        payload = dict(
            total_income=income,
            total_expenses=expenses,
            total_savings=savings,
            total_invested=invested,
            savings_rate=ctx["savings"]["savings_rate"],
            health_score=ctx["health_score"]["score"],
            top_categories=json.dumps(top_categories),
            good_decisions=json.dumps(good),
            problems=json.dumps(problems),
            next_month_plan=json.dumps(plan),
            summary=summary,
            generated_by="RULE_BASED",
        )
        if existing:
            for k, v in payload.items():
                setattr(existing, k, v)
        else:
            db.add(MonthlyReport(user_id=user.id, month=month, year=year, **payload))
        db.commit()

    return report


# ---------------------------------------------------------------------------
# CSV exports
# ---------------------------------------------------------------------------

def expenses_to_csv(db: Session, user: User, month: Optional[int], year: Optional[int]) -> str:
    query = select(Expense).where(Expense.user_id == user.id)
    if month and year:
        start, end = month_range(year, month)
        query = query.where(Expense.spent_at >= start, Expense.spent_at <= end)
    rows = list(db.scalars(query.order_by(Expense.spent_at.desc())))

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Date", "Description", "Category", "Amount", "Payment method", "Fixed", "Notes"])
    for e in rows:
        writer.writerow(
            [
                e.spent_at.strftime("%Y-%m-%d"),
                e.description,
                e.category,
                f"{float(e.amount):.2f}",
                e.payment_method,
                "Yes" if e.is_fixed else "No",
                (e.notes or "").replace("\n", " "),
            ]
        )
    return buf.getvalue()


def report_to_csv(report: dict) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Finance Track - Monthly Report", report["period_label"]])
    writer.writerow([])
    writer.writerow(["Metric", "Value"])
    writer.writerow(["Total income", f"{report['total_income']:.2f}"])
    writer.writerow(["Total expenses", f"{report['total_expenses']:.2f}"])
    writer.writerow(["Total savings", f"{report['total_savings']:.2f}"])
    writer.writerow(["Total invested", f"{report['total_invested']:.2f}"])
    writer.writerow(["Savings rate (%)", f"{report['savings_rate']:.2f}"])
    writer.writerow(["Health score", f"{report['health_score']}/100 ({report['health_grade']})"])
    writer.writerow(["Net worth", f"{report['net_worth']:.2f}"])
    writer.writerow([])
    writer.writerow(["Top spending categories"])
    writer.writerow(["Category", "Amount", "Share (%)"])
    for c in report["top_categories"]:
        writer.writerow([c["category"], f"{c['amount']:.2f}", f"{c['share']:.1f}"])
    for title, key in (
        ("What went well", "good_decisions"),
        ("Problems", "problems"),
        ("Next month plan", "next_month_plan"),
    ):
        writer.writerow([])
        writer.writerow([title])
        for line in report[key]:
            writer.writerow([line])
    return buf.getvalue()


def net_worth_to_csv(snapshots: list) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Date", "Net worth", "Total assets", "Total liabilities", "Investments", "Savings"])
    for s in snapshots:
        writer.writerow(
            [
                s.taken_at.strftime("%Y-%m-%d"),
                f"{float(s.net_worth):.2f}",
                f"{float(s.total_assets):.2f}",
                f"{float(s.total_liabilities):.2f}",
                f"{float(s.investments):.2f}",
                f"{float(s.savings):.2f}",
            ]
        )
    return buf.getvalue()
