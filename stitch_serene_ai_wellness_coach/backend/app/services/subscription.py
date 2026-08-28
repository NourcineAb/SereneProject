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

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import Payment, Subscription, User

logger = logging.getLogger("serene.subscription")

_ACTIVE_STATUSES = ("active", "trial")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def close_active_subscriptions(db: AsyncSession, user: User, provider: str) -> None:
    """Close the user's active subscriptions for ONE provider only.

    Stripe and RevenueCat subscriptions coexist: a grant (or webhook sync) for
    one provider must NEVER close the other provider's active subscription.
    """
    now = utcnow()
    active = (
        await db.execute(
            select(Subscription).where(
                Subscription.user_id == user.id,
                Subscription.status.in_(_ACTIVE_STATUSES),
                Subscription.provider == provider,
            )
        )
    ).scalars().all()
    for sub in active:
        sub.status = "expired" if not sub.is_trial else "canceled"
        sub.canceled_at = now
        db.add(sub)


async def has_active_subscription(
    db: AsyncSession, user: User, *, provider: str | None = None
) -> bool:
    """True if the user still has at least one active subscription.

    When ``provider`` is given, subscriptions of that provider are excluded so
    callers can revoke one provider without downgrading premium while another
    provider's subscription is still valid.
    """
    query = (
        select(func.count())
        .select_from(Subscription)
        .where(
            Subscription.user_id == user.id,
            Subscription.status.in_(_ACTIVE_STATUSES),
        )
    )
    if provider is not None:
        query = query.where(Subscription.provider != provider)
    return ((await db.execute(query)).scalar() or 0) > 0


async def grant_premium(
    db: AsyncSession,
    user: User,
    *,
    source: str = "stripe",
    plan: str = "monthly",
    price: float | None = None,
    currency: str = "USD",
    period_end: datetime | None = None,
    is_trial: bool = False,
    provider: str = "stripe",
    provider_subscription_id: str | None = None,
    provider_payment_id: str | None = None,
) -> Subscription:
    """Grant premium and record the subscription + payment (real event)."""
    now = utcnow()
    amount = price if price is not None else settings.premium_price_monthly

    # Close only the SAME provider's previous active subscription. A grant from
    # Stripe (or RevenueCat) must never close the other provider's valid sub.
    await close_active_subscriptions(db, user, provider)

    sub = Subscription(
        user_id=user.id,
        plan=plan,
        status="trial" if is_trial else "active",
        price=amount,
        currency=currency,
        is_trial=is_trial,
        provider=provider,
        provider_subscription_id=provider_subscription_id,
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
                provider=provider,
                provider_payment_id=provider_payment_id,
                paid_at=now,
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
    source: str = "stripe",
    reason: str = "canceled",
    provider: str | None = None,
) -> None:
    """Revoke premium and close the user's active subscription(s).

    ``provider`` limits the revocation to a single provider (Stripe or
    RevenueCat): the other provider's subscriptions are left untouched. Premium
    is only downgraded when NO other valid subscription remains, so one provider
    revoking never cancels a user who is still paying through the other.
    """
    now = utcnow()
    query = select(Subscription).where(
        Subscription.user_id == user.id,
        Subscription.status.in_(_ACTIVE_STATUSES),
    )
    if provider is not None:
        query = query.where(Subscription.provider == provider)
    active = (await db.execute(query)).scalars().all()
    for sub in active:
        sub.status = reason
        sub.canceled_at = now
        sub.updated_at = now
        db.add(sub)

    if not await has_active_subscription(db, user):
        user.is_premium = False
    db.add(user)
    await db.commit()
    logger.info(
        "Premium revoked for user %s (source=%s, reason=%s, provider=%s, is_premium=%s)",
        user.id, source, reason, provider, user.is_premium,
    )
