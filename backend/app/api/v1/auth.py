from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.core.security import (
    SESSION_COOKIE_NAME,
    create_access_token,
    hash_password,
    random_token,
    sha256,
    verify_password,
)
from app.db.session import get_db
from app.models.user import (
    FinancialProfile,
    NotificationPreference,
    PasswordResetToken,
    User,
    UserSession,
)
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    ResetPasswordRequest,
    SignupRequest,
    UpdateProfileRequest,
    UserOut,
)
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.ENVIRONMENT == "production",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )


def _start_session(db: Session, user: User, request: Request, response: Response) -> str:
    session = UserSession(
        user_id=user.id,
        user_agent=(request.headers.get("user-agent") or "")[:255],
        ip_address=(request.client.host if request.client else None),
        expires_at=datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    db.add(session)
    db.commit()
    token = create_access_token(user.id, session.id)
    _set_session_cookie(response, token)
    return token


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        name=payload.name,
        currency=payload.currency.upper(),
    )
    db.add(user)
    db.flush()

    # Every user starts with an (empty) profile and default notification
    # preferences so the rest of the app never has to handle a missing row.
    db.add(FinancialProfile(user_id=user.id))
    db.add(NotificationPreference(user_id=user.id))
    db.commit()
    db.refresh(user)

    token = _start_session(db, user, request, response)
    return AuthResponse(user=UserOut.model_validate(user), access_token=token)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    # Throttle by IP so the login endpoint cannot be used to brute-force.
    client_ip = request.client.host if request.client else "unknown"
    limiter.check(f"login:{client_ip}", limit=20, window_seconds=300)

    user = db.scalar(select(User).where(User.email == payload.email.lower().strip()))
    # Identical error for "no such user" and "wrong password" so the endpoint
    # cannot be used to enumerate registered emails.
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password."
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is disabled.")

    token = _start_session(db, user, request, response)
    return AuthResponse(user=UserOut.model_validate(user), access_token=token)


@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.core.security import decode_token

    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        auth = request.headers.get("authorization", "")
        token = auth[7:] if auth.lower().startswith("bearer ") else None

    if token:
        payload = decode_token(token)
        if payload and payload.get("sid"):
            db.query(UserSession).filter(UserSession.id == payload["sid"]).delete()
            db.commit()

    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return MessageResponse(message="Signed out.")


@router.post("/logout-all", response_model=MessageResponse)
def logout_all(response: Response, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.query(UserSession).filter(UserSession.user_id == user.id).delete()
    db.commit()
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return MessageResponse(message="Signed out of every device.")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UpdateProfileRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True, exclude_none=True)
    if "currency" in data:
        data["currency"] = data["currency"].upper()
    for key, value in data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    limiter.check(f"forgot:{client_ip}", limit=5, window_seconds=900)

    user = db.scalar(select(User).where(User.email == payload.email.lower().strip()))

    # The response is identical whether or not the account exists.
    generic = "If an account exists for that email, a reset link has been generated."

    if not user:
        return ForgotPasswordResponse(message=generic)

    raw = random_token()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=sha256(raw),
            expires_at=datetime.utcnow() + timedelta(hours=1),
        )
    )
    db.commit()

    # No mail provider is configured in this build. In development the token is
    # returned so the flow is testable end to end; in production it is withheld
    # and would be emailed instead.
    return ForgotPasswordResponse(
        message=generic,
        reset_token=raw if settings.ENVIRONMENT != "production" else None,
    )


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    record = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == sha256(payload.token))
    )
    if not record or record.used_at is not None or record.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired. Request a new one.",
        )

    user = db.get(User, record.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset link.")

    user.password_hash = hash_password(payload.password)
    record.used_at = datetime.utcnow()
    # Changing the password revokes every existing session.
    db.query(UserSession).filter(UserSession.user_id == user.id).delete()
    db.commit()

    return MessageResponse(message="Password updated. Sign in with your new password.")


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect."
        )
    user.password_hash = hash_password(payload.new_password)
    db.query(UserSession).filter(UserSession.user_id == user.id).delete()
    db.commit()
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return MessageResponse(
        message="Password changed. You have been signed out of every device - please sign in again."
    )
