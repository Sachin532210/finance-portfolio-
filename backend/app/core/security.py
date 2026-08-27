from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

SESSION_COOKIE_NAME = "ft_session"


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    # bcrypt silently truncates beyond 72 bytes; trim explicitly so a long
    # passphrase cannot produce a surprising match.
    return pwd_context.hash(plain[:72])


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain[:72], hashed)
    except Exception:
        return False


def password_strength(password: str) -> dict:
    score = 0
    if len(password) >= 8:
        score += 1
    if len(password) >= 12:
        score += 1
    if any(c.islower() for c in password) and any(c.isupper() for c in password):
        score += 1
    if any(c.isdigit() for c in password) and any(not c.isalnum() for c in password):
        score += 1
    labels = ["Very weak", "Weak", "Fair", "Good", "Strong"]
    score = min(score, 4)
    return {"score": score, "label": labels[score]}


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------

def create_access_token(user_id: str, session_id: str, expires_minutes: Optional[int] = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload: dict[str, Any] = {
        "sub": user_id,
        "sid": session_id,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "iss": "finance-track",
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM], issuer="finance-track"
        )
    except JWTError:
        return None


def random_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
