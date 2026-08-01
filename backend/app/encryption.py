"""App-layer symmetric encryption for sensitive PII fields.

Uses Fernet (AES-128-CBC + HMAC-SHA256) from the `cryptography` package.
The key is read from settings.field_encryption_key (base64-encoded Fernet key).

In development/testing, if no key is configured plaintext is stored so
messages are always readable.  In production the config validator requires
an explicit key and all sensitive columns are encrypted at rest.

Usage — apply EncryptedText as a SQLAlchemy column type:

    note: Mapped[str | None] = mapped_column(EncryptedText, nullable=True)
"""
from __future__ import annotations

import logging

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import Text
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator

_logger = logging.getLogger("serene.encryption")

# Lazy singleton — created once per process.
_fernet: Fernet | None = None
_fernet_failed = False


def _has_key() -> bool:
    from .config import settings
    return bool(settings.field_encryption_key.strip())


def _get_fernet() -> Fernet | None:
    """Return the Fernet instance if encryption is configured, else None."""
    global _fernet, _fernet_failed
    if _fernet_failed:
        return None
    if not _has_key():
        return None
    if _fernet is not None:
        return _fernet

    from .config import settings
    try:
        _fernet = Fernet(settings.field_encryption_key.strip().encode())
        return _fernet
    except (ValueError, Exception) as exc:
        _fernet_failed = True
        _logger.error(
            "FIELD_ENCRYPTION_KEY is invalid (%s) — falling back to plaintext mode. "
            "Generate a valid key: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"",
            exc,
        )
        return None


class EncryptedText(TypeDecorator):
    """Transparent encrypt-on-write / decrypt-on-read SQLAlchemy column type.

    Stored as TEXT in the database.  When FIELD_ENCRYPTION_KEY is set, the
    ciphertext is a Fernet token (URL-safe base64).  In dev mode (no key),
    values are stored as plaintext so messages are always readable.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect: Dialect) -> str | None:
        if value is None:
            return None
        fernet = _get_fernet()
        if fernet is None:
            return value  # dev mode or invalid key: store plaintext
        try:
            token: bytes = fernet.encrypt(value.encode("utf-8"))
            return token.decode("ascii")
        except Exception as exc:
            _logger.error("Encryption failed, storing plaintext: %s", exc)
            return value

    def process_result_value(self, value: str | None, dialect: Dialect) -> str | None:
        if value is None:
            return None
        fernet = _get_fernet()
        if fernet is None:
            return value  # dev mode: value is plaintext
        try:
            plain: bytes = fernet.decrypt(value.encode("ascii"))
            return plain.decode("utf-8")
        except (InvalidToken, Exception):
            return "[encrypted]"
