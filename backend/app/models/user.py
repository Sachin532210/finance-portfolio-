from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import Money, Rate, TimestampMixin, UUIDMixin


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="INR", nullable=False)
    locale: Mapped[str] = mapped_column(String(16), default="en-IN", nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata", nullable=False)
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_demo_data: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    profile: Mapped[Optional["FinancialProfile"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    notification_pref: Mapped[Optional["NotificationPreference"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    sessions: Mapped[List["UserSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class UserSession(UUIDMixin, Base):
    """
    Server-side session record. The JWT carries this row's id, so deleting the
    row revokes the token immediately - a plain stateless JWT cannot be logged
    out before it expires.
    """

    __tablename__ = "user_sessions"
    __table_args__ = (Index("ix_user_sessions_user_expires", "user_id", "expires_at"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_agent: Mapped[Optional[str]] = mapped_column(String(255))
    ip_address: Mapped[Optional[str]] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="sessions")


class PasswordResetToken(UUIDMixin, Base):
    __tablename__ = "password_reset_tokens"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class FinancialProfile(UUIDMixin, TimestampMixin, Base):
    """Everything captured during onboarding, editable later in Settings."""

    __tablename__ = "financial_profiles"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )

    # Income
    monthly_salary: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    salary_day: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    other_monthly_income: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    expected_growth_pct: Mapped[float] = mapped_column(Rate, default=0, nullable=False)
    employment_type: Mapped[str] = mapped_column(String(24), default="SALARIED", nullable=False)

    # Existing money
    bank_balance: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    cash_balance: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    existing_savings: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    emergency_fund: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    other_assets: Mapped[float] = mapped_column(Money, default=0, nullable=False)

    # Planning preferences
    emergency_fund_months: Mapped[int] = mapped_column(Integer, default=6, nullable=False)
    target_savings_rate: Mapped[float] = mapped_column(Rate, default=20, nullable=False)
    inflation_assumption: Mapped[float] = mapped_column(Rate, default=6, nullable=False)
    investment_return_pct: Mapped[float] = mapped_column(Rate, default=10, nullable=False)
    risk_tolerance: Mapped[str] = mapped_column(String(16), default="MODERATE", nullable=False)

    user: Mapped["User"] = relationship(back_populates="profile")


class NotificationPreference(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "notification_preferences"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    budget_warnings: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    goal_reminders: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    savings_reminders: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    investment_updates: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    upcoming_payments: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    monthly_review: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    unusual_spending: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped["User"] = relationship(back_populates="notification_pref")
