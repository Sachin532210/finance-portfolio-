from __future__ import annotations

import json
import math
import re
from typing import List, Optional, Tuple

from app.services.ai.client import chat_completion
from app.services.ai.prompts import PURCHASE_SYSTEM_PROMPT, SYSTEM_PROMPT
from app.services.finance.allocation import AllocationInput, build_allocation
from app.services.finance.helpers import money_str, round2
from app.services.finance.purchase import analyse_purchase

# ---------------------------------------------------------------------------
# Context sent to the model
# ---------------------------------------------------------------------------

def build_ai_payload(ctx: dict) -> dict:
    """
    Reduces the full financial context to exactly what the model needs.

    Deliberately excludes identifiers and contact details - the model never
    receives the user's email, name or database ids.
    """
    return {
        "currency": ctx["currency"],
        "currency_symbol": ctx["currency_symbol"],
        "period": ctx["month_label"],
        "days_left_in_month": ctx["spend"]["days_left"],
        "income": {
            "monthly_total": ctx["income"]["monthly"],
            "salary": ctx["profile"]["monthly_salary"],
            "other": ctx["profile"]["other_monthly_income"],
            "salary_day": ctx["profile"]["salary_day"],
            "employment_type": ctx["profile"]["employment_type"],
        },
        "expenses": {
            "month_to_date": ctx["spend"]["month_to_date"],
            "last_month": ctx["spend"]["last_month"],
            "projected_month_end": ctx["spend"]["projected_month_end"],
            "daily_average": ctx["spend"]["daily_average"],
            "essentials": ctx["spend"]["essentials"],
            "lifestyle": ctx["spend"]["lifestyle"],
            "by_category": [
                {"category": c["category"], "amount": c["amount"], "budget": c["budget"]}
                for c in ctx["spend"]["by_category"]
            ],
        },
        "budgets": [
            {
                "category": b["category"],
                "budget": b["amount"],
                "spent": b["spent"],
                "remaining": b["remaining"],
                "status": b["status"],
            }
            for b in ctx["budgets"]
        ],
        "savings": {
            "this_month": ctx["savings"]["monthly_savings"],
            "rate_pct": ctx["savings"]["savings_rate"],
            "target_rate_pct": ctx["profile"]["target_savings_rate"],
            "target_amount": ctx["savings"]["savings_target"],
            "total_saved": ctx["savings"]["total_saved"],
            "goals": [
                {
                    "name": g["name"],
                    "target": g["target_amount"],
                    "current": g["current_amount"],
                    "monthly": g["planned_monthly"],
                    "required_monthly": g["required_monthly"],
                    "status": g["status"],
                }
                for g in ctx["savings"]["goals"]
            ],
        },
        "emergency_fund": {
            "current": ctx["emergency"]["current"],
            "monthly_essentials": ctx["emergency"]["monthly_essentials"],
            "months_covered": ctx["emergency"]["months_covered"],
            "target_months": ctx["emergency"]["target_months"],
            "target_amount": ctx["emergency"]["target"],
            "shortfall": ctx["emergency"]["shortfall"],
        },
        "balances": {
            "bank": ctx["net_worth"]["bank"],
            "cash": ctx["net_worth"]["cash"],
            "net_worth": ctx["net_worth"]["net_worth"],
            "total_assets": ctx["net_worth"]["total_assets"],
            "total_liabilities": ctx["net_worth"]["total_liabilities"],
        },
        "investments": {
            "invested": ctx["portfolio"]["total_invested"],
            "current_value": ctx["portfolio"]["current_value"],
            "profit_loss": ctx["portfolio"]["profit_loss"],
            "profit_loss_pct": ctx["portfolio"]["profit_loss_pct"],
            "prices_are_live": ctx["portfolio"]["has_live_prices"],
            "allocation": ctx["portfolio"]["allocation"],
        },
        "debt": {
            "total_outstanding": ctx["debt"]["total_outstanding"],
            "monthly_emi": ctx["debt"]["monthly_emi"],
            "debt_to_income_pct": ctx["debt"]["debt_to_income_ratio"],
            "has_high_interest": ctx["debt"]["has_high_interest"],
            "loans": [
                {
                    "name": d["name"],
                    "outstanding": d["outstanding"],
                    "emi": d["emi"],
                    "rate_pct": d["interest_rate"],
                    "months_left": d["remaining_months"],
                }
                for d in ctx["debt"]["items"]
            ],
        },
        "goals": [
            {
                "name": g["name"],
                "horizon": g["horizon"],
                "target": g["target_amount"],
                "current": g["current_amount"],
                "monthly": g["planned_monthly"],
                "required_monthly": g["required_monthly"],
                "status": g["status"],
            }
            for g in ctx["goals"]
        ],
        "discretionary_available_this_month": ctx["disposable_this_month"],
        "recent_months": ctx["history"],
        "health_score": {
            "score": ctx["health_score"]["score"],
            "grade": ctx["health_score"]["grade"],
            "weaknesses": ctx["health_score"]["weaknesses"],
            "strengths": ctx["health_score"]["strengths"],
        },
    }


