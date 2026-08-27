from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import DISCLAIMER
from app.core.deps import get_current_user, owned_or_404
from app.db.session import get_db
from app.models.investments import Investment, InvestmentTransaction
from app.models.user import User
from app.schemas.common import DeletedResponse
from app.schemas.finance import (
    InvestmentCreate,
    InvestmentTransactionCreate,
    InvestmentTransactionOut,
    InvestmentUpdate,
)
from app.services.finance.context import build_portfolio
from app.services.finance.helpers import round2
from app.services.market_data import fetch_quote, is_enabled, provider_status

router = APIRouter(prefix="/investments", tags=["investments"])

EDUCATIONAL_NOTES = [
    "Diversification spreads risk across holdings; it reduces the impact of any single position "
    "falling, but it does not remove the risk of loss.",
    "Values move up and down. A portfolio that is up today can be down next month - past "
    "performance does not predict future results.",
    "Regular contributions matter more for long-term outcomes than trying to time entry points.",
    "Anything promising a guaranteed high return is either mispriced or a scam. Risk and return "
    "move together.",
]


@router.get("")
def list_investments(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Portfolio with live valuation, allocation and best/worst performers."""
    rows = list(
        db.scalars(
            select(Investment).where(Investment.user_id == user.id).order_by(Investment.created_at.desc())
        )
    )
    portfolio = build_portfolio(rows)

    stale = [
        h
        for h in portfolio["holdings"]
        if h["price_source"] == "LIVE_MARKET"
        and h["price_updated_at"]
        and h["price_updated_at"] < datetime.utcnow() - timedelta(hours=24)
    ]

    return {
        **portfolio,
        "currency": user.currency,
        "market_data": provider_status(),
        "stale_price_count": len(stale),
        "user_entered_count": sum(
            1 for h in portfolio["holdings"] if h["price_source"] == "USER_ENTERED"
        ),
        "educational_notes": EDUCATIONAL_NOTES,
        "disclaimer": DISCLAIMER,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_investment(
    payload: InvestmentCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    data = payload.model_dump()
    # Without a supplied market price, the holding is valued at cost. The app
    # never generates a price it did not receive.
    if not data.get("current_price"):
        data["current_price"] = data["avg_buy_price"]
    investment = Investment(user_id=user.id, currency=user.currency, **data)
    db.add(investment)
    db.flush()

    # The opening position is recorded as a BUY so the history is complete.
    db.add(
        InvestmentTransaction(
            user_id=user.id,
            investment_id=investment.id,
            type="BUY",
            quantity=data["quantity"],
            price=data["avg_buy_price"],
            occurred_at=datetime.utcnow(),
            notes="Opening position",
        )
    )
    db.commit()
    db.refresh(investment)
    return _serialise(investment)


@router.patch("/{investment_id}")
def update_investment(
    investment_id: str,
    payload: InvestmentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    investment = owned_or_404(db.get(Investment, investment_id), user, "Investment")
    data = payload.model_dump(exclude_unset=True, exclude_none=True)
    if "current_price" in data:
        # A hand-edited price is user-entered, even if it was previously live.
        investment.price_source = "USER_ENTERED"
        investment.price_updated_at = datetime.utcnow()
    for key, value in data.items():
        setattr(investment, key, value)
    db.commit()
    db.refresh(investment)
    return _serialise(investment)


@router.delete("/{investment_id}", response_model=DeletedResponse)
def delete_investment(
    investment_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    investment = owned_or_404(db.get(Investment, investment_id), user, "Investment")
    db.delete(investment)
    db.commit()
    return DeletedResponse(id=investment_id)


@router.post("/{investment_id}/transactions", response_model=InvestmentTransactionOut, status_code=201)
def add_transaction(
    investment_id: str,
    payload: InvestmentTransactionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Records a buy / sell / dividend and keeps the weighted average cost and
    quantity in step with it.
    """
    investment = owned_or_404(db.get(Investment, investment_id), user, "Investment")

    if payload.type == "SELL" and payload.quantity > float(investment.quantity):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You only hold {round2(investment.quantity)} units of {investment.name}.",
        )

    txn = InvestmentTransaction(
        user_id=user.id, investment_id=investment.id, **payload.model_dump()
    )
    db.add(txn)

    qty = float(investment.quantity)
    avg = float(investment.avg_buy_price)
    if payload.type == "BUY":
        new_qty = qty + payload.quantity
        investment.avg_buy_price = round2(
            ((qty * avg) + (payload.quantity * payload.price) + payload.fees) / new_qty
        ) if new_qty > 0 else avg
        investment.quantity = round2(new_qty)
    elif payload.type == "SELL":
        # Average cost is unchanged by a sale; only the quantity falls.
        investment.quantity = round2(qty - payload.quantity)

    db.commit()
    db.refresh(txn)
    return InvestmentTransactionOut.model_validate(txn)


