from __future__ import annotations

import math
from typing import List, Optional

from app.services.finance.helpers import clamp, money_str, round2

WEIGHTS = {
    "affordability": 35,
    "necessity": 20,
    "savings_impact": 20,
    "goal_impact": 15,
    "stability": 10,
}

VERDICT_LABEL = {
    "BUY_NOW": "Buy now",
    "PLAN_AND_BUY": "Plan and buy",
    "WAIT": "Wait",
    "SAVE_FIRST": "Save first",
    "AVOID": "Avoid",
}


def analyse_purchase(
    ctx: dict,
    *,
    item_name: str,
    price: float,
    necessity: str = "WANT",
    category: str = "OTHER",
    on_credit: bool = False,
) -> dict:
    """
    The deterministic engine behind "Can I buy this?" and the purchase score.

    The AI layer never invents these numbers - it receives this analysis and
    explains it in prose. That keeps the recommendation reproducible and
    prevents an irresponsible answer even when the model is unavailable.
    """
    sym = ctx.get("currency_symbol", "")
    fmt = lambda n: money_str(n, sym)  # noqa: E731

    price = max(0.0, round2(price))
    income = ctx["income"]["monthly"]
    disposable = ctx["disposable_this_month"]
    liquid = round2(ctx["net_worth"]["cash"] + ctx["net_worth"]["bank"])
    emergency_current = ctx["emergency"]["current"]
    non_emergency_liquid = round2(max(0.0, liquid - emergency_current))

    factors: List[dict] = []
    reasoning: List[str] = []

    # --- 1. Affordability --------------------------------------------------
    affordable_today = price <= max(disposable, 0)
    if price == 0:
        afford_score = float(WEIGHTS["affordability"])
        afford_detail = "No price entered."
    elif disposable >= price:
        afford_score = float(WEIGHTS["affordability"])
        afford_detail = (
            f"Your discretionary money for this month ({fmt(disposable)}) covers the full price."
        )
    elif non_emergency_liquid >= price:
        ratio = clamp(disposable / price, 0, 1) if price else 0
        afford_score = round2(WEIGHTS["affordability"] * (0.35 + ratio * 0.4))
        afford_detail = (
            f"This month's discretionary money ({fmt(max(disposable, 0))}) does not cover it, but "
            f"you hold {fmt(non_emergency_liquid)} in cash outside the emergency fund."
        )
    elif liquid >= price:
        afford_score = round2(WEIGHTS["affordability"] * 0.15)
        afford_detail = (
            "Paying for this would dip into your emergency fund, which exists for genuine "
            "emergencies."
        )
    else:
        afford_score = 0.0
        afford_detail = (
            f"You do not currently hold {fmt(price)} in cash. Buying this now would mean borrowing."
        )

    if on_credit:
        afford_score = round2(afford_score * 0.5)
        afford_detail += " Putting it on credit adds interest cost on top of the price."

    factors.append(
        {
            "key": "affordability",
            "label": "Affordability",
            "score": afford_score,
            "max": WEIGHTS["affordability"],
            "detail": afford_detail,
        }
    )

    # --- 2. Necessity ------------------------------------------------------
    necessity = (necessity or "WANT").upper()
    necessity_score = {
        "NEED": WEIGHTS["necessity"],
        "MIXED": WEIGHTS["necessity"] * 0.55,
        "WANT": WEIGHTS["necessity"] * 0.25,
    }.get(necessity, WEIGHTS["necessity"] * 0.25)
    necessity_detail = {
        "NEED": "Marked as a need - essential purchases score higher even when the timing is tight.",
        "MIXED": "Partly a need, partly a want.",
        "WANT": "Marked as a want, so the bar for buying immediately is higher.",
    }.get(necessity, "Marked as a want, so the bar for buying immediately is higher.")
    factors.append(
        {
            "key": "necessity",
            "label": "Necessity",
            "score": round2(necessity_score),
            "max": WEIGHTS["necessity"],
            "detail": necessity_detail,
        }
    )

    # --- 3. Impact on savings ----------------------------------------------
    savings_before = ctx["savings"]["monthly_savings"]
    savings_after = round2(savings_before - price)
    savings_target = ctx["savings"]["savings_target"]
    target_rate = ctx["profile"]["target_savings_rate"]
    savings_rate_after = round2(max(savings_after, 0) / income * 100) if income > 0 else 0.0

    if income <= 0:
        savings_score = WEIGHTS["savings_impact"] * 0.5
        savings_detail = "No income recorded, so the savings impact cannot be measured."
    elif savings_after >= savings_target:
        savings_score = float(WEIGHTS["savings_impact"])
        savings_detail = (
            f"You would still save {fmt(savings_after)} this month, at or above your "
            f"{target_rate:.0f}% target."
        )
    elif savings_after > 0:
        ratio = (savings_after / savings_target) if savings_target > 0 else 0
        savings_score = round2(WEIGHTS["savings_impact"] * clamp(ratio, 0, 1) * 0.8)
        savings_detail = (
            f"Savings would drop to {fmt(savings_after)} ({savings_rate_after:.1f}% of income), "
            f"below your {target_rate:.0f}% target of {fmt(savings_target)}."
        )
    else:
        savings_score = 0.0
        savings_detail = (
            f"This purchase would wipe out this month's savings entirely and leave you "
            f"{fmt(abs(savings_after))} short."
        )

    factors.append(
        {
            "key": "savings_impact",
            "label": "Impact on savings",
            "score": round2(savings_score),
            "max": WEIGHTS["savings_impact"],
            "detail": savings_detail,
        }
    )

    # --- 4. Impact on goals ------------------------------------------------
    active_goals = [g for g in (ctx["goals"] + ctx["savings"]["goals"]) if g["status"] != "COMPLETE"]
    candidates = [g for g in active_goals if g["planned_monthly"] > 0 or g["required_monthly"] > 0]
    nearest = sorted(candidates, key=lambda g: g["months_remaining"] if g["months_remaining"] is not None else 999)
    nearest_goal = nearest[0] if nearest else None

    goal_delay_months: Optional[float] = None
    goal_delayed: Optional[str] = None

    if nearest_goal is None:
        goal_score = WEIGHTS["goal_impact"] * 0.6
        goal_detail = "No active goal is competing for this money."
    else:
        monthly = max(nearest_goal["planned_monthly"], nearest_goal["required_monthly"])
        goal_delay_months = round(price / monthly, 1) if monthly > 0 else None
        goal_delayed = nearest_goal["name"]
        if goal_delay_months is None or goal_delay_months < 0.4:
            goal_score = float(WEIGHTS["goal_impact"])
            goal_detail = f"Barely moves your nearest goal ({nearest_goal['name']})."
        elif goal_delay_months <= 1.5:
            goal_score = round2(WEIGHTS["goal_impact"] * 0.6)
            goal_detail = (
                f"Would push \"{nearest_goal['name']}\" back by roughly {goal_delay_months} month(s)."
            )
        else:
            goal_score = round2(WEIGHTS["goal_impact"] * clamp(1 - goal_delay_months / 6, 0, 0.4))
            goal_detail = (
                f"Would push \"{nearest_goal['name']}\" back by roughly {goal_delay_months} months "
                "- a meaningful delay."
            )

    factors.append(
        {
            "key": "goal_impact",
            "label": "Impact on goals",
            "score": round2(goal_score),
            "max": WEIGHTS["goal_impact"],
            "detail": goal_detail,
        }
    )

    # --- 5. Financial stability --------------------------------------------
    stability_score = float(WEIGHTS["stability"])
    stability_notes: List[str] = []
    months_covered = ctx["emergency"]["months_covered"]
    if months_covered < 3:
        stability_score -= WEIGHTS["stability"] * 0.5
        stability_notes.append(
            f"your emergency fund covers only {months_covered:.1f} months of essentials"
        )
    high_interest = ctx["debt"]["has_high_interest"]
    if high_interest:
        stability_score -= WEIGHTS["stability"] * 0.35
        stability_notes.append("you carry debt above 15% interest")
    dti = ctx["debt"]["debt_to_income_ratio"]
    if dti > 36:
        stability_score -= WEIGHTS["stability"] * 0.25
        stability_notes.append(f"EMIs already take {dti:.0f}% of your income")

    stability_score = round2(clamp(stability_score, 0, WEIGHTS["stability"]))
    stability_detail = (
        f"Caution: {', '.join(stability_notes)}."
        if stability_notes
        else "Your emergency fund and debt levels leave room for discretionary spending."
    )
    factors.append(
        {
            "key": "stability",
            "label": "Financial stability",
            "score": stability_score,
            "max": WEIGHTS["stability"],
            "detail": stability_detail,
        }
    )

    # --- Score & verdict ---------------------------------------------------
    score = int(round(clamp(sum(f["score"] for f in factors), 0, 100)))

    if necessity == "NEED" and affordable_today:
        verdict = "BUY_NOW"
    elif score >= 75:
        verdict = "BUY_NOW"
    elif score >= 60:
        verdict = "PLAN_AND_BUY"
    elif score >= 42:
        verdict = "WAIT"
    elif score >= 25:
        verdict = "SAVE_FIRST"
    else:
        verdict = "AVOID"

    # Hard guards - these override a merely decent score.
    if price > 0 and liquid < price and not affordable_today and necessity != "NEED":
        if verdict in ("BUY_NOW", "PLAN_AND_BUY"):
            verdict = "SAVE_FIRST"
    if on_credit and high_interest:
        verdict = "AVOID"
        reasoning.append(
            "Adding a new credit purchase while carrying high-interest debt compounds the problem "
            "- the interest you pay will exceed any return you could earn elsewhere."
        )
    if price > income * 0.5 and months_covered < 3 and necessity != "NEED" and income > 0:
        if verdict != "AVOID":
            verdict = "SAVE_FIRST"
        reasoning.append(
            "This costs more than half a month's income while your emergency fund is under three "
            "months of essentials. Building the buffer first stops a surprise from turning into debt."
        )

    # --- Timing ------------------------------------------------------------
    monthly_capacity = max(disposable, round2(income * 0.05))
    months_to_save = math.ceil(price / monthly_capacity) if monthly_capacity > 0 and price > 0 else None
    wait_days = 0
    if verdict == "WAIT":
        wait_days = 30
    elif verdict == "SAVE_FIRST":
        wait_days = min(months_to_save, 12) * 30 if months_to_save else 60
    elif verdict == "PLAN_AND_BUY":
        wait_days = 14
    suggested_monthly = round2(price / max(months_to_save, 1)) if months_to_save else 0.0

    # --- Narrative ---------------------------------------------------------
    headline = _headline(verdict, item_name, fmt(price), wait_days)

    intro = f"{fmt(price)} is "
    intro += f"{price / income * 100:.0f}% of your monthly income" if income > 0 else "the full price"
    if disposable > 0:
        intro += f" and {price / disposable * 100:.0f}% of this month's discretionary money"
    reasoning.insert(0, intro + ".")
    reasoning.append(afford_detail)
    reasoning.append(savings_detail)
    if nearest_goal:
        reasoning.append(goal_detail)
    if stability_notes:
        reasoning.append(stability_detail)

    if verdict == "WAIT":
        reasoning.append(
            "A 30-day pause costs nothing. If you still want it next month, buy it then from that "
            "month's discretionary money instead of this month's savings."
        )
    elif verdict == "BUY_NOW":
        reasoning.append(
            "This fits inside your plan without pushing any goal or your savings rate off track."
        )

    return {
        "item_name": item_name,
        "price": price,
        "category": category,
        "necessity": necessity,
        "score": score,
        "verdict": verdict,
        "verdict_label": VERDICT_LABEL[verdict],
        "headline": headline,
        "reasoning": reasoning,
        "factors": factors,
        "affordable_today": affordable_today,
        "wait_days": wait_days,
        "months_to_save": months_to_save,
        "suggested_monthly_saving": suggested_monthly,
        "impact": {
            "disposable_before": disposable,
            "disposable_after": round2(disposable - price),
            "savings_before": savings_before,
            "savings_after": savings_after,
            "savings_rate_after": savings_rate_after,
            "emergency_fund_touched": non_emergency_liquid < price <= liquid,
            "percent_of_monthly_income": round2(price / income * 100) if income > 0 else 0.0,
            "percent_of_disposable": round2(price / disposable * 100) if disposable > 0 else 0.0,
            "goal_delay_months": goal_delay_months,
            "goal_delayed": goal_delayed,
        },
        "generated_by": "RULE_BASED",
    }


