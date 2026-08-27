from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.insights import Notification
from app.models.user import NotificationPreference
from app.services.finance.helpers import money_str, round2


@dataclass
class Insight:
    type: str
    severity: str  # INFO | WARNING | CRITICAL | SUCCESS
    title: str
    message: str
    action_url: Optional[str] = None
    dedupe_key: Optional[str] = None


# Maps each rule type to the preference flag that can silence it.
PREF_FOR_TYPE = {
    "BUDGET_WARNING": "budget_warnings",
    "GOAL_REMINDER": "goal_reminders",
    "SAVINGS_REMINDER": "savings_reminders",
    "INVESTMENT_UPDATE": "investment_updates",
    "UPCOMING_EMI": "upcoming_payments",
    "UPCOMING_BILL": "upcoming_payments",
    "MONTHLY_REVIEW": "monthly_review",
    "UNUSUAL_SPENDING": "unusual_spending",
}


def evaluate_rules(ctx: dict) -> List[Insight]:
    """
    Runs every financial rule against the current context.

    Each insight cites the actual number that triggered it, so the user can
    verify the claim rather than trusting a generic warning.
    """
    sym = ctx.get("currency_symbol", "")
    fmt = lambda n: money_str(n, sym)  # noqa: E731
    period = f"{ctx['year']}-{ctx['month']:02d}"
    out: List[Insight] = []

    income = ctx["income"]["monthly"]
    spend = ctx["spend"]

    # --- Budgets -----------------------------------------------------------
    for b in ctx["budgets"]:
        if b["status"] == "OVER":
            out.append(
                Insight(
                    "BUDGET_WARNING",
                    "CRITICAL",
                    f"{b['category'].title()} budget exceeded",
                    f"You are {fmt(abs(b['remaining']))} over your {b['category'].lower()} budget "
                    f"of {fmt(b['amount'])} ({b['used_pct']:.0f}% used). Further spending here comes "
                    "straight out of savings.",
                    "/budget",
                    f"budget-over-{b['category']}-{period}",
                )
            )
        elif b["status"] == "WARNING":
            out.append(
                Insight(
                    "BUDGET_WARNING",
                    "WARNING",
                    f"{b['category'].title()} budget at {b['used_pct']:.0f}%",
                    f"You have used {b['used_pct']:.0f}% of your {b['category'].lower()} budget with "
                    f"{spend['days_left']} days left in the month. {fmt(b['remaining'])} remains.",
                    "/budget",
                    f"budget-warn-{b['category']}-{period}",
                )
            )

    # --- Spending pace -----------------------------------------------------
    if income > 0 and spend["projected_month_end"] > income:
        out.append(
            Insight(
                "UNUSUAL_SPENDING",
                "CRITICAL",
                "Spending is on pace to exceed income",
                f"At {fmt(spend['daily_average'])} a day you are on track to spend "
                f"{fmt(spend['projected_month_end'])} this month against income of {fmt(income)}. "
                "That is a deficit month unless the pace slows.",
                "/expenses",
                f"overspend-pace-{period}",
            )
        )
    elif spend["last_month"] > 0 and spend["vs_last_month_pct"] > 25 and spend["days_elapsed"] >= 10:
        out.append(
            Insight(
                "UNUSUAL_SPENDING",
                "WARNING",
                f"Spending up {spend['vs_last_month_pct']:.0f}% versus last month",
                f"You have spent {fmt(spend['month_to_date'])} so far against "
                f"{fmt(spend['last_month'])} for all of last month. The largest category is "
                f"{spend['by_category'][0]['category'].lower()} at "
                f"{fmt(spend['by_category'][0]['amount'])}."
                if spend["by_category"]
                else f"You have spent {fmt(spend['month_to_date'])} so far this month.",
                "/expenses",
                f"spend-spike-{period}",
            )
        )

    # --- Savings rate ------------------------------------------------------
    target_rate = ctx["profile"]["target_savings_rate"]
    actual_rate = ctx["savings"]["savings_rate"]
    if income > 0 and actual_rate < target_rate * 0.5:
        out.append(
            Insight(
                "SAVINGS_REMINDER",
                "WARNING",
                "Savings rate well below target",
                f"You are saving {actual_rate:.1f}% of income against a {target_rate:.0f}% target. "
                f"Closing the gap means finding {fmt(ctx['savings']['savings_target'] - max(ctx['savings']['monthly_savings'], 0))} "
                "a month.",
                "/salary-planner",
                f"savings-low-{period}",
            )
        )
    elif income > 0 and actual_rate >= target_rate:
        out.append(
            Insight(
                "POSITIVE",
                "SUCCESS",
                f"Savings rate at {actual_rate:.1f}%",
                f"You are saving {fmt(ctx['savings']['monthly_savings'])} this month, at or above "
                f"your {target_rate:.0f}% target. Keep the contribution steady.",
                "/dashboard",
                f"savings-good-{period}",
            )
        )

    # --- Emergency fund ----------------------------------------------------
    em = ctx["emergency"]
    if em["monthly_essentials"] > 0:
        if em["months_covered"] < 1:
            out.append(
                Insight(
                    "SAVINGS_REMINDER",
                    "CRITICAL",
                    "Emergency fund under one month",
                    f"Your emergency fund covers {em['months_covered']:.1f} months of essentials "
                    f"({fmt(em['monthly_essentials'])} a month). You are {fmt(em['shortfall'])} short "
                    f"of a {em['target_months']}-month buffer.",
                    "/savings",
                    f"emergency-critical-{period}",
                )
            )
        elif em["months_covered"] < 3:
            out.append(
                Insight(
                    "SAVINGS_REMINDER",
                    "WARNING",
                    "Emergency fund below the 3-month floor",
                    f"You have {fmt(em['current'])} saved, covering {em['months_covered']:.1f} months. "
                    f"Three months of essentials would be {fmt(em['min_recommended'])}.",
                    "/savings",
                    f"emergency-low-{period}",
                )
            )

    # --- Debt --------------------------------------------------------------
    debt = ctx["debt"]
    if debt["debt_to_income_ratio"] > 36:
        out.append(
            Insight(
                "UPCOMING_EMI",
                "CRITICAL",
                f"Debt-to-income ratio at {debt['debt_to_income_ratio']:.0f}%",
                f"EMIs of {fmt(debt['monthly_emi'])} take {debt['debt_to_income_ratio']:.0f}% of your "
                "income. Above 36% is widely treated as financial stress. The Debt page compares "
                "avalanche and snowball payoff orders.",
                "/debt",
                f"dti-high-{period}",
            )
        )
    if debt["has_high_interest"]:
        worst = max(debt["items"], key=lambda d: d["interest_rate"])
        out.append(
            Insight(
                "UPCOMING_EMI",
                "WARNING",
                "High-interest debt outstanding",
                f"{worst['name']} carries {worst['interest_rate']:.1f}% interest on "
                f"{fmt(worst['outstanding'])}. Paying this down returns a guaranteed "
                f"{worst['interest_rate']:.1f}% - more than most investments reliably deliver.",
                "/debt",
                f"high-interest-{worst['id']}",
            )
        )

    # --- Upcoming EMIs -----------------------------------------------------
    today = ctx["as_of"].day if isinstance(ctx["as_of"], datetime) else datetime.utcnow().day
    for d in debt["items"]:
        days_away = d["due_day"] - today
        if 0 <= days_away <= 5 and d["emi"] > 0:
            out.append(
                Insight(
                    "UPCOMING_EMI",
                    "INFO",
                    f"{d['name']} EMI due in {days_away} day(s)",
                    f"{fmt(d['emi'])} is due on day {d['due_day']} of this month.",
                    "/calendar",
                    f"emi-due-{d['id']}-{period}",
                )
            )

    # --- Investments -------------------------------------------------------
    invested_this_month = ctx["history"][-1]["invested"] if ctx["history"] else 0
    if invested_this_month == 0 and income > 0 and ctx["portfolio"]["holdings_count"] > 0:
        out.append(
            Insight(
                "INVESTMENT_UPDATE",
                "INFO",
                "No investment contribution recorded this month",
                "You hold investments but have not recorded a contribution this month. Consistency "
                "matters more than timing for long-term outcomes.",
                "/investments",
                f"no-investment-{period}",
            )
        )
    if ctx["portfolio"]["total_invested"] > 0:
        pl = ctx["portfolio"]["profit_loss"]
        out.append(
            Insight(
                "INVESTMENT_UPDATE",
                "SUCCESS" if pl >= 0 else "INFO",
                f"Portfolio {'up' if pl >= 0 else 'down'} {fmt(abs(pl))}",
                f"Your portfolio is worth {fmt(ctx['portfolio']['current_value'])} against "
                f"{fmt(ctx['portfolio']['total_invested'])} invested "
                f"({ctx['portfolio']['profit_loss_pct']:+.1f}%). "
                + (
                    "These figures use live market prices."
                    if ctx["portfolio"]["has_live_prices"]
                    else "These figures use the prices you entered, not live market data."
                ),
                "/investments",
                f"portfolio-status-{period}",
            )
        )

    # --- Goals -------------------------------------------------------------
    for g in ctx["goals"] + ctx["savings"]["goals"]:
        if g["status"] == "BEHIND":
            gap = round2(g["required_monthly"] - g["planned_monthly"])
            out.append(
                Insight(
                    "GOAL_REMINDER",
                    "WARNING",
                    f"\"{g['name']}\" is behind schedule",
                    f"You are contributing {fmt(g['planned_monthly'])} a month but need "
                    f"{fmt(g['required_monthly'])} to hit {fmt(g['target_amount'])} on time - a gap "
                    f"of {fmt(gap)}. Extending the date or lowering the target also closes it.",
                    "/goals",
                    f"goal-behind-{g['id']}",
                )
            )
        elif g["status"] == "COMPLETE":
            out.append(
                Insight(
                    "POSITIVE",
                    "SUCCESS",
                    f"\"{g['name']}\" reached",
                    f"You have hit the {fmt(g['target_amount'])} target for {g['name']}.",
                    "/goals",
                    f"goal-complete-{g['id']}",
                )
            )

    # --- Subscription creep ------------------------------------------------
    subs = next((c for c in spend["by_category"] if c["category"] == "SUBSCRIPTIONS"), None)
    if subs and income > 0 and subs["amount"] > income * 0.08:
        out.append(
            Insight(
                "UNUSUAL_SPENDING",
                "WARNING",
                "Subscription spending is high",
                f"Subscriptions cost {fmt(subs['amount'])} this month - "
                f"{subs['amount'] / income * 100:.1f}% of your income. Recurring charges are the "
                "easiest spend to cut because cancelling once fixes it permanently.",
                "/expenses",
                f"subs-high-{period}",
            )
        )

    # --- Large single purchases -------------------------------------------
    if income > 0:
        big = [c for c in spend["by_category"] if c["amount"] > income * 0.25 and c["category"] in ("SHOPPING", "ENTERTAINMENT")]
        for c in big:
            out.append(
                Insight(
                    "UNUSUAL_SPENDING",
                    "WARNING",
                    f"Large {c['category'].lower()} spend this month",
                    f"{fmt(c['amount'])} on {c['category'].lower()} is {c['amount'] / income * 100:.0f}% "
                    "of your monthly income. Worth checking whether this was planned or impulsive.",
                    "/expenses",
                    f"large-{c['category']}-{period}",
                )
            )

    return out


