import logging
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..limiter import limiter
from ..models import MoodLog, Session, User
from ..schemas import (
    LoginIn,
    RefreshIn,
    RegisterIn,
    Token,
    UserExportOut,
    UserOut,
)
from ..security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

logger = logging.getLogger("serene.auth")
router = APIRouter(prefix="/auth", tags=["auth"])


def _make_token_pair(user: User) -> Token:
    return Token(
        access_token=create_access_token(user.email, user.token_version),
        refresh_token=create_refresh_token(user.email, user.token_version),
    )


@router.post("/register", response_model=Token, status_code=201)
@limiter.limit(settings.rate_limit_register, exempt_when=lambda: not settings.rate_limit_enabled)
async def register(
    request: Request,
    body: Annotated[RegisterIn, Body()],
    db: AsyncSession = Depends(get_db),
):
    exists = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(email=body.email, name=body.name, hashed_password=hash_password(body.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _make_token_pair(user)


@router.post("/login", response_model=Token)
@limiter.limit(settings.rate_limit_login, exempt_when=lambda: not settings.rate_limit_enabled)
async def login(
    request: Request,
    body: Annotated[LoginIn, Body()],
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    return _make_token_pair(user)


@router.post("/refresh", response_model=Token)
async def refresh(body: RefreshIn, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token, expected_type="refresh")
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")
    email = payload.get("sub")
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    token_ver = payload.get("ver", 0)
    if token_ver != user.token_version:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token has been revoked")
    return _make_token_pair(user)


@router.post("/logout", status_code=204)
async def logout(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Bump token_version so all issued tokens become invalid immediately."""
    user.token_version = (user.token_version or 0) + 1
    db.add(user)
    await db.commit()


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


@router.get("/me/export", response_model=UserExportOut)
async def export_me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """RGPD Art. 20 — export all personal data for the authenticated user."""
    from ..models import Message

    sessions = (await db.execute(
        select(Session).where(Session.user_id == user.id).order_by(Session.created_at)
    )).scalars().all()

    sessions_data = []
    for s in sessions:
        msgs = (await db.execute(
            select(Message).where(Message.session_id == s.id).order_by(Message.id)
        )).scalars().all()
        sessions_data.append({
            "id": s.id,
            "title": s.title,
            "created_at": s.created_at.isoformat(),
            "messages": [
                {
                    "id": m.id,
                    "role": m.role,
                    "content": m.content,
                    "technique": m.technique,
                    "created_at": m.created_at.isoformat(),
                }
                for m in msgs
            ],
        })

    mood_logs = (await db.execute(
        select(MoodLog).where(MoodLog.user_id == user.id).order_by(MoodLog.created_at)
    )).scalars().all()

    return UserExportOut(
        profile={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "is_premium": user.is_premium,
            "created_at": user.created_at.isoformat(),
        },
        sessions=sessions_data,
        mood_logs=[
            {
                "id": ml.id,
                "score": ml.score,
                "label": ml.label,
                "note": ml.note,
                "created_at": ml.created_at.isoformat(),
            }
            for ml in mood_logs
        ],
    )


@router.delete("/me", status_code=204)
async def delete_me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """RGPD Art. 17 — delete the authenticated user and all their data (cascade)."""
    await db.delete(user)
    await db.commit()
    logger.info("RGPD: deleted user id=%s and all associated data", user.id)