# ---------------------------------------------------------------------------
# Intent detection for the deterministic fallback
# ---------------------------------------------------------------------------

PRICE_RE = re.compile(
    r"(?:[₹$€£]\s*)?(\d[\d,]*(?:\.\d+)?)\s*(k|lakh|lakhs|l|cr|crore)?\b", re.IGNORECASE
)

BUY_WORDS = ("can i buy", "should i buy", "afford", "can i afford", "worth buying", "buy a", "buy this")


def extract_price(text: str) -> Optional[float]:
    """Pulls a monetary amount out of free text, understanding k / lakh / cr."""
    best: Optional[float] = None
    for match in PRICE_RE.finditer(text):
        raw, unit = match.group(1), (match.group(2) or "").lower()
        try:
            value = float(raw.replace(",", ""))
        except ValueError:
            continue
        if unit == "k":
            value *= 1_000
        elif unit in ("lakh", "lakhs", "l"):
            value *= 100_000
        elif unit in ("cr", "crore"):
            value *= 10_000_000
        # Ignore small integers that are probably counts or months.
        if value < 50 and not unit:
            continue
        if best is None or value > best:
            best = value
    return best


def extract_item_name(text: str) -> str:
    # Strip the amount first, whether or not it carries a currency symbol -
    # otherwise a bare "7,000" survives in the name as a stray "7 000".
    cleaned = re.sub(
        r"[₹$€£]?\s*\d[\d,]*(?:\.\d+)?\s*(k|lakhs?|cr|crores?)?",
        " ",
        text,
        flags=re.I,
    )
    cleaned = re.sub(
        r"\b(can|should|i|buy|a|an|the|this|afford|to|now|it|worth|is|for|my|please|help)\b",
        " ",
        cleaned,
        flags=re.I,
    )
    cleaned = re.sub(r"[^\w\s-]", " ", cleaned)
    cleaned = " ".join(cleaned.split())
    return cleaned[:60].strip() or "this purchase"


def detect_intent(question: str) -> str:
    q = question.lower()
    if any(w in q for w in BUY_WORDS):
        return "PURCHASE"
    if "salary" in q and any(w in q for w in ("manage", "plan", "allocate", "split", "divide")):
        return "SALARY_PLAN"
    if "emergency" in q:
        return "EMERGENCY"
    if any(w in q for w in ("wasting", "waste", "overspend", "spending too much", "too much")):
        return "WASTE"
    if "how long" in q or "how many months" in q or "when will i" in q:
        return "TIME_TO_GOAL"
    if "how much" in q and "save" in q:
        return "SAVINGS_TARGET"
    if "invest" in q:
        return "INVESTING"
    if any(w in q for w in ("next month", "improve", "change", "better", "habit")):
        return "IMPROVE"
    if any(w in q for w in ("net worth", "networth", "how much money", "balance")):
        return "NET_WORTH"
    if "debt" in q or "loan" in q or "emi" in q:
        return "DEBT"
    return "OVERVIEW"


# ---------------------------------------------------------------------------
# Deterministic coach - used when no API key is configured or the call fails
# ---------------------------------------------------------------------------

