from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.core.constants import (
    DEBT_TYPES,
    EMPLOYMENT_TYPES,
    EXPENSE_CATEGORIES,
    FUTURE_PLAN_CATEGORIES,
    GOAL_HORIZONS,
    INCOME_CATEGORIES,
    INVESTMENT_TYPES,
    PAYMENT_METHODS,
    RISK_TOLERANCES,
    SAVINGS_CATEGORIES,
)
from app.schemas.common import ORMModel

Amount = Field(ge=0, le=1_000_000_000)


def _in(name: str, allowed: list[str]):
    def validator(v: str) -> str:
        if v is None:
            return v
        v = v.upper()
        if v not in allowed:
            raise ValueError(f"{name} must be one of: {', '.join(allowed)}")
        return v

    return validator


# ---------------------------------------------------------------------------
# Financial profile / onboarding
# ---------------------------------------------------------------------------

class FixedExpenseInput(BaseModel):
    """A recurring commitment captured during onboarding."""

    category: str
    description: str = Field(min_length=1, max_length=200)
    amount: float = Amount

    _cat = field_validator("category")(_in("category", EXPENSE_CATEGORIES))


class DebtInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: str = "PERSONAL_LOAN"
    principal: float = Amount
    outstanding: float = Amount
    emi: float = Field(default=0, ge=0)
    interest_rate: float = Field(default=0, ge=0, le=100)
    remaining_months: int = Field(default=0, ge=0, le=600)
    due_day: int = Field(default=5, ge=1, le=31)

    _type = field_validator("type")(_in("type", DEBT_TYPES))


class OnboardingRequest(BaseModel):
    # Income
    monthly_salary: float = Field(default=0, ge=0, le=1_000_000_000)
    salary_day: int = Field(default=1, ge=1, le=31)
    other_monthly_income: float = Field(default=0, ge=0)
    expected_growth_pct: float = Field(default=0, ge=0, le=100)
    employment_type: str = "SALARIED"

    # Fixed expenses
    fixed_expenses: List[FixedExpenseInput] = Field(default_factory=list, max_length=40)

    # Existing money
    bank_balance: float = Field(default=0, ge=0)
    cash_balance: float = Field(default=0, ge=0)
    existing_savings: float = Field(default=0, ge=0)
    emergency_fund: float = Field(default=0, ge=0)
    other_assets: float = Field(default=0, ge=0)

    # Debts
    debts: List[DebtInput] = Field(default_factory=list, max_length=20)

    # Preferences
    emergency_fund_months: int = Field(default=6, ge=1, le=24)
    target_savings_rate: float = Field(default=20, ge=0, le=90)
    inflation_assumption: float = Field(default=6, ge=0, le=30)
    investment_return_pct: float = Field(default=10, ge=0, le=40)
    risk_tolerance: str = "MODERATE"

    _emp = field_validator("employment_type")(_in("employment_type", EMPLOYMENT_TYPES))
    _risk = field_validator("risk_tolerance")(_in("risk_tolerance", RISK_TOLERANCES))


class FinancialProfileOut(ORMModel):
    monthly_salary: float
    salary_day: int
    other_monthly_income: float
    expected_growth_pct: float
    employment_type: str
    bank_balance: float
    cash_balance: float
    existing_savings: float
    emergency_fund: float
    other_assets: float
    emergency_fund_months: int
    target_savings_rate: float
    inflation_assumption: float
    investment_return_pct: float
    risk_tolerance: str


