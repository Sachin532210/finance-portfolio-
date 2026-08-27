from __future__ import annotations

import math
from typing import List, Optional

from app.services.finance.helpers import round2

MAX_SIMULATION_MONTHS = 600  # 50 years - guards against non-amortising input


def calculate_emi(principal: float, annual_rate_pct: float, months: int) -> float:
    """Standard EMI formula."""
    if months <= 0:
        return round2(principal)
    r = annual_rate_pct / 100 / 12
    if r == 0:
        return round2(principal / months)
    factor = (1 + r) ** months
    return round2((principal * r * factor) / (factor - 1))


def payoff_months(balance: float, payment: float, annual_rate_pct: float) -> Optional[int]:
    """Months to clear a balance at a fixed payment. None if it never clears."""
    if balance <= 0:
        return 0
    if payment <= 0:
        return None
    r = annual_rate_pct / 100 / 12
    if r == 0:
        return math.ceil(balance / payment)
    if payment <= balance * r:
        return None  # payment does not even cover the interest
    return math.ceil(-math.log(1 - (balance * r) / payment) / math.log(1 + r))


def estimate_remaining_interest(
    outstanding: float, emi: float, interest_rate: float, remaining_months: int
) -> float:
    """Total interest still payable, given the EMI and rate."""
    if outstanding <= 0:
        return 0.0
    monthly_rate = interest_rate / 100 / 12
    if monthly_rate <= 0:
        return 0.0
    monthly_interest = outstanding * monthly_rate
    if emi <= 0:
        return round2(monthly_interest * max(remaining_months, 0))
    if emi <= monthly_interest:
        # The balance grows: report interest across the stated tenure rather
        # than an infinite payoff.
        return round2(monthly_interest * max(remaining_months, 12))
    months = payoff_months(outstanding, emi, interest_rate)
    if months is None:
        return round2(monthly_interest * max(remaining_months, 12))
    return round2(emi * months - outstanding)


def simulate_payoff(debts: List[dict], method: str = "AVALANCHE", extra_payment: float = 0.0) -> dict:
    """
    Month-by-month simulation of paying every EMI plus `extra_payment`
    directed at one debt at a time.

    AVALANCHE targets the highest interest rate first (cheapest overall).
    SNOWBALL targets the smallest balance first (fastest first win).
    As each debt clears, its freed EMI rolls into the next one.
    """
    active = [
        {
            "id": d["id"],
            "name": d["name"],
            "balance": float(d["outstanding"]),
            "emi": float(d.get("emi") or 0),
            "rate": float(d.get("interest_rate") or 0),
            "interest_paid": 0.0,
            "cleared_at": 0,
        }
        for d in debts
        if float(d.get("outstanding") or 0) > 0
    ]

    if not active:
        return {
            "method": method,
            "steps": [],
            "total_months": 0,
            "total_interest": 0.0,
            "explanation": "No active debt to plan for.",
        }

    if method == "AVALANCHE":
        order = sorted(active, key=lambda d: -d["rate"])
    else:
        order = sorted(active, key=lambda d: d["balance"])

    month = 0
    freed_emi = 0.0

    while any(d["balance"] > 0 for d in order) and month < MAX_SIMULATION_MONTHS:
        month += 1
        extra = extra_payment + freed_emi
        target_id = next((d["id"] for d in order if d["balance"] > 0), None)

        for d in order:
            if d["balance"] <= 0:
                continue
            r = d["rate"] / 100 / 12
            interest = d["balance"] * r
            d["interest_paid"] += interest
            d["balance"] += interest

            payment = d["emi"] if d["emi"] > 0 else d["balance"]
            if d["id"] == target_id and extra > 0:
                payment += extra
                extra = 0.0
            payment = min(payment, d["balance"])
            d["balance"] = round2(d["balance"] - payment)

            if d["balance"] <= 0.01:
                d["balance"] = 0.0
                d["cleared_at"] = month
                freed_emi += d["emi"]

    steps = [
        {
            "debt_id": d["id"],
            "name": d["name"],
            "order": idx + 1,
            "months_to_clear": d["cleared_at"] or month,
            "interest_paid": round2(d["interest_paid"]),
        }
        for idx, d in enumerate(order)
    ]

    total_interest = round2(sum(s["interest_paid"] for s in steps))
    total_months = max((s["months_to_clear"] for s in steps), default=0)

    if method == "AVALANCHE":
        explanation = (
            f"Avalanche pays the highest interest rate first ({order[0]['name']} at "
            f"{order[0]['rate']:.1f}%). This costs the least in total interest, though the "
            "first payoff may take longer."
        )
    else:
        explanation = (
            f"Snowball clears the smallest balance first ({order[0]['name']}). You pay slightly "
            "more interest overall, but the early wins help if motivation is the harder problem."
        )

    return {
        "method": method,
        "steps": steps,
        "total_months": total_months,
        "total_interest": total_interest,
        "explanation": explanation,
    }


def extra_payment_impact(debts: List[dict], extra: float) -> dict:
    """What one extra payment per month saves against the baseline plan."""
    base = simulate_payoff(debts, "AVALANCHE", 0)
    boosted = simulate_payoff(debts, "AVALANCHE", extra)
    return {
        "extra_payment": round2(extra),
        "months_saved": max(0, base["total_months"] - boosted["total_months"]),
        "interest_saved": round2(max(0.0, base["total_interest"] - boosted["total_interest"])),
        "baseline_months": base["total_months"],
        "new_months": boosted["total_months"],
        "baseline_interest": base["total_interest"],
        "new_interest": boosted["total_interest"],
    }