def _headline(verdict: str, item: str, price: str, wait_days: int) -> str:
    if verdict == "BUY_NOW":
        return f"Yes - {item} at {price} fits your plan this month."
    if verdict == "PLAN_AND_BUY":
        return f"Useful, but budget for it. Plan {item} into next month rather than buying on impulse."
    if verdict == "WAIT":
        return (
            f"Wait {wait_days} days. You can technically afford {item}, but it costs you more than "
            "it is worth right now."
        )
    if verdict == "SAVE_FIRST":
        return f"Save first. Set money aside for {item} rather than taking it from this month's savings."
    return f"Avoid for now. Buying {item} at {price} would damage your financial position."


# ---------------------------------------------------------------------------
# Smart Buying Guide
# ---------------------------------------------------------------------------

def build_buying_guide(ctx: dict) -> List[dict]:
    """
    Generates a buying guide from the user's own data: recurring leaks, budget
    pressure, unmet essentials and debt position.

    Nothing here is generic advice - every entry cites a number from the
    user's own account.
    """
    sym = ctx.get("currency_symbol", "")
    fmt = lambda n: money_str(n, sym)  # noqa: E731
    items: List[dict] = []
    income = ctx["income"]["monthly"]

    # --- Buy now -----------------------------------------------------------
    if ctx["emergency"]["months_covered"] < 1 and income > 0:
        suggested = min(
            ctx["disposable_this_month"] if ctx["disposable_this_month"] > 0
            else ctx["emergency"]["monthly_essentials"] * 0.25,
            ctx["emergency"]["shortfall"],
        )
        items.append(
            {
                "name": "Top up your emergency fund",
                "bucket": "BUY_NOW",
                "reason": (
                    f"You have under one month of essentials saved. Before any discretionary "
                    f"purchase, move {fmt(max(suggested, 0))} into the emergency fund. This is the "
                    "single highest-value use of spare cash you have."
                ),
                "estimated_amount": ctx["emergency"]["shortfall"],
            }
        )

    # --- Plan & buy --------------------------------------------------------
    if not any(c["category"] == "HEALTH" for c in ctx["spend"]["by_category"]) and income > 0:
        items.append(
            {
                "name": "Health cover / preventive care",
                "bucket": "PLAN_AND_BUY",
                "reason": (
                    "No health spending is recorded in your account. An uninsured medical event is "
                    "the most common cause of emergency-fund wipeouts, so budgeting for cover is "
                    "worth pricing out."
                ),
                "estimated_amount": None,
            }
        )

    for b in [b for b in ctx["budgets"] if b["used_pct"] < 60 and b["remaining"] > 0][:2]:
        items.append(
            {
                "name": f"{b['category'].title()} purchases within budget",
                "bucket": "PLAN_AND_BUY",
                "reason": (
                    f"You have {fmt(b['remaining'])} left in your {b['category'].lower()} budget "
                    f"({b['used_pct']:.0f}% used). Spending inside this envelope will not disturb "
                    "your savings."
                ),
                "estimated_amount": b["remaining"],
            }
        )

    # --- Wait --------------------------------------------------------------
    for b in [b for b in ctx["budgets"] if b["status"] == "WARNING"][:3]:
        items.append(
            {
                "name": f"Further {b['category'].lower()} spending",
                "bucket": "WAIT",
                "reason": (
                    f"You have used {b['used_pct']:.0f}% of your {b['category'].lower()} budget with "
                    f"{ctx['spend']['days_left']} days left in the month. Hold off until it resets."
                ),
                "estimated_amount": None,
            }
        )

    if ctx["savings"]["savings_rate"] < ctx["profile"]["target_savings_rate"] and income > 0:
        items.append(
            {
                "name": "Lifestyle upgrades",
                "bucket": "WAIT",
                "reason": (
                    f"Your savings rate is {ctx['savings']['savings_rate']:.1f}% against a "
                    f"{ctx['profile']['target_savings_rate']:.0f}% target. Upgrading your lifestyle "
                    "before closing that gap locks in higher fixed costs that are hard to reverse."
                ),
                "estimated_amount": None,
            }
        )

    # --- Avoid -------------------------------------------------------------
    for b in [b for b in ctx["budgets"] if b["status"] == "OVER"][:3]:
        items.append(
            {
                "name": f"More {b['category'].lower()} spending this month",
                "bucket": "AVOID",
                "reason": (
                    f"You are {fmt(abs(b['remaining']))} over your {b['category'].lower()} budget "
                    "already. Anything more comes directly out of savings."
                ),
                "estimated_amount": None,
            }
        )

    subs = next((c for c in ctx["spend"]["by_category"] if c["category"] == "SUBSCRIPTIONS"), None)
    if subs and income > 0 and subs["amount"] > income * 0.05:
        items.append(
            {
                "name": "New subscriptions",
                "bucket": "AVOID",
                "reason": (
                    f"Subscriptions already cost {fmt(subs['amount'])} a month, which is "
                    f"{subs['amount'] / income * 100:.1f}% of your income. Recurring charges compound "
                    "quietly - audit the existing ones before adding another."
                ),
                "estimated_amount": subs["amount"],
            }
        )

    high_interest = [d for d in ctx["debt"]["items"] if d["interest_rate"] >= 15 and d["outstanding"] > 0]
    if high_interest:
        owed = sum(d["outstanding"] for d in high_interest)
        items.append(
            {
                "name": "Anything bought on credit",
                "bucket": "AVOID",
                "reason": (
                    f"You carry {fmt(owed)} at {high_interest[0]['interest_rate']:.0f}%+ interest. "
                    "Paying that down is a guaranteed return equal to the interest rate - no "
                    "purchase or investment reliably beats that."
                ),
                "estimated_amount": owed,
            }
        )

    if not items:
        items.append(
            {
                "name": "You have room to spend",
                "bucket": "BUY_NOW",
                "reason": (
                    f"Budgets are on track, your emergency fund covers "
                    f"{ctx['emergency']['months_covered']:.1f} months, and your savings rate is "
                    f"{ctx['savings']['savings_rate']:.1f}%. Discretionary purchases inside "
                    f"{fmt(max(ctx['disposable_this_month'], 0))} this month will not disturb your plan."
                ),
                "estimated_amount": max(ctx["disposable_this_month"], 0),
            }
        )

    return items
