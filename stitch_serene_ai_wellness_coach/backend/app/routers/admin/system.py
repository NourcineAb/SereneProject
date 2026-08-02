"""Backoffice system — infrastructure status, configuration and error logs."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import settings
from ...database import get_db
from ...deps import get_current_admin_user
from ...models import ErrorLog, User
from .common import utcnow

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/system")
async def system_health(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    db_ok = True
    db_error = None
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:  # pragma: no cover
        db_ok = False
        db_error = str(e)

    now = utcnow()
    errors_24h = (
        await db.execute(select(func.count(ErrorLog.id)).where(ErrorLog.created_at >= now - timedelta(hours=24)))
    ).scalar() or 0

    return {
        "database": {"ok": db_ok, "error": db_error},
        "errors_24h": errors_24h,
        "config": {
            "environment": settings.environment,
            "llm_primary": settings.llm_primary,
            "llm_model": settings.openrouter_model,
            "monetization_mode": settings.monetization_mode,
            "free_sessions_per_week": settings.free_sessions_per_week,
            "rate_limit_enabled": settings.rate_limit_enabled,
            "rate_limit_chat": settings.rate_limit_chat,
            "field_encryption_enabled": bool(settings.field_encryption_key),
            "premium_price_monthly": settings.premium_price_monthly,
            "premium_price_yearly": settings.premium_price_yearly,
            "cors_origins": ", ".join(settings.cors_list),
        },
    }


@router.get("/system/errors")
async def system_error_logs(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    total = (await db.execute(select(func.count(ErrorLog.id)))).scalar() or 0
    rows = (
        (
            await db.execute(
                select(ErrorLog)
                .order_by(ErrorLog.created_at.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        )
        .scalars()
        .all()
    )
    return {
        "errors": [
            {
                "id": e.id,
                "source": e.source,
                "method": e.method,
                "path": e.path,
                "message": (e.message or "")[:500],
                "detail": e.detail,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in rows
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),
    }