def rule_based_answer(ctx: dict, question: str) -> str:
    sym = ctx["currency_symbol"]
    fmt = lambda n: money_str(n, sym)  # noqa: E731
    intent = detect_intent(question)

    if intent == "PURCHASE":
        price = extract_price(question)
        if price is None:
            return (
                "Tell me the price and I will check it against your plan - for example "
                '"can I buy a 7,000 headphone?". You can also use the Decisions page, which '
                "scores a purchase across affordability, necessity, savings impact and goal impact."
            )
        analysis = analyse_purchase(
            ctx, item_name=extract_item_name(question), price=price, necessity="WANT"
        )
        lines = [analysis["headline"], ""]
        lines.extend(f"- {r}" for r in analysis["reasoning"])
        lines.append("")
        lines.append(f"Purchase score: {analysis['score']}/100 - {analysis['verdict_label']}.")
        return "\n".join(lines)

    if intent == "SALARY_PLAN":
        alloc = _allocation_for(ctx)
        lines = [
            f"Here is how your {fmt(alloc['income'])} splits this month:",
            "",
            f"- Essentials: {fmt(alloc['essentials'])}",
        ]
        if alloc["family"] > 0:
            lines.append(f"- Family: {fmt(alloc['family'])}")
        if alloc["debt_payments"] > 0:
            lines.append(f"- Debt EMIs: {fmt(alloc['debt_payments'])}")
        if alloc["emergency"] > 0:
            lines.append(f"- Emergency fund: {fmt(alloc['emergency'])}")
        lines.extend(
            [
                f"- Savings goals: {fmt(alloc['savings'])}",
                f"- Investments: {fmt(alloc['investments'])}",
                f"- Lifestyle: {fmt(alloc['lifestyle'])}",
                f"- Buffer: {fmt(alloc['buffer'])}",
                "",
            ]
        )
        lines.extend(alloc["rationale"][:4])
        if alloc["warnings"]:
            lines.append("")
            lines.append("Watch out: " + alloc["warnings"][0])
        return "\n".join(lines)

    if intent == "EMERGENCY":
        em = ctx["emergency"]
        if em["monthly_essentials"] <= 0:
            return (
                "I need your essential monthly costs before I can size an emergency fund. Add your "
                "rent, bills and other fixed expenses on the Expenses page and mark them as fixed."
            )
        return (
            f"Your essential monthly outgo is {fmt(em['monthly_essentials'])} (fixed expenses plus "
            f"EMIs).\n\n"
            f"- 3 months: {fmt(em['min_recommended'])}\n"
            f"- 6 months: {fmt(em['max_recommended'])}\n\n"
            f"You currently hold {fmt(em['current'])}, which covers {em['months_covered']:.1f} months. "
            + (
                f"That leaves a {fmt(em['shortfall'])} gap to your {em['target_months']}-month target. "
                f"Setting aside {fmt(round2(em['shortfall'] / 12))} a month closes it within a year."
                if em["shortfall"] > 0
                else "You are at or above your target, so surplus cash can go to goals or investments instead."
            )
        )

    if intent == "WASTE":
        cats = ctx["spend"]["by_category"]
        if not cats:
            return "No expenses are recorded this month yet, so there is nothing to analyse."
        lines = [f"You have spent {fmt(ctx['spend']['month_to_date'])} so far this month. The biggest items:", ""]
        for c in cats[:5]:
            note = ""
            if c["budget"]:
                used = c["amount"] / c["budget"] * 100 if c["budget"] else 0
                note = f" ({used:.0f}% of its {fmt(c['budget'])} budget)"
            lines.append(f"- {c['category'].title()}: {fmt(c['amount'])}, {c['share']:.0f}% of spending{note}")
        over = [b for b in ctx["budgets"] if b["status"] == "OVER"]
        lines.append("")
        if over:
            lines.append(
                f"{over[0]['category'].title()} is the clearest leak - it is {fmt(abs(over[0]['remaining']))} "
                f"over its {fmt(over[0]['amount'])} budget."
            )
        else:
            discretionary = [c for c in cats if c["category"] in ("SHOPPING", "ENTERTAINMENT", "SUBSCRIPTIONS")]
            if discretionary:
                total_disc = round2(sum(c["amount"] for c in discretionary))
                lines.append(
                    f"Discretionary categories (shopping, entertainment, subscriptions) total "
                    f"{fmt(total_disc)}. Cutting that by a quarter would free {fmt(round2(total_disc * 0.25))} a month."
                )
            else:
                lines.append("Nothing looks like obvious waste - your spending is concentrated in essentials.")
        return "\n".join(lines)

    if intent == "TIME_TO_GOAL":
        amount = extract_price(question)
        capacity = max(ctx["disposable_this_month"], ctx["savings"]["monthly_savings"], 0)
        if amount and capacity > 0:
            months = math.ceil(amount / capacity)
            return (
                f"At your current pace you have about {fmt(capacity)} a month spare, so "
                f"{fmt(amount)} would take roughly {months} month(s) - around "
                f"{round2(months / 12)} year(s).\n\n"
                "That assumes the pace holds and nothing is diverted to other goals. Raising the "
                f"monthly amount to {fmt(round2(amount / max(months - 2, 1)))} would pull it in by two months."
            )
        if amount:
            return (
                f"You currently have no spare monthly capacity, so {fmt(amount)} is not reachable on "
                "the present plan. Freeing money means cutting a fixed cost, cutting lifestyle "
                "spending, or increasing income - the Salary Planner shows where every unit goes."
            )
        goals = ctx["goals"] + ctx["savings"]["goals"]
        if not goals:
            return "You have no goals set yet. Add one on the Goals page and I can time it precisely."
        lines = ["Here is where each goal stands:", ""]
        for g in goals[:6]:
            if g["planned_monthly"] > 0:
                months = math.ceil(g["remaining_amount"] / g["planned_monthly"]) if g["remaining_amount"] > 0 else 0
                lines.append(
                    f"- {g['name']}: {fmt(g['current_amount'])} of {fmt(g['target_amount'])} "
                    f"({g['progress_pct']:.0f}%). About {months} month(s) left at {fmt(g['planned_monthly'])}/month."
                )
            else:
                lines.append(
                    f"- {g['name']}: {fmt(g['current_amount'])} of {fmt(g['target_amount'])} "
                    f"({g['progress_pct']:.0f}%). No monthly contribution set - it needs "
                    f"{fmt(g['required_monthly'])} to finish on time."
                )
        return "\n".join(lines)

    if intent == "SAVINGS_TARGET":
        income = ctx["income"]["monthly"]
        if income <= 0:
            return "Add your monthly income in Settings and I can size a savings target."
        target = ctx["savings"]["savings_target"]
        actual = ctx["savings"]["monthly_savings"]
        alloc = _allocation_for(ctx)
        return (
            f"Your target is {ctx['profile']['target_savings_rate']:.0f}% of {fmt(income)}, which is "
            f"{fmt(target)} a month. You are currently at {fmt(actual)} "
            f"({ctx['savings']['savings_rate']:.1f}%).\n\n"
            f"Based on your actual commitments, a realistic split this month puts {fmt(alloc['emergency'])} "
            f"into the emergency fund, {fmt(alloc['savings'])} into goals and {fmt(alloc['investments'])} "
            f"into investments - {fmt(round2(alloc['emergency'] + alloc['savings'] + alloc['investments']))} in total.\n\n"
            + (
                f"The {fmt(round2(target - actual))} gap has to come from lifestyle spending, which is "
                f"running at {fmt(ctx['spend']['lifestyle'])} this month."
                if actual < target
                else "You are already meeting the target."
            )
        )

    if intent == "INVESTING":
        pf = ctx["portfolio"]
        if ctx["debt"]["has_high_interest"]:
            worst = max(ctx["debt"]["items"], key=lambda d: d["interest_rate"])
            return (
                f"Before increasing investments, clear {worst['name']} - it charges "
                f"{worst['interest_rate']:.1f}% on {fmt(worst['outstanding'])}. Paying that down is a "
                f"guaranteed {worst['interest_rate']:.1f}% return, and no investment can promise that.\n\n"
                "Once the high-interest debt is gone, the emergency fund comes next, then investing."
            )
        if ctx["emergency"]["months_covered"] < 3:
            return (
                f"Your emergency fund covers {ctx['emergency']['months_covered']:.1f} months of "
                f"essentials, below the three-month floor ({fmt(ctx['emergency']['min_recommended'])}). "
                "Investing more before that buffer exists risks having to sell at a bad moment when "
                "something unexpected happens.\n\n"
                f"Fill the {fmt(ctx['emergency']['shortfall'])} gap first, then scale investments up."
            )
        alloc = _allocation_for(ctx)
        base = (
            f"Your portfolio holds {fmt(pf['current_value'])} against {fmt(pf['total_invested'])} "
            f"invested ({pf['profit_loss_pct']:+.1f}%). "
            if pf["total_invested"] > 0
            else "You have no investments recorded yet. "
        )
        return (
            base
            + f"With your commitments covered, {fmt(alloc['investments'])} a month is a sustainable "
            f"contribution at your {ctx['profile']['risk_tolerance'].lower()} risk setting.\n\n"
            "Returns are not guaranteed - values move up and down, and past performance does not "
            "predict future results. Consistency of contribution matters more than timing."
        )

    if intent == "DEBT":
        debt = ctx["debt"]
        if debt["total_outstanding"] <= 0:
            return "You have no active debt recorded. That is one less claim on your salary each month."
        lines = [
            f"You owe {fmt(debt['total_outstanding'])} across {len(debt['items'])} account(s), with "
            f"{fmt(debt['monthly_emi'])} in EMIs - {debt['debt_to_income_ratio']:.1f}% of your income.",
            "",
        ]
        for d in sorted(debt["items"], key=lambda d: -d["interest_rate"]):
            lines.append(
                f"- {d['name']}: {fmt(d['outstanding'])} at {d['interest_rate']:.1f}%, "
                f"{fmt(d['emi'])}/month, ~{d['remaining_months']} months left"
            )
        lines.append("")
        lines.append(
            "Paying the highest rate first (avalanche) costs the least in total interest. The Debt "
            "page simulates both that and the snowball order against your actual balances."
        )
        return "\n".join(lines)

    if intent == "NET_WORTH":
        nw = ctx["net_worth"]
        return (
            f"Your net worth is {fmt(nw['net_worth'])}.\n\n"
            f"- Assets: {fmt(nw['total_assets'])} (bank {fmt(nw['bank'])}, cash {fmt(nw['cash'])}, "
            f"savings {fmt(nw['savings'])}, investments {fmt(nw['investments'])})\n"
            f"- Liabilities: {fmt(nw['total_liabilities'])}\n\n"
            f"Spendable right now without touching savings or the emergency fund: "
            f"{fmt(max(ctx['disposable_this_month'], 0))} for the rest of this month."
        )

    if intent == "IMPROVE":
        hs = ctx["health_score"]
        lines = [f"Your financial health score is {hs['score']}/100 ({hs['grade']}).", "", hs["summary"], ""]
        if hs["weaknesses"]:
            lines.append("What to fix:")
            lines.extend(f"- {w}" for w in hs["weaknesses"][:4])
        if hs["strengths"]:
            lines.append("")
            lines.append("What is working:")
            lines.extend(f"- {s}" for s in hs["strengths"][:3])
        return "\n".join(lines)

    # --- OVERVIEW ---------------------------------------------------------
    hs = ctx["health_score"]
    return (
        f"Here is where you stand for {ctx['month_label']}:\n\n"
        f"- Income: {fmt(ctx['income']['monthly'])}\n"
        f"- Spent so far: {fmt(ctx['spend']['month_to_date'])} "
        f"(on pace for {fmt(ctx['spend']['projected_month_end'])})\n"
        f"- Saving: {fmt(ctx['savings']['monthly_savings'])} ({ctx['savings']['savings_rate']:.1f}%)\n"
        f"- Emergency fund: {fmt(ctx['emergency']['current'])} "
        f"({ctx['emergency']['months_covered']:.1f} months of essentials)\n"
        f"- Debt: {fmt(ctx['debt']['total_outstanding'])} outstanding, "
        f"{fmt(ctx['debt']['monthly_emi'])}/month\n"
        f"- Net worth: {fmt(ctx['net_worth']['net_worth'])}\n"
        f"- Health score: {hs['score']}/100 ({hs['grade']})\n\n"
        f"{hs['summary']}\n\n"
        "Ask me something specific - how to split this month's salary, whether you can afford a "
        "purchase, or where your money is leaking."
    )