class FinancialProfileUpdate(BaseModel):
    monthly_salary: Optional[float] = Field(default=None, ge=0)
    salary_day: Optional[int] = Field(default=None, ge=1, le=31)
    other_monthly_income: Optional[float] = Field(default=None, ge=0)
    expected_growth_pct: Optional[float] = Field(default=None, ge=0, le=100)
    employment_type: Optional[str] = None
    bank_balance: Optional[float] = Field(default=None, ge=0)
    cash_balance: Optional[float] = Field(default=None, ge=0)
    existing_savings: Optional[float] = Field(default=None, ge=0)
    emergency_fund: Optional[float] = Field(default=None, ge=0)
    other_assets: Optional[float] = Field(default=None, ge=0)
    emergency_fund_months: Optional[int] = Field(default=None, ge=1, le=24)
    target_savings_rate: Optional[float] = Field(default=None, ge=0, le=90)
    inflation_assumption: Optional[float] = Field(default=None, ge=0, le=30)
    investment_return_pct: Optional[float] = Field(default=None, ge=0, le=40)
    risk_tolerance: Optional[str] = None

    _emp = field_validator("employment_type")(_in("employment_type", EMPLOYMENT_TYPES))
    _risk = field_validator("risk_tolerance")(_in("risk_tolerance", RISK_TOLERANCES))


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------

class ExpenseCreate(BaseModel):
    amount: float = Field(gt=0, le=1_000_000_000)
    category: str
    description: str = Field(min_length=1, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=1000)
    payment_method: str = "UPI"
    spent_at: datetime
    is_fixed: bool = False
    is_recurring: bool = False

    _cat = field_validator("category")(_in("category", EXPENSE_CATEGORIES))
    _pay = field_validator("payment_method")(_in("payment_method", PAYMENT_METHODS))


class ExpenseUpdate(BaseModel):
    amount: Optional[float] = Field(default=None, gt=0)
    category: Optional[str] = None
    description: Optional[str] = Field(default=None, min_length=1, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=1000)
    payment_method: Optional[str] = None
    spent_at: Optional[datetime] = None
    is_fixed: Optional[bool] = None
    is_recurring: Optional[bool] = None

    _cat = field_validator("category")(_in("category", EXPENSE_CATEGORIES))
    _pay = field_validator("payment_method")(_in("payment_method", PAYMENT_METHODS))


class ExpenseOut(ORMModel):
    id: str
    amount: float
    category: str
    description: str
    notes: Optional[str]
    payment_method: str
    spent_at: datetime
    is_fixed: bool
    is_recurring: bool
    is_demo: bool
    created_at: datetime


# ---------------------------------------------------------------------------
# Income
# ---------------------------------------------------------------------------

class IncomeCreate(BaseModel):
    source: str = Field(min_length=1, max_length=120)
    amount: float = Field(gt=0)
    category: str = "SALARY"
    recurring: bool = False
    received_at: datetime
    notes: Optional[str] = Field(default=None, max_length=1000)

    _cat = field_validator("category")(_in("category", INCOME_CATEGORIES))


class IncomeOut(ORMModel):
    id: str
    source: str
    amount: float
    category: str
    recurring: bool
    received_at: datetime
    notes: Optional[str]
    is_demo: bool


# ---------------------------------------------------------------------------
# Budgets
# ---------------------------------------------------------------------------

class BudgetUpsert(BaseModel):
    category: str
    amount: float = Field(ge=0)
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2000, le=2100)

    _cat = field_validator("category")(_in("category", EXPENSE_CATEGORIES))


class BudgetOut(ORMModel):
    id: str
    category: str
    amount: float
    month: int
    year: int
    is_demo: bool


# ---------------------------------------------------------------------------
# Savings goals
# ---------------------------------------------------------------------------

class SavingsGoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = "GENERAL"
    target_amount: float = Field(gt=0)
    current_amount: float = Field(default=0, ge=0)
    target_date: Optional[datetime] = None
    monthly_contribution: float = Field(default=0, ge=0)
    is_emergency_fund: bool = False
    priority: int = Field(default=3, ge=1, le=5)

    _cat = field_validator("category")(_in("category", SAVINGS_CATEGORIES))


class SavingsGoalUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    category: Optional[str] = None
    target_amount: Optional[float] = Field(default=None, gt=0)
    current_amount: Optional[float] = Field(default=None, ge=0)
    target_date: Optional[datetime] = None
    monthly_contribution: Optional[float] = Field(default=None, ge=0)
    is_emergency_fund: Optional[bool] = None
    priority: Optional[int] = Field(default=None, ge=1, le=5)
    archived: Optional[bool] = None

    _cat = field_validator("category")(_in("category", SAVINGS_CATEGORIES))


class ContributionCreate(BaseModel):
    amount: float = Field(gt=0)
    note: Optional[str] = Field(default=None, max_length=200)
    occurred_at: Optional[datetime] = None


class SavingsGoalOut(ORMModel):
    id: str
    name: str
    category: str
    target_amount: float
    current_amount: float
    target_date: Optional[datetime]
    monthly_contribution: float
    is_emergency_fund: bool
    priority: int
    archived: bool
    is_demo: bool


# ---------------------------------------------------------------------------
# Financial goals & future plans
# ---------------------------------------------------------------------------

class FinancialGoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    horizon: str = "SHORT"
    target_amount: float = Field(gt=0)
    current_amount: float = Field(default=0, ge=0)
    target_date: datetime
    monthly_contribution: float = Field(default=0, ge=0)
    priority: int = Field(default=3, ge=1, le=5)

    _h = field_validator("horizon")(_in("horizon", GOAL_HORIZONS))


class FinancialGoalUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    horizon: Optional[str] = None
    target_amount: Optional[float] = Field(default=None, gt=0)
    current_amount: Optional[float] = Field(default=None, ge=0)
    target_date: Optional[datetime] = None
    monthly_contribution: Optional[float] = Field(default=None, ge=0)
    priority: Optional[int] = Field(default=None, ge=1, le=5)
    completed: Optional[bool] = None

    _h = field_validator("horizon")(_in("horizon", GOAL_HORIZONS))


class FuturePlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = "OTHER"
    current_cost: float = Field(gt=0)
    years_away: float = Field(gt=0, le=60)
    inflation_pct: float = Field(default=6, ge=0, le=30)
    expected_return_pct: float = Field(default=10, ge=0, le=40)
    already_saved: float = Field(default=0, ge=0)
    notes: Optional[str] = Field(default=None, max_length=1000)

    _cat = field_validator("category")(_in("category", FUTURE_PLAN_CATEGORIES))


class FuturePlanUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    category: Optional[str] = None
    current_cost: Optional[float] = Field(default=None, gt=0)
    years_away: Optional[float] = Field(default=None, gt=0, le=60)
    inflation_pct: Optional[float] = Field(default=None, ge=0, le=30)
    expected_return_pct: Optional[float] = Field(default=None, ge=0, le=40)
    already_saved: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = Field(default=None, max_length=1000)

    _cat = field_validator("category")(_in("category", FUTURE_PLAN_CATEGORIES))


# ---------------------------------------------------------------------------
# Investments
# ---------------------------------------------------------------------------

class InvestmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    ticker: Optional[str] = Field(default=None, max_length=24)
    type: str = "STOCK"
    quantity: float = Field(gt=0)
    avg_buy_price: float = Field(gt=0)
    current_price: float = Field(default=0, ge=0)
    notes: Optional[str] = Field(default=None, max_length=1000)

    _type = field_validator("type")(_in("type", INVESTMENT_TYPES))

    @field_validator("ticker")
    @classmethod
    def upper_ticker(cls, v: Optional[str]) -> Optional[str]:
        return v.strip().upper() if v else None


class InvestmentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    ticker: Optional[str] = Field(default=None, max_length=24)
    type: Optional[str] = None
    quantity: Optional[float] = Field(default=None, gt=0)
    avg_buy_price: Optional[float] = Field(default=None, gt=0)
    current_price: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = Field(default=None, max_length=1000)

    _type = field_validator("type")(_in("type", INVESTMENT_TYPES))


