from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.demo_data import clear_demo_data, has_demo_data, seed_demo_data

router = APIRouter(prefix="/demo", tags=["demo"])


@router.get("/status")
def status(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    present = has_demo_data(db, user)
    return {
        "has_demo_data": present,
        "flag": user.has_demo_data,
        "note": (
            "Demo rows are marked so they can be removed without touching anything you entered."
            if present
            else "No demo data loaded."
        ),
    }


@router.post("/seed")
def seed(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Loads a realistic sample dataset so every page has something to show."""
    if has_demo_data(db, user):
        clear_demo_data(db, user)
    return seed_demo_data(db, user)


@router.delete("")
def clear(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Removes only the demo rows; user-entered data is left alone."""
    if not has_demo_data(db, user):
        return {"message": "No demo data to remove.", "deleted": {}}
    return clear_demo_data(db, user)