def _allocation_for(ctx: dict) -> dict:
    family = next((c["amount"] for c in ctx["spend"]["by_category"] if c["category"] == "FAMILY"), 0.0)
    goal_required = round2(
        sum(g["required_monthly"] for g in ctx["goals"] + ctx["savings"]["goals"] if g["status"] != "COMPLETE")
    )
    return build_allocation(
        AllocationInput(
            salary=ctx["profile"]["monthly_salary"] or ctx["income"]["monthly"],
            other_income=ctx["profile"]["other_monthly_income"],
            essential_expenses=max(ctx["spend"]["essentials"], ctx["fixed_monthly_expenses"]),
            family_contribution=family,
            emi_total=ctx["debt"]["monthly_emi"],
            observed_lifestyle_spend=ctx["spend"]["lifestyle"],
            emergency_fund_current=ctx["emergency"]["current"],
            emergency_fund_target=ctx["emergency"]["target"],
            goal_required_monthly=goal_required,
            target_savings_rate=ctx["profile"]["target_savings_rate"],
            risk_tolerance=ctx["profile"]["risk_tolerance"],
            high_interest_debt=ctx["debt"]["has_high_interest"],
            currency_symbol=ctx["currency_symbol"],
        )
    ).as_dict()


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------

def answer_question(
    ctx: dict, question: str, history: Optional[List[dict]] = None
) -> Tuple[str, str]:
    """
    Answers a coach question.

    Returns (answer, generated_by) where generated_by is "AI" or "RULE_BASED".
    The rule-based path is not a stub: it runs the same financial engine and is
    what the model would be explaining anyway.
    """
    payload = build_ai_payload(ctx)

    # Purchase questions get the deterministic verdict attached so the model
    # explains it rather than inventing its own answer.
    purchase_block = None
    if detect_intent(question) == "PURCHASE":
        price = extract_price(question)
        if price:
            purchase_block = analyse_purchase(
                ctx, item_name=extract_item_name(question), price=price, necessity="WANT"
            )

    messages: List[dict] = []
    for msg in (history or [])[-6:]:
        if msg.get("role") in ("user", "assistant") and msg.get("content"):
            messages.append({"role": msg["role"], "content": msg["content"][:2000]})

    user_content = f"USER_FINANCIAL_DATA:\n{json.dumps(payload, default=str)}\n\n"
    if purchase_block:
        user_content += (
            "PURCHASE_ANALYSIS (authoritative - explain this verdict, do not overrule it):\n"
            f"{json.dumps(purchase_block, default=str)}\n\n"
        )
    user_content += f"QUESTION: {question}"
    messages.append({"role": "user", "content": user_content})

    reply = chat_completion(
        PURCHASE_SYSTEM_PROMPT if purchase_block else SYSTEM_PROMPT, messages
    )
    if reply:
        return reply, "AI"
    return rule_based_answer(ctx, question), "RULE_BASED"


