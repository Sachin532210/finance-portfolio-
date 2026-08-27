from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import Money, Rate, TimestampMixin, UUIDMixin


class SavingsGoal(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "savings_goals"
    __table_args__ = (Index("ix_savings_goals_user", "user_id", "archived"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # EMERGENCY | GADGET | VEHICLE | EDUCATION | TRAVEL | FAMILY | HOME | GENERAL
    category: Mapped[str] = mapped_column(String(24), default="GENERAL", nullable=False)
    target_amount: Mapped[float] = mapped_column(Money, nullable=False)
    current_amount: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    target_date: Mapped[Optional[datetime]] = mapped_column(DateTime)
    monthly_contribution: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    is_emergency_fund: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    contributions: Mapped[List["SavingsContribution"]] = relationship(
        back_populates="goal", cascade="all, delete-orphan"
    )


class SavingsContribution(UUIDMixin, Base):
    __tablename__ = "savings_contributions"
    __table_args__ = (Index("ix_contrib_goal_date", "goal_id", "occurred_at"),)

    goal_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("savings_goals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[float] = mapped_column(Money, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(200))
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    goal: Mapped["SavingsGoal"] = relationship(back_populates="contributions")


class FinancialGoal(UUIDMixin, TimestampMixin, Base):
    """Short / medium / long term goals shown on the Goals page."""

    __tablename__ = "financial_goals"
    __table_args__ = (Index("ix_financial_goals_user_horizon", "user_id", "horizon"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    # SHORT | MEDIUM | LONG
    horizon: Mapped[str] = mapped_column(String(12), default="SHORT", nullable=False)
    target_amount: Mapped[float] = mapped_column(Money, nullable=False)
    current_amount: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    target_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    monthly_contribution: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class FuturePlan(UUIDMixin, TimestampMixin, Base):
    """Inflation-adjusted future plans (house, vehicle, education, ...)."""

    __tablename__ = "future_plans"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # VEHICLE | EDUCATION | BUSINESS | HOUSE | MARRIAGE | TRAVEL | RETIREMENT
    # | INDEPENDENCE | OTHER
    category: Mapped[str] = mapped_column(String(24), default="OTHER", nullable=False)
    current_cost: Mapped[float] = mapped_column(Money, nullable=False)
    years_away: Mapped[float] = mapped_column(Rate, nullable=False)
    inflation_pct: Mapped[float] = mapped_column(Rate, default=6, nullable=False)
    expected_return_pct: Mapped[float] = mapped_column(Rate, default=10, nullable=False)
    already_saved: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
