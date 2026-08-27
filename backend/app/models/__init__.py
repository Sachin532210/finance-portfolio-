"""
Model package. Importing this module registers every table on the shared
declarative Base, which is what `Base.metadata.create_all()` relies on.
"""

from app.models.ai import AIConversation, AIMessage
from app.models.debt import Debt
from app.models.finance import Budget, Expense, Income, SalaryAllocation
from app.models.goals import FinancialGoal, FuturePlan, SavingsContribution, SavingsGoal
from app.models.insights import (
    FinancialSnapshot,
    MonthlyReport,
    Notification,
    PurchaseDecision,
)
from app.models.investments import Investment, InvestmentTransaction
from app.models.user import (
    FinancialProfile,
    NotificationPreference,
    PasswordResetToken,
    User,
    UserSession,
)

__all__ = [
    "AIConversation",
    "AIMessage",
    "Budget",
    "Debt",
    "Expense",
    "FinancialGoal",
    "FinancialProfile",
    "FinancialSnapshot",
    "FuturePlan",
    "Income",
    "Investment",
    "InvestmentTransaction",
    "MonthlyReport",
    "Notification",
    "NotificationPreference",
    "PasswordResetToken",
    "PurchaseDecision",
    "SalaryAllocation",
    "SavingsContribution",
    "SavingsGoal",
    "User",
    "UserSession",
]
