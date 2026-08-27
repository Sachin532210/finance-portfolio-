from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.base import Money, Rate, TimestampMixin, UUIDMixin


class Notification(UUIDMixin, Base):
    __tablename__ = "notifications"
    __table_args__ = (
        UniqueConstraint("user_id", "dedupe_key", name="uq_notification_dedupe"),
        Index("ix_notifications_user_created", "user_id", "created_at"),
    )

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # BUDGET_WARNING | GOAL_REMINDER | SAVINGS_REMINDER | INVESTMENT_UPDATE
    # | UPCOMING_EMI | UPCOMING_BILL | MONTHLY_REVIEW | UNUSUAL_SPENDING | POSITIVE
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    # INFO | WARNING | CRITICAL | SUCCESS
    severity: Mapped[str] = mapped_column(String(12), default="INFO", nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    action_url: Mapped[Optional[str]] = mapped_column(String(200))
    # Stops the rules engine from re-inserting the same alert on every refresh.
    dedupe_key: Mapped[Optional[str]] = mapped_column(String(200))
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class MonthlyReport(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "monthly_reports"
    __table_args__ = (
        UniqueConstraint("user_id", "month", "year", name="uq_report_period"),
        Index("ix_reports_user_period", "user_id", "year", "month"),
    )

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)

    total_income: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    total_expenses: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    total_savings: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    total_invested: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    savings_rate: Mapped[float] = mapped_column(Rate, default=0, nullable=False)
    health_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # JSON-encoded lists, kept portable across MySQL / PostgreSQL / SQLite.
    top_categories: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    good_decisions: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    problems: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    next_month_plan: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    generated_by: Mapped[str] = mapped_column(String(16), default="RULE_BASED", nullable=False)


class FinancialSnapshot(UUIDMixin, Base):
    """Point-in-time net-worth record; powers the net-worth growth chart."""

    __tablename__ = "financial_snapshots"
    __table_args__ = (Index("ix_snapshots_user_date", "user_id", "taken_at"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    taken_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    net_worth: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    total_assets: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    total_liabilities: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    cash: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    savings: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    investments: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    emergency_fund: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    health_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class PurchaseDecision(UUIDMixin, Base):
    """History of every "Can I buy this?" / purchase-score run."""

    __tablename__ = "purchase_decisions"
    __table_args__ = (Index("ix_decisions_user_created", "user_id", "created_at"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_name: Mapped[str] = mapped_column(String(200), nullable=False)
    price: Mapped[float] = mapped_column(Money, nullable=False)
    category: Mapped[str] = mapped_column(String(24), default="OTHER", nullable=False)
    # NEED | WANT | MIXED
    necessity: Mapped[str] = mapped_column(String(12), default="WANT", nullable=False)
    score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # BUY_NOW | PLAN_AND_BUY | WAIT | SAVE_FIRST | AVOID
    verdict: Mapped[str] = mapped_column(String(20), nullable=False)
    reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    wait_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    breakdown: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    generated_by: Mapped[str] = mapped_column(String(16), default="RULE_BASED", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
