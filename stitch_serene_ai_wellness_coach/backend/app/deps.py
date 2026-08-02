from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db
from .models import User
from .security import decode_token

bearer = HTTPBearer(auto_error=True)

# Throttle window for persisting last_login_at (avoids a write on every request).
_LOGIN_UPDATE_INTERVAL = timedelta(minutes=10)


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(creds.credentials, expected_type="access")
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    email = payload.get("sub")
    if not email:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    # Suspended accounts are blocked at the API boundary (server-side enforcement).
    if user.is_suspended:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Votre compte a été suspendu. Contactez le support pour plus d'informations.",
        )
    # Token revocation: check token_version matches what was issued.
    token_ver = payload.get("ver", 0)
    if token_ver != user.token_version:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token has been revoked")
    # Track real last-connection time for the backoffice (throttled write).
    now = datetime.now(timezone.utc)
    last = user.last_login_at
    # SQLite stores datetimes naive; Postgres returns aware. Normalize before comparing.
    if last is not None and last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    if last is None or now - last > _LOGIN_UPDATE_INTERVAL:
        user.last_login_at = now
        db.add(user)
        await db.commit()
    return user


async def get_current_admin_user(
    user: User = Depends(get_current_user),
) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


async def get_current_admin_user(
    user: User = Depends(get_current_user),
) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user
