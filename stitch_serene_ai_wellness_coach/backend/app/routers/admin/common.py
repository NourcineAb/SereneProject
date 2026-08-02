"""Shared helpers for the admin (backoffice) router package."""
from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...models import AdminAuditLog, User

_TECHNIQUE_LABELS = {
    "box_breathing": "Respiration carrée",
    "grounding_54321": "Ancrage 5-4-3-2-1",
    "cognitive_reframing": "Reformulation cognitive",
    "pmr": "Relaxation musculaire",
    "journaling": "Journaling",
}


def technique_label(value: str | None) -> str:
    return _TECHNIQUE_LABELS.get(value, value or "unknown")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def today_utc() -> date:
    return datetime.now(timezone.utc).date()


def client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    return request.client.host if request.client else None


async def log_audit(
    db: AsyncSession,
    admin: User | None,
    action: str,
    *,
    target_user_id: int | None = None,
    details: str | None = None,
    result: str = "success",
    request: Request | None = None,
) -> None:
    """Record an admin action in the immutable audit trail (best-effort)."""
    try:
        db.add(
            AdminAuditLog(
                admin_user_id=admin.id if admin else None,
                action=action,
                target_user_id=target_user_id,
                details=details,
                result=result,
                ip=client_ip(request),
            )
        )
        await db.commit()
    except Exception:
        await db.rollback()
