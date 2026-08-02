"""Backoffice billing records — record *real* subscription and payment events.

Every premium grant / revocation is persisted here so the admin panel's
subscriptions, revenue and analytics pages reflect actual events (never mocked
values). The mobile app's behaviour is unchanged: ``is_premium`` is still the
single source of truth for the freemium gate, and these tables are only ever
read by the backoffice.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import Payment, Subscription, User

logger = logging.getLogger("serene.subscription")

_ACTIVE_STATUSES = ("active", "trial")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def grant_premium(
    db: AsyncSession,
    user: User,
    *,
    source: str = "revenuecat",
    plan: str = "monthly",
    price: float | None = None,
    currency: str = "USD",
    period_end: datetime | None = None,
    is_trial: bool = False,
) -> Subscription:
    """Grant premium and record the subscription + payment (real event)."""
    now = utcnow()
    amount = price if price is not None else settings.premium_price_monthly

    # Close any previously active subscriptions so only one is active per user.
    active = (
        await db.execute(
            select(Subscription).where(
                Subscription.user_id == user.id,
                Subscription.status.in_(_ACTIVE_STATUSES),
            )
        )
    ).scalars().all()
    for sub in active:
        sub.status = "expired" if not sub.is_trial else "canceled"
        sub.canceled_at = now
        db.add(sub)

    sub = Subscription(
        user_id=user.id,
        plan=plan,
        status="trial" if is_trial else "active",
        price=amount,
        currency=currency,
        is_trial=is_trial,
        started_at=now,
        current_period_start=now,
        current_period_end=period_end,
    )
    db.add(sub)
    await db.flush()

    if not is_trial:
        db.add(
            Payment(
                user_id=user.id,
                subscription_id=sub.id,
                amount=amount,
                currency=currency,
                status="succeeded",
                source=source,
            )
        )

    user.is_premium = True
    db.add(user)
    await db.commit()
    await db.refresh(sub)
    return sub


async def revoke_premium(
    db: AsyncSession,
    user: User,
    *,
    source: str = "revenuecat",
    reason: str = "canceled",
) -> None:
    """Revoke premium and close the user's active subscription(s)."""
    now = utcnow()
    user.is_premium = False
    db.add(user)
    active = (
        await db.execute(
            select(Subscription).where(
                Subscription.user_id == user.id,
                Subscription.status.in_(_ACTIVE_STATUSES),
            )
        )
    ).scalars().all()
    for sub in active:
        sub.status = reason
        sub.canceled_at = now
        db.add(sub)
    await db.commit()
    logger.info("Premium revoked for user %s (source=%s, reason=%s)", user.id, source, reason)
