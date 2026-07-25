import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..limiter import limiter
from ..models import MoodLog, PasswordReset, Session, User, EmailVerification
from ..schemas import (
    ChangePasswordIn,
    LoginIn,
    RefreshIn,
    RegisterIn,
    RequestPasswordResetIn,
    ResetPasswordIn,
    SocialLoginIn,
    Token,
    UpdateProfileIn,
    UserExportOut,
    UserOut,
)
from ..services.email import send_email
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
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un compte existe déjà avec cette adresse email. Connectez-vous ou utilisez un autre email.",
        )
    user = User(email=body.email, name=body.name, hashed_password=hash_password(body.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _make_token_pair(user)


@router.post("/social-login", response_model=Token, status_code=201)
async def social_login(
    body: Annotated[SocialLoginIn, Body()],
    db: AsyncSession = Depends(get_db),
):
    """Sign in / sign up via Apple or Google.

    The mobile client performs the OAuth flow and forwards the identity
    provider's token together with the verified email. We find-or-create the
    user by email and issue our own JWT pair. Social accounts are treated as
    pre-verified (no password).
    """
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not user:
        user = User(
            email=body.email,
            name=body.name or "Friend",
            hashed_password="",  # social accounts have no local password
            email_verified=True,
        )
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


@router.put("/me", response_model=UserOut)
async def update_me(
    body: UpdateProfileIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.name = body.name
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.put("/password", status_code=200)
async def change_password(
    body: ChangePasswordIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    if body.current_password == body.new_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "New password must be different")
    user.hashed_password = hash_password(body.new_password)
    user.token_version = (user.token_version or 0) + 1
    db.add(user)
    await db.commit()
    return {"message": "Password changed successfully"}


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


# ─── Password reset ─────────────────────────────────────────────────────────

@router.post("/password-reset/request", status_code=202)
@limiter.limit(settings.rate_limit_login, exempt_when=lambda: not settings.rate_limit_enabled)
async def request_password_reset(
    request: Request,
    body: RequestPasswordResetIn,
    db: AsyncSession = Depends(get_db),
):
    """Request a password reset. Always returns 202 to prevent email enumeration.

    In production, send the token via email. For now, the token is logged
    server-side and can be used via the /password-reset/complete endpoint.
    """
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if user:
        # Invalidate any existing unused reset tokens for this user.
        existing = (await db.execute(
            select(PasswordReset).where(
                PasswordReset.user_id == user.id,
                PasswordReset.used == False,  # noqa: E712
            )
        )).scalars().all()
        for token_row in existing:
            token_row.used = True
            db.add(token_row)

        # Create a new reset token (valid for 1 hour).
        reset_token = secrets.token_urlsafe(48)
        db.add(PasswordReset(user_id=user.id, token=reset_token))
        await db.commit()

        # Deliver the reset link (sent if SMTP is configured, else logged).
        link = f"{settings.app_base_url}/forgot-password?token={reset_token}"
        await send_email(
            to=body.email,
            subject="Réinitialisez votre mot de passe Serene",
            html=(
                "<p>Bonjour,</p>"
                "<p>Une demande de réinitialisation de mot de passe a été effectuée "
                "pour votre compte Serene.</p>"
                f'<p><a href="{link}">Réinitialiser mon mot de passe</a></p>'
                f"<p>Si le bouton ne fonctionne pas, utilisez ce code : <b>{reset_token}</b></p>"
                "<p>Ce lien expire dans 1 heure.</p>"
            ),
        )
        logger.info("Password reset token for %s: %s", body.email, reset_token)

    # Always return 202 regardless of whether the email exists.
    return {"message": "If this email is registered, a reset link has been sent."}


@router.post("/password-reset/complete", status_code=200)
async def complete_password_reset(
    body: ResetPasswordIn,
    db: AsyncSession = Depends(get_db),
):
    """Complete a password reset using the token received via email."""
    reset = (await db.execute(
        select(PasswordReset).where(
            PasswordReset.token == body.token,
            PasswordReset.used == False,  # noqa: E712
        )
    )).scalar_one_or_none()

    if not reset:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset token")

    # Check token age (1 hour max).
    age = datetime.now(timezone.utc) - reset.created_at.replace(tzinfo=timezone.utc)
    if age > timedelta(hours=1):
        reset.used = True
        db.add(reset)
        await db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reset token has expired")

    # Mark token as used.
    reset.used = True
    db.add(reset)

    # Update the user's password.
    user = (await db.execute(select(User).where(User.id == reset.user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "User not found")

    user.hashed_password = hash_password(body.new_password)
    # Bump token_version to invalidate all existing sessions.
    user.token_version = (user.token_version or 0) + 1
    db.add(user)
    await db.commit()

    return {"message": "Password has been reset successfully"}


# ─── Email verification ────────────────────────────────────────────────────

@router.post("/verify-email/request", status_code=202)
@limiter.limit(settings.rate_limit_login, exempt_when=lambda: not settings.rate_limit_enabled)
async def request_email_verification(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Request an email verification link. Always returns 202."""
    if user.email_verified:
        return {"message": "Email is already verified"}

    # Invalidate any existing unused verification tokens.
    existing = (await db.execute(
        select(EmailVerification).where(
            EmailVerification.user_id == user.id,
            EmailVerification.used == False,  # noqa: E712
        )
    )).scalars().all()
    for token_row in existing:
        token_row.used = True
        db.add(token_row)

    # Create a new verification token (valid for 24 hours).
    verify_token = secrets.token_urlsafe(48)
    db.add(EmailVerification(user_id=user.id, token=verify_token))
    await db.commit()

    # Deliver the verification link (sent if SMTP is configured, else logged).
    link = f"{settings.app_base_url}/verify-email?token={verify_token}"
    await send_email(
        to=user.email,
        subject="Vérifiez votre adresse email Serene",
        html=(
            "<p>Bonjour,</p>"
            "<p>Merci de rejoindre Serene. Veuillez confirmer votre adresse email "
            "pour sécuriser votre compte.</p>"
            f'<p><a href="{link}">Vérifier mon email</a></p>'
            f"<p>Si le bouton ne fonctionne pas, utilisez ce code : <b>{verify_token}</b></p>"
            "<p>Ce lien expire dans 24 heures.</p>"
        ),
    )
    logger.info("Email verification token for %s: %s", user.email, verify_token)

    return {"message": "Verification link sent"}


@router.post("/verify-email/complete", status_code=200)
async def complete_email_verification(
    token: str = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
):
    """Complete email verification using the token received via email."""
    verification = (await db.execute(
        select(EmailVerification).where(
            EmailVerification.token == token,
            EmailVerification.used == False,  # noqa: E712
        )
    )).scalar_one_or_none()

    if not verification:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired verification token")

    # Check token age (24 hours max).
    age = datetime.now(timezone.utc) - verification.created_at.replace(tzinfo=timezone.utc)
    if age > timedelta(hours=24):
        verification.used = True
        db.add(verification)
        await db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Verification token has expired")

    # Mark token as used and verify the user's email.
    verification.used = True
    db.add(verification)

    user = (await db.execute(select(User).where(User.id == verification.user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "User not found")

    user.email_verified = True
    db.add(user)
    await db.commit()

    return {"message": "Email verified successfully"}
