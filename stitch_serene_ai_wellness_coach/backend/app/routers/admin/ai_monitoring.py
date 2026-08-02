"""Backoffice AI monitoring — real LLM usage, latency, errors and consumption."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...deps import get_current_admin_user
from ...models import AIUsageLog, User
from .common import utcnow

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/ai-monitoring")
async def ai_monitoring(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(30, ge=1, le=90),
):
    now = utcnow()
    since = now - timedelta(days=days)

    total = (await db.execute(select(func.count(AIUsageLog.id)).where(AIUsageLog.created_at >= since))).scalar() or 0
    errors = (
        await db.execute(
            select(func.count(AIUsageLog.id)).where(
                AIUsageLog.created_at >= since, AIUsageLog.status == "error"
            )
        )
    ).scalar() or 0
    avg_latency = (
        await db.execute(
            select(func.avg(AIUsageLog.latency_ms)).where(
                AIUsageLog.created_at >= since, AIUsageLog.latency_ms.isnot(None)
            )
        )
    ).scalar()
    total_tokens = (
        await db.execute(
            select(func.coalesce(func.sum(AIUsageLog.total_tokens), 0)).where(AIUsageLog.created_at >= since)
        )
    ).scalar() or 0
    prompt_tokens = (
        await db.execute(
            select(func.coalesce(func.sum(AIUsageLog.prompt_tokens), 0)).where(AIUsageLog.created_at >= since)
        )
    ).scalar() or 0
    completion_tokens = (
        await db.execute(
            select(func.coalesce(func.sum(AIUsageLog.completion_tokens), 0)).where(AIUsageLog.created_at >= since)
        )
    ).scalar() or 0

    # Models used (real).
    model_rows = (
        await db.execute(
            select(
                AIUsageLog.model,
                func.count(AIUsageLog.id),
                func.sum(text("CASE WHEN ai_usage_logs.status='error' THEN 1 ELSE 0 END")),
                func.avg(AIUsageLog.latency_ms),
                func.coalesce(func.sum(AIUsageLog.total_tokens), 0),
            )
            .where(AIUsageLog.created_at >= since)
            .group_by(AIUsageLog.model)
            .order_by(func.count(AIUsageLog.id).desc())
        )
    ).all()
    models_used = [
        {
            "model": m or "unknown",
            "requests": int(c),
            "errors": int(e or 0),
            "avg_latency_ms": round(float(l or 0), 1),
            "tokens": int(t or 0),
        }
        for m, c, e, l, t in model_rows
    ]

    # Time-series (requests / errors / latency per day).
    ts_rows = (
        await db.execute(
            select(
                func.date(AIUsageLog.created_at).label("day"),
                func.count(AIUsageLog.id),
                func.sum(text("CASE WHEN ai_usage_logs.status='error' THEN 1 ELSE 0 END")),
                func.avg(AIUsageLog.latency_ms),
            )
            .where(AIUsageLog.created_at >= since)
            .group_by(text("day"))
            .order_by(text("day"))
        )
    ).all()
    timeseries = [
        {
            "date": str(r.day),
            "requests": int(r.count),
            "errors": int(r.sum or 0),
            "avg_latency": round(float(r.avg or 0), 1),
        }
        for r in ts_rows
    ]

    # Recent errors.
    recent_errors = (
        (
            await db.execute(
                select(AIUsageLog).where(AIUsageLog.status == "error").order_by(AIUsageLog.created_at.desc()).limit(20)
            )
        )
        .scalars()
        .all()
    )
    recent_errors_out = [
        {
            "id": e.id,
            "model": e.model,
            "error": (e.error or "")[:300],
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in recent_errors
    ]

    return {
        "overview": {
            "total_requests": total,
            "success": total - errors,
            "errors": errors,
            "error_rate": round(errors / total * 100, 1) if total else 0,
            "avg_latency_ms": round(float(avg_latency or 0), 1),
            "total_tokens": int(total_tokens),
            "prompt_tokens": int(prompt_tokens),
            "completion_tokens": int(completion_tokens),
        },
        "models_used": models_used,
        "timeseries": timeseries,
        "recent_errors": recent_errors_out,
    }
