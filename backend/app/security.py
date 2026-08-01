from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_TYPE_ACCESS = "access"
_TYPE_REFRESH = "refresh"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, token_version: int = 0) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": subject,
        "exp": expire,
        "type": _TYPE_ACCESS,
        "ver": token_version,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.access_token_algo)


def create_refresh_token(subject: str, token_version: int = 0) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    payload = {
        "sub": subject,
        "exp": expire,
        "type": _TYPE_REFRESH,
        "ver": token_version,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.access_token_algo)


def decode_token(token: str, expected_type: str = _TYPE_ACCESS) -> Optional[dict]:
    """Decode and validate a JWT. Returns the full payload dict or None on failure."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.access_token_algo])
        if payload.get("type") != expected_type:
            return None
        return payload
    except JWTError:
        return None
