from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import SESSION_COOKIE_NAME, decode_token
from app.db.session import get_db
from app.models.user import User, UserSession

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def _extract_token(cookie_token: Optional[str], authorization: Optional[str]) -> Optional[str]:
    if cookie_token:
        return cookie_token
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def get_current_user(
    db: Session = Depends(get_db),
    ft_session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
) -> User:
    """
    Resolves the signed-in user.

    The JWT alone is not trusted: the session row it points at must still exist
    and be unexpired, which is what makes logout and "sign out everywhere"
    take effect immediately.
    """
    token = _extract_token(ft_session, authorization)
    if not token:
        raise CREDENTIALS_ERROR

    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise CREDENTIALS_ERROR

    user_id = payload.get("sub")
    session_id = payload.get("sid")
    if not user_id or not session_id:
        raise CREDENTIALS_ERROR

    session_row = db.get(UserSession, session_id)
    if not session_row or session_row.user_id != user_id:
        raise CREDENTIALS_ERROR
    if session_row.expires_at < datetime.utcnow():
        db.delete(session_row)
        db.commit()
        raise CREDENTIALS_ERROR

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise CREDENTIALS_ERROR

    return user


def get_optional_user(
    db: Session = Depends(get_db),
    ft_session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
) -> Optional[User]:
    try:
        return get_current_user(db=db, ft_session=ft_session, authorization=authorization)
    except HTTPException:
        return None


def owned_or_404(entity, user: User, label: str = "Record"):
    """
    Ownership guard used by every detail/update/delete route.

    Returns 404 rather than 403 for another user's row so the API never
    confirms that someone else's record exists.
    """
    if entity is None or getattr(entity, "user_id", None) != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} not found")
    return entity