@router.get("/{investment_id}/transactions", response_model=List[InvestmentTransactionOut])
def list_transactions(
    investment_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    investment = owned_or_404(db.get(Investment, investment_id), user, "Investment")
    rows = db.scalars(
        select(InvestmentTransaction)
        .where(InvestmentTransaction.investment_id == investment.id)
        .order_by(InvestmentTransaction.occurred_at.desc())
    )
    return [InvestmentTransactionOut.model_validate(r) for r in rows]


@router.post("/refresh-prices")
async def refresh_prices(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Pulls live quotes for every holding that has a ticker.

    Holdings without a ticker, or whose lookup fails, keep the price the user
    entered - they are never replaced with a guess.
    """
    if not is_enabled():
        return {
            "updated": 0,
            "skipped": 0,
            "message": (
                "No market data provider is configured, so prices stay as you entered them. "
                "Add MARKET_DATA_API_KEY to the backend .env to enable live quotes."
            ),
            "market_data": provider_status(),
        }

    rows = list(
        db.scalars(
            select(Investment).where(
                Investment.user_id == user.id, Investment.ticker.is_not(None)
            )
        )
    )

    updated, failed = 0, []
    for inv in rows:
        quote = await fetch_quote(inv.ticker or "")
        if quote is None:
            failed.append(inv.ticker)
            continue
        inv.current_price = quote.price
        inv.previous_close = quote.previous_close
        inv.price_source = "LIVE_MARKET"
        inv.price_updated_at = quote.as_of
        updated += 1

    if updated:
        db.commit()

    no_ticker = db.query(Investment).filter(
        Investment.user_id == user.id, Investment.ticker.is_(None)
    ).count()

    message = f"Updated {updated} holding(s) with live prices."
    if failed:
        message += f" No quote found for: {', '.join(t for t in failed if t)}. Those keep your entered price."
    if no_ticker:
        message += f" {no_ticker} holding(s) have no ticker and stay user-entered."

    return {
        "updated": updated,
        "skipped": len(failed) + no_ticker,
        "failed_tickers": failed,
        "message": message,
        "market_data": provider_status(),
    }


@router.get("/quote/{symbol}")
async def get_quote(symbol: str, user: User = Depends(get_current_user)):
    """Looks up one symbol. Returns 404 rather than inventing a price."""
    if not is_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No market data provider is configured. Enter the price manually instead.",
        )
    quote = await fetch_quote(symbol)
    if quote is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No quote found for '{symbol.upper()}'. Check the symbol or enter the price manually.",
        )
    return quote.as_dict()


@router.get("/performance/history")
def performance_history(
    period: str = Query(default="1M", pattern="^(1D|1W|1M|6M|1Y|ALL)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Contribution and cost-basis history over a period.

    This is built from the user's own recorded transactions. Historical market
    valuations are not reconstructed, because the app does not hold historical
    price data and will not invent it.
    """
    days = {"1D": 1, "1W": 7, "1M": 30, "6M": 182, "1Y": 365, "ALL": 3650}[period]
    since = datetime.utcnow() - timedelta(days=days)

    txns = list(
        db.scalars(
            select(InvestmentTransaction)
            .where(
                InvestmentTransaction.user_id == user.id,
                InvestmentTransaction.occurred_at >= since,
            )
            .order_by(InvestmentTransaction.occurred_at.asc())
        )
    )

    running_cost = 0.0
    series = []
    for t in txns:
        value = float(t.quantity) * float(t.price)
        if t.type == "BUY":
            running_cost += value + float(t.fees or 0)
        elif t.type == "SELL":
            running_cost -= value
        series.append(
            {
                "date": t.occurred_at.strftime("%Y-%m-%d"),
                "cost_basis": round2(running_cost),
                "type": t.type,
                "amount": round2(value),
            }
        )

    rows = list(db.scalars(select(Investment).where(Investment.user_id == user.id)))
    portfolio = build_portfolio(rows)

    return {
        "period": period,
        "series": series,
        "current_value": portfolio["current_value"],
        "total_invested": portfolio["total_invested"],
        "profit_loss": portfolio["profit_loss"],
        "profit_loss_pct": portfolio["profit_loss_pct"],
        "day_change": portfolio["day_change"],
        "note": (
            "This chart plots your recorded contributions and cost basis over time. It is not a "
            "historical market valuation - the app does not store past prices and will not "
            "estimate them."
        ),
    }


def _serialise(inv: Investment) -> dict:
    quantity = float(inv.quantity)
    avg = float(inv.avg_buy_price)
    price = float(inv.current_price) or avg
    invested = round2(quantity * avg)
    value = round2(quantity * price)
    return {
        "id": inv.id,
        "name": inv.name,
        "ticker": inv.ticker,
        "type": inv.type,
        "quantity": quantity,
        "avg_buy_price": round2(avg),
        "current_price": round2(price),
        "invested": invested,
        "current_value": value,
        "profit_loss": round2(value - invested),
        "profit_loss_pct": round2((value - invested) / invested * 100) if invested else 0.0,
        "price_source": inv.price_source,
        "price_updated_at": inv.price_updated_at,
        "currency": inv.currency,
        "notes": inv.notes,
        "is_demo": inv.is_demo,
    }
