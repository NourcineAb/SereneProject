"""Backoffice subscriptions — active, expiring, history and revenue."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...deps import get_current_admin_user
from ...models import Payment, Subscription, User
from .common import utcnow

router = APIRouter(prefix="/admin", tags=["admin"])

_ACTIVE = ("active", "trial")


@router.get("/subscriptions/overview")
async def subscriptions_overview(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    now = utcnow()

    async def _count(where) -> int:
        return (await db.execute(select(func.count(Subscription.id)).where(where))).scalar() or 0

    active = await _count(Subscription.status == "active")
    trials = await _count(Subscription.status == "trial")
    canceled = await _count(Subscription.status == "canceled")
    expired = await _count(Subscription.status == "expired")
    expiring_7d = await _count(
        Subscription.status.in_(_ACTIVE)
        & Subscription.current_period_end.isnot(None)
        & (Subscription.current_period_end > now)
        & (Subscription.current_period_end <= now + timedelta(days=7))
    )
    mrr = (
        await db.execute(
            select(func.coalesce(func.sum(Subscription.price), 0)).where(
                Subscription.status == "active"
            )
        )
    ).scalar() or 0
    revenue_total = (
        await db.execute(select(func.coalesce(func.sum(Payment.amount), 0)))
    ).scalar() or 0
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    revenue_month = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.created_at >= month_start
            )
        )
    ).scalar() or 0

    # Upcoming expirations (next 7 days).
    expiring_rows = (
        await db.execute(
            select(Subscription)
            .where(
                Subscription.status.in_(_ACTIVE),
                Subscription.current_period_end.isnot(None),
                Subscription.current_period_end > now,
                Subscription.current_period_end <= now + timedelta(days=7),
            )
            .order_by(Subscription.current_period_end)
            .limit(50)
        )
    ).scalars().all()
    expiring = []
    for s in expiring_rows:
        user = (
            await db.execute(select(User).where(User.id == s.user_id))
        ).scalar_one_or_none()
        expiring.append(
            {
                "id": s.id,
                "user_id": s.user_id,
                "email": user.email if user else None,
                "name": user.name if user else None,
                "plan": s.plan,
                "price": s.price,
                "period_end": s.current_period_end.isoformat() if s.current_period_end else None,
            }
        )

    return {
        "active": active,
        "trials": trials,
        "canceled": canceled,
        "expired": expired,
        "expiring_7d": expiring_7d,
        "mrr": round(float(mrr or 0), 2),
        "revenue_total": round(float(revenue_total or 0), 2),
        "revenue_month": round(float(revenue_month or 0), 2),
        "expiring": expiring,
    }


@router.get("/subscriptions")
async def list_subscriptions(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    status: str = Query("", description="active|trial|canceled|expired"),
    provider: str = Query("", description="stripe|revenuecat|admin"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    query = select(Subscription)
    count_query = select(func.count(Subscription.id))
    if status:
        query = query.where(Subscription.status == status)
        count_query = count_query.where(Subscription.status == status)
    if provider:
        query = query.where(Subscription.provider == provider)
        count_query = count_query.where(Subscription.provider == provider)

    total = (await db.execute(count_query)).scalar() or 0
    subs = (
        (
            await db.execute(
                query.order_by(Subscription.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
            )
        )
        .scalars()
        .all()
    )

    result = []
    for s in subs:
        user = (
            await db.execute(select(User).where(User.id == s.user_id))
        ).scalar_one_or_none()
        result.append(
            {
                "id": s.id,
                "user_id": s.user_id,
                "email": user.email if user else None,
                "name": user.name if user else None,
                "plan": s.plan,
                "status": s.status,
                "provider": s.provider,
                "price": s.price,
                "currency": s.currency,
                "is_trial": s.is_trial,
                "provider_subscription_id": s.provider_subscription_id,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "period_end": s.current_period_end.isoformat() if s.current_period_end else None,
                "canceled_at": s.canceled_at.isoformat() if s.canceled_at else None,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
        )

    return {
        "subscriptions": result,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),
    }
