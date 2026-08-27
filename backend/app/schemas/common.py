from __future__ import annotations

from typing import Any, Generic, List, Optional, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    message: str
    detail: Optional[str] = None


class DeletedResponse(BaseModel):
    id: str
    deleted: bool = True


class Page(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    pages: int


class ValueLabel(BaseModel):
    value: str
    label: str


class OptionsResponse(BaseModel):
    """Vocabulary the frontend renders in selects - kept server-side so the
    two sides cannot drift apart."""

    expense_categories: List[str]
    payment_methods: List[str]
    income_categories: List[str]
    employment_types: List[str]
    investment_types: List[str]
    debt_types: List[str]
    savings_categories: List[str]
    goal_horizons: List[str]
    future_plan_categories: List[str]
    risk_tolerances: List[str]
    necessity_levels: List[str]
    currencies: List[str]
    disclaimer: str


class AnyDict(BaseModel):
    model_config = ConfigDict(extra="allow")

    def __init__(self, **data: Any) -> None:
        super().__init__(**data)
