"""Backoffice payments — list and view individual payment records."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...deps import get_current_admin_user
from ...models import Payment, User
from .common import utcnow

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/payments")
async def list_payments(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    status_filter: str = Query("", alias="status", description="pending|succeeded|failed|refunded|canceled"),
    provider: str = Query("", description="stripe|revenuecat|admin"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List payment records with optional filters."""
    query = select(Payment)
    count_query = select(func.count(Payment.id))

    if status_filter:
        query = query.where(Payment.status == status_filter)
        count_query = count_query.where(Payment.status == status_filter)
    if provider:
        query = query.where(Payment.provider == provider)
        count_query = count_query.where(Payment.provider == provider)

    total = (await db.execute(count_query)).scalar() or 0
    payments = (
        (
            await db.execute(
                query.order_by(Payment.created_at.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        )
        .scalars()
        .all()
    )

    result = []
    for p in payments:
        user = (
            await db.execute(select(User).where(User.id == p.user_id))
        ).scalar_one_or_none()
        result.append(
            {
                "id": p.id,
                "user_id": p.user_id,
                "email": user.email if user else None,
                "name": user.name if user else None,
                "amount": p.amount,
                "currency": p.currency,
                "status": p.status,
                "provider": p.provider,
                "provider_payment_id": p.provider_payment_id,
                "source": p.source,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
                "subscription_id": p.subscription_id,
            }
        )

    return {
        "payments": result,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),
    }


@router.get("/payments/overview")
async def payments_overview(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Payment statistics for the backoffice dashboard."""
    now = utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_revenue = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.status == "succeeded"
            )
        )
    ).scalar() or 0

    month_revenue = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.status == "succeeded",
                Payment.created_at >= month_start,
            )
        )
    ).scalar() or 0

    total_count = (await db.execute(select(func.count(Payment.id)))).scalar() or 0
    succeeded_count = (
        await db.execute(
            select(func.count(Payment.id)).where(Payment.status == "succeeded")
        )
    ).scalar() or 0
    failed_count = (
        await db.execute(
            select(func.count(Payment.id)).where(Payment.status == "failed")
        )
    ).scalar() or 0
    pending_count = (
        await db.execute(
            select(func.count(Payment.id)).where(Payment.status == "pending")
        )
    ).scalar() or 0

    return {
        "total_revenue": round(float(total_revenue), 2),
        "month_revenue": round(float(month_revenue), 2),
        "total_count": total_count,
        "succeeded_count": succeeded_count,
        "failed_count": failed_count,
        "pending_count": pending_count,
    }
