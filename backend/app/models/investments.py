from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import Money, TimestampMixin, UUIDMixin


class Investment(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "investments"
    __table_args__ = (Index("ix_investments_user_type", "user_id", "type"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    ticker: Mapped[Optional[str]] = mapped_column(String(24), index=True)
    # STOCK | MUTUAL_FUND | ETF | GOLD | FD | CRYPTO | OTHER
    type: Mapped[str] = mapped_column(String(24), default="STOCK", nullable=False)
    quantity: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    avg_buy_price: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    current_price: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    previous_close: Mapped[Optional[float]] = mapped_column(Money)
    # USER_ENTERED | LIVE_MARKET - the UI labels these differently and prices
    # are never invented by the app.
    price_source: Mapped[str] = mapped_column(String(16), default="USER_ENTERED", nullable=False)
    price_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    currency: Mapped[str] = mapped_column(String(8), default="INR", nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    transactions: Mapped[List["InvestmentTransaction"]] = relationship(
        back_populates="investment", cascade="all, delete-orphan"
    )


class InvestmentTransaction(UUIDMixin, Base):
    __tablename__ = "investment_transactions"
    __table_args__ = (Index("ix_inv_txn_user_date", "user_id", "occurred_at"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    investment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("investments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # BUY | SELL | DIVIDEND
    type: Mapped[str] = mapped_column(String(12), nullable=False)
    quantity: Mapped[float] = mapped_column(Money, nullable=False)
    price: Mapped[float] = mapped_column(Money, nullable=False)
    fees: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    investment: Mapped["Investment"] = relationship(back_populates="transactions")