def explain_purchase(ctx: dict, analysis: dict) -> Tuple[str, str]:
    """Turns a purchase analysis into prose, via the model when available."""
    payload = build_ai_payload(ctx)
    content = (
        f"USER_FINANCIAL_DATA:\n{json.dumps(payload, default=str)}\n\n"
        "PURCHASE_ANALYSIS (authoritative):\n"
        f"{json.dumps(analysis, default=str)}\n\n"
        f"QUESTION: Should I buy {analysis['item_name']} for "
        f"{analysis['price']}? Explain the verdict."
    )
    reply = chat_completion(PURCHASE_SYSTEM_PROMPT, [{"role": "user", "content": content}])
    if reply:
        return reply, "AI"
    return "\n".join([analysis["headline"], "", *[f"- {r}" for r in analysis["reasoning"]]]), "RULE_BASED"


def suggested_questions(ctx: dict) -> List[str]:
    """Context-aware prompt chips shown above the chat input."""
    qs: List[str] = ["How should I manage my salary this month?"]
    if ctx["emergency"]["months_covered"] < 3:
        qs.append("How much emergency fund should I have?")
    if any(b["status"] in ("OVER", "WARNING") for b in ctx["budgets"]):
        qs.append("Why am I spending too much?")
    if ctx["savings"]["savings_rate"] < ctx["profile"]["target_savings_rate"]:
        qs.append("How much should I save?")
    if ctx["debt"]["total_outstanding"] > 0:
        qs.append("How should I pay off my debt?")
    if ctx["portfolio"]["total_invested"] > 0 or ctx["income"]["monthly"] > 0:
        qs.append("Should I increase my investment?")
    qs.append("Where am I wasting money?")
    qs.append("What should I change next month?")
    return qs[:6]
