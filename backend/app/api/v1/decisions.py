from __future__ import annotations

import json
from typing import List

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.constants import AI_DISCLAIMER_SHORT, DISCLAIMER
from app.core.deps import get_current_user, owned_or_404
from app.core.rate_limit import enforce_ai_limits
from app.db.session import get_db
from app.models.insights import PurchaseDecision
from app.models.user import User
from app.schemas.common import DeletedResponse
from app.schemas.finance import PurchaseRequest, QuickAskRequest
from app.services.ai.coach import explain_purchase, extract_item_name, extract_price
from app.services.finance.context import build_financial_context
from app.services.finance.purchase import analyse_purchase, build_buying_guide

router = APIRouter(prefix="/decisions", tags=["decisions"])


@router.post("/analyse", status_code=status.HTTP_201_CREATED)
def analyse(
    payload: PurchaseRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    "Can I buy this?" / purchase score.

    The score and verdict come from the deterministic engine. The AI, when
    configured, only writes the explanation - it cannot change the verdict.
    """
    ctx = build_financial_context(db, user)
    analysis = analyse_purchase(
        ctx,
        item_name=payload.item_name,
        price=payload.price,
        necessity=payload.necessity,
        category=payload.category,
        on_credit=payload.on_credit,
    )

    explanation = "\n\n".join(analysis["reasoning"])
    generated_by = "RULE_BASED"

    if payload.explain_with_ai and settings.ai_enabled:
        try:
            enforce_ai_limits(
                user.id, settings.AI_RATE_LIMIT_PER_MINUTE, settings.AI_RATE_LIMIT_PER_DAY
            )
            explanation, generated_by = explain_purchase(ctx, analysis)
        except Exception:
            # Rate limited or the model failed - the deterministic explanation
            # already covers it, so the user still gets a full answer.
            pass

    record = PurchaseDecision(
        user_id=user.id,
        item_name=analysis["item_name"],
        price=analysis["price"],
        category=payload.category,
        necessity=analysis["necessity"],
        score=analysis["score"],
        verdict=analysis["verdict"],
        reasoning=explanation,
        wait_days=analysis["wait_days"],
        breakdown=json.dumps(
            {"factors": analysis["factors"], "impact": analysis["impact"]}, default=str
        ),
        generated_by=generated_by,
    )
    db.add(record)
    db.commit()

    return {
        **analysis,
        "id": record.id,
        "explanation": explanation,
        "generated_by": generated_by,
        "currency_symbol": ctx["currency_symbol"],
        "disclaimer": AI_DISCLAIMER_SHORT,
    }


@router.post("/quick-ask")
def quick_ask(
    payload: QuickAskRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """
    Natural-language shortcut: "Can I buy a 5,000 headphone?".

    Parses the amount, runs the same engine and returns the full analysis.
    """
    price = extract_price(payload.question)
    if price is None:
        return {
            "parsed": False,
            "message": (
                "I could not find an amount in that question. Try something like "
                '"Can I buy a 5,000 headphone?"'
            ),
        }

    ctx = build_financial_context(db, user)
    analysis = analyse_purchase(
        ctx,
        item_name=extract_item_name(payload.question),
        price=price,
        necessity="WANT",
    )
    return {
        "parsed": True,
        "detected_price": price,
        **analysis,
        "explanation": "\n\n".join(analysis["reasoning"]),
        "currency_symbol": ctx["currency_symbol"],
        "disclaimer": AI_DISCLAIMER_SHORT,
    }


@router.get("/buying-guide")
def buying_guide(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Smart Buying Guide: what to buy now, plan, wait on, or avoid."""
    ctx = build_financial_context(db, user)
    items = build_buying_guide(ctx)

    buckets = {"BUY_NOW": [], "PLAN_AND_BUY": [], "WAIT": [], "AVOID": []}
    for item in items:
        buckets.setdefault(item["bucket"], []).append(item)

    return {
        "buckets": buckets,
        "items": items,
        "context": {
            "disposable": max(ctx["disposable_this_month"], 0),
            "savings_rate": ctx["savings"]["savings_rate"],
            "target_savings_rate": ctx["profile"]["target_savings_rate"],
            "emergency_months": ctx["emergency"]["months_covered"],
            "days_left": ctx["spend"]["days_left"],
        },
        "currency_symbol": ctx["currency_symbol"],
        "disclaimer": DISCLAIMER,
    }


@router.get("/history")
def history(
    limit: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.scalars(
        select(PurchaseDecision)
        .where(PurchaseDecision.user_id == user.id)
        .order_by(PurchaseDecision.created_at.desc())
        .limit(limit)
    )
    return [
        {
            "id": r.id,
            "item_name": r.item_name,
            "price": float(r.price),
            "category": r.category,
            "necessity": r.necessity,
            "score": r.score,
            "verdict": r.verdict,
            "reasoning": r.reasoning,
            "wait_days": r.wait_days,
            "generated_by": r.generated_by,
            "created_at": r.created_at,
            "breakdown": json.loads(r.breakdown or "{}"),
        }
        for r in rows
    ]


@router.delete("/history/{decision_id}", response_model=DeletedResponse)
def delete_decision(
    decision_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    record = owned_or_404(db.get(PurchaseDecision, decision_id), user, "Decision")
    db.delete(record)
    db.commit()
    return DeletedResponse(id=decision_id)
