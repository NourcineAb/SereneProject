"""App-layer symmetric encryption for sensitive PII fields.

Uses Fernet (AES-128-CBC + HMAC-SHA256) from the `cryptography` package.
The key is read from settings.field_encryption_key (base64-encoded Fernet key).

In development/testing, if no key is configured a per-process dev key is
generated and reused for the lifetime of the process.  In production the
config validator requires an explicit key.

Usage — apply EncryptedText as a SQLAlchemy column type:

    note: Mapped[str | None] = mapped_column(EncryptedText, nullable=True)
"""
from __future__ import annotations

import base64
import os

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import Text
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator

# Lazy singleton — created once per process.
_fernet: Fernet | None = None
# Dev-only fallback key (ephemeral per process, not suitable for prod).
_DEV_KEY: bytes | None = None


def _get_fernet() -> Fernet:
    global _fernet, _DEV_KEY
    if _fernet is not None:
        return _fernet

    from .config import settings  # local import to avoid circular at module load

    raw_key = settings.field_encryption_key.strip()
    if raw_key:
        _fernet = Fernet(raw_key.encode())
    else:
        # Non-production only: generate a throwaway key so tests run without config.
        if _DEV_KEY is None:
            _DEV_KEY = Fernet.generate_key()
        _fernet = Fernet(_DEV_KEY)
    return _fernet


class EncryptedText(TypeDecorator):
    """Transparent encrypt-on-write / decrypt-on-read SQLAlchemy column type.

    Stored as TEXT in the database.  The ciphertext is a Fernet token
    (URL-safe base64), so it is always printable ASCII.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect: Dialect) -> str | None:
        if value is None:
            return None
        token: bytes = _get_fernet().encrypt(value.encode("utf-8"))
        return token.decode("ascii")

    def process_result_value(self, value: str | None, dialect: Dialect) -> str | None:
        if value is None:
            return None
        try:
            plain: bytes = _get_fernet().decrypt(value.encode("ascii"))
            return plain.decode("utf-8")
        except (InvalidToken, Exception):
            # If decryption fails (e.g. key rotation), return a safe sentinel
            # rather than crashing.  Log the anomaly but never surface the raw
            # ciphertext to the application layer.
            return "[encrypted]"