def persist_insights(db: Session, user_id: str, insights: List[Insight]) -> int:
    """
    Writes new insights as notifications, honouring the user's preferences and
    skipping anything already delivered (dedupe_key).
    """
    prefs = db.scalar(select(NotificationPreference).where(NotificationPreference.user_id == user_id))

    existing_keys = set(
        db.scalars(
            select(Notification.dedupe_key).where(
                Notification.user_id == user_id, Notification.dedupe_key.is_not(None)
            )
        )
    )

    created = 0
    for ins in insights:
        pref_field = PREF_FOR_TYPE.get(ins.type)
        if prefs is not None and pref_field and not getattr(prefs, pref_field, True):
            continue
        if ins.dedupe_key and ins.dedupe_key in existing_keys:
            continue

        # Each insert gets its own savepoint. Two dashboard loads can race here
        # (the browser fires them concurrently), and the loser of that race must
        # simply skip its duplicate rather than failing the whole request.
        try:
            with db.begin_nested():
                db.add(
                    Notification(
                        user_id=user_id,
                        type=ins.type,
                        severity=ins.severity,
                        title=ins.title,
                        message=ins.message,
                        action_url=ins.action_url,
                        dedupe_key=ins.dedupe_key,
                    )
                )
            created += 1
        except IntegrityError:
            # Another request inserted this exact alert a moment ago.
            pass

        if ins.dedupe_key:
            existing_keys.add(ins.dedupe_key)

    db.commit()
    return created
