"""Shared vocabulary for categories, types and the financial disclaimer."""

from __future__ import annotations

EXPENSE_CATEGORIES = [
    "FOOD",
    "RENT",
    "TRAVEL",
    "SHOPPING",
    "BILLS",
    "ENTERTAINMENT",
    "EDUCATION",
    "HEALTH",
    "FAMILY",
    "SUBSCRIPTIONS",
    "OTHER",
]

# Categories treated as essential ("needs") by the planner and health score.
ESSENTIAL_CATEGORIES = {"RENT", "BILLS", "HEALTH", "EDUCATION", "FAMILY", "TRAVEL"}
LIFESTYLE_CATEGORIES = {"SHOPPING", "ENTERTAINMENT", "SUBSCRIPTIONS"}

# Food is split rather than forced into one bucket: groceries are a need,
# eating out is not.
FOOD_ESSENTIAL_SHARE = 0.70

PAYMENT_METHODS = ["CASH", "UPI", "DEBIT_CARD", "CREDIT_CARD", "BANK_TRANSFER", "OTHER"]
INCOME_CATEGORIES = ["SALARY", "FREELANCE", "BONUS", "INTEREST", "RENTAL", "GIFT", "OTHER"]
EMPLOYMENT_TYPES = ["SALARIED", "FREELANCE", "BUSINESS", "STUDENT", "OTHER"]
INVESTMENT_TYPES = ["STOCK", "MUTUAL_FUND", "ETF", "GOLD", "FD", "CRYPTO", "OTHER"]
DEBT_TYPES = [
    "PERSONAL_LOAN",
    "HOME_LOAN",
    "VEHICLE_LOAN",
    "EDUCATION_LOAN",
    "CREDIT_CARD",
    "OTHER",
]
SAVINGS_CATEGORIES = [
    "EMERGENCY",
    "GADGET",
    "VEHICLE",
    "EDUCATION",
    "TRAVEL",
    "FAMILY",
    "HOME",
    "GENERAL",
]
GOAL_HORIZONS = ["SHORT", "MEDIUM", "LONG"]
FUTURE_PLAN_CATEGORIES = [
    "VEHICLE",
    "EDUCATION",
    "BUSINESS",
    "HOUSE",
    "MARRIAGE",
    "TRAVEL",
    "RETIREMENT",
    "INDEPENDENCE",
    "OTHER",
]
RISK_TOLERANCES = ["CONSERVATIVE", "MODERATE", "AGGRESSIVE"]
NECESSITY_LEVELS = ["NEED", "WANT", "MIXED"]
PURCHASE_VERDICTS = ["BUY_NOW", "PLAN_AND_BUY", "WAIT", "SAVE_FIRST", "AVOID"]

CURRENCY_SYMBOLS = {
    "INR": "₹",
    "USD": "$",
    "EUR": "€",
    "GBP": "£",
    "AED": "AED ",
    "SGD": "S$",
    "AUD": "A$",
    "CAD": "C$",
}

DISCLAIMER = (
    "Finance Track is a personal finance planning and educational tool, not a licensed "
    "financial advisor. Projections are estimates based on the assumptions you provide. "
    "Investment values fluctuate, and past performance does not guarantee future results."
)

AI_DISCLAIMER_SHORT = (
    "Educational guidance based on your own data - not licensed financial advice."
)


def currency_symbol(code: str) -> str:
    return CURRENCY_SYMBOLS.get((code or "INR").upper(), "")
