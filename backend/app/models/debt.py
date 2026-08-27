from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.base import Money, Rate, TimestampMixin, UUIDMixin


class Debt(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "debts"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # PERSONAL_LOAN | HOME_LOAN | VEHICLE_LOAN | EDUCATION_LOAN | CREDIT_CARD | OTHER
    type: Mapped[str] = mapped_column(String(24), default="PERSONAL_LOAN", nullable=False)
    principal: Mapped[float] = mapped_column(Money, nullable=False)
    outstanding: Mapped[float] = mapped_column(Money, nullable=False)
    emi: Mapped[float] = mapped_column(Money, default=0, nullable=False)
    interest_rate: Mapped[float] = mapped_column(Rate, default=0, nullable=False)
    remaining_months: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    due_day: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
