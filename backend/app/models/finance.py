from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.base import Money, TimestampMixin, UUIDMixin


class Income(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "incomes"
    __table_args__ = (Index("ix_incomes_user_date", "user_id", "received_at"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source: Mapped[str] = mapped_column(String(120), nullable=False)
    amount: Mapped[float] = mapped_column(Money, nullable=False)
    # SALARY | FREELANCE | BONUS | INTEREST | RENTAL | GIFT | OTHER
    category: Mapped[str] = mapped_column(String(24), default="SALARY", nullable=False)
    recurring: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Expense(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "expenses"
    __table_args__ = (
        Index("ix_expenses_user_date", "user_id", "spent_at"),
        Index("ix_expenses_user_category", "user_id", "category"),
    )

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[float] = mapped_column(Money, nullable=False)
    # FOOD RENT TRAVEL SHOPPING BILLS ENTERTAINMENT EDUCATION HEALTH FAMILY
    # SUBSCRIPTIONS OTHER
    category: Mapped[str] = mapped_column(String(24), nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    # CASH | UPI | DEBIT_CARD | CREDIT_CARD | BANK_TRANSFER | OTHER
    payment_method: Mapped[str] = mapped_column(String(24), default="UPI", nullable=False)
    spent_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    # A committed cost (rent, wifi, EMI-like) rather than discretionary spend.
    is_fixed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Budget(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("user_id", "category", "month", "year", name="uq_budget_period"),
        Index("ix_budgets_user_period", "user_id", "year", "month"),
    )

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(24), nullable=False)
    amount: Mapped[float] = mapped_column(Money, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class SalaryAllocation(UUIDMixin, TimestampMixin, Base):
    """A saved monthly salary plan. Regenerated on demand, editable by hand."""

    __tablename__ = "salary_allocations"
    __table_args__ = (
        UniqueConstraint("user_id", "month", "year", name="uq_allocation_period"),
        Index("ix_allocations_user_period", "user_id", "year", "month"),
    )

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)

    salary: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    essentials: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    lifestyle: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    savings: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    investments: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    debt_payments: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    family: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    emergency: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    buffer: Mapped[float] = mapped_column(Money, default=0, nullable=False)

    # AI | RULE_BASED | MANUAL
    source: Mapped[str] = mapped_column(String(16), default="RULE_BASED", nullable=False)
    rationale: Mapped[Optional[str]] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