class InvestmentTransactionCreate(BaseModel):
    type: Literal["BUY", "SELL", "DIVIDEND"]
    quantity: float = Field(gt=0)
    price: float = Field(ge=0)
    fees: float = Field(default=0, ge=0)
    occurred_at: datetime
    notes: Optional[str] = Field(default=None, max_length=1000)


class InvestmentTransactionOut(ORMModel):
    id: str
    investment_id: str
    type: str
    quantity: float
    price: float
    fees: float
    occurred_at: datetime
    notes: Optional[str]


# ---------------------------------------------------------------------------
# Debt
# ---------------------------------------------------------------------------

class DebtCreate(DebtInput):
    pass


class DebtUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    type: Optional[str] = None
    principal: Optional[float] = Field(default=None, ge=0)
    outstanding: Optional[float] = Field(default=None, ge=0)
    emi: Optional[float] = Field(default=None, ge=0)
    interest_rate: Optional[float] = Field(default=None, ge=0, le=100)
    remaining_months: Optional[int] = Field(default=None, ge=0, le=600)
    due_day: Optional[int] = Field(default=None, ge=1, le=31)
    closed: Optional[bool] = None

    _type = field_validator("type")(_in("type", DEBT_TYPES))


class DebtOut(ORMModel):
    id: str
    name: str
    type: str
    principal: float
    outstanding: float
    emi: float
    interest_rate: float
    remaining_months: int
    due_day: int
    closed: bool
    is_demo: bool


# ---------------------------------------------------------------------------
# Salary planner
# ---------------------------------------------------------------------------

class AllocationOverride(BaseModel):
    """Manual edits to a generated plan. Every field optional."""

    salary: Optional[float] = Field(default=None, ge=0)
    essentials: Optional[float] = Field(default=None, ge=0)
    lifestyle: Optional[float] = Field(default=None, ge=0)
    savings: Optional[float] = Field(default=None, ge=0)
    investments: Optional[float] = Field(default=None, ge=0)
    debt_payments: Optional[float] = Field(default=None, ge=0)
    family: Optional[float] = Field(default=None, ge=0)
    emergency: Optional[float] = Field(default=None, ge=0)
    buffer: Optional[float] = Field(default=None, ge=0)


# ---------------------------------------------------------------------------
# Purchase decisions
# ---------------------------------------------------------------------------

class PurchaseRequest(BaseModel):
    item_name: str = Field(min_length=1, max_length=200)
    price: float = Field(gt=0, le=1_000_000_000)
    category: str = "OTHER"
    necessity: Literal["NEED", "WANT", "MIXED"] = "WANT"
    on_credit: bool = False
    explain_with_ai: bool = True


class QuickAskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

class NotificationOut(ORMModel):
    id: str
    type: str
    severity: str
    title: str
    message: str
    action_url: Optional[str]
    read_at: Optional[datetime]
    created_at: datetime


class NotificationPreferenceOut(ORMModel):
    budget_warnings: bool
    goal_reminders: bool
    savings_reminders: bool
    investment_updates: bool
    upcoming_payments: bool
    monthly_review: bool
    unusual_spending: bool


class NotificationPreferenceUpdate(BaseModel):
    budget_warnings: Optional[bool] = None
    goal_reminders: Optional[bool] = None
    savings_reminders: Optional[bool] = None
    investment_updates: Optional[bool] = None
    upcoming_payments: Optional[bool] = None
    monthly_review: Optional[bool] = None
    unusual_spending: Optional[bool] = None


# ---------------------------------------------------------------------------
# AI coach
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: Optional[str] = None


class ChatMessageOut(ORMModel):
    id: str
    role: str
    content: str
    generated_by: str
    created_at: datetime


class ChatResponse(BaseModel):
    conversation_id: str
    message: ChatMessageOut
    generated_by: str
    disclaimer: str


class ConversationOut(ORMModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
