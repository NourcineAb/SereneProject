"""Push notification token registration, delivery, and Stripe + RevenueCat webhook handlers."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

import stripe as stripe_lib
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Payment, Subscription, User
from ..services import push
from ..services.subscription import (
    close_active_subscriptions,
    grant_premium,
    has_active_subscription,
    revoke_premium,
)

logger = logging.getLogger(__name__)


async def _commit_webhook(db: AsyncSession) -> None:
    """Commit a webhook transaction, absorbing duplicate-delivery races.

    Stripe/RevenueCat may re-deliver the same event concurrently; the unique
    indexes on provider ids then raise ``IntegrityError``. We roll back so the
    transaction is consistent and the duplicate event is simply dropped.
    """
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        logger.warning("webhook commit hit duplicate (IntegrityError) — rolled back")

router = APIRouter(tags=["integrations"])

# RevenueCat event types that grant / revoke premium.
_GRANT_EVENTS = {"INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE"}
_REVOKE_EVENTS = {"CANCELLATION", "EXPIRATION"}


# ─── Push token registration ────────────────────────────────────────────────

class PushTokenIn(BaseModel):
    expo_push_token: str


@router.post("/push/register")
async def register_push_token(
    body: PushTokenIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Persist the Expo push token for the authenticated user."""
    user.expo_push_token = body.expo_push_token
    db.add(user)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── Push delivery ───────────────────────────────────────────────────────────

@router.post("/push/daily-checkin")
async def trigger_daily_checkin(
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> dict:
    """Trigger daily check-in reminders for all eligible users.

    Protected by the ``CRON_SECRET`` shared secret.  Vercel Cron injects this
    as ``Authorization: Bearer <token>``.  Manual callers must do the same.
    """
    secret = settings.cron_secret
    if secret:
        token = (authorization or "").replace("Bearer ", "").strip()
        if token != secret:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid cron secret")
    else:
        logger.warning("/push/daily-checkin called without CRON_SECRET configured — allowing in dev")

    sent = await push.send_daily_checkin_reminder(db)
    return {"status": "ok", "sent": sent}


# ─── RevenueCat webhook ──────────────────────────────────────────────────────

@router.post("/webhooks/revenuecat", status_code=status.HTTP_200_OK)
async def revenuecat_webhook(
    request: Request,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Handle RevenueCat subscription lifecycle events.

    RevenueCat sends the configured shared secret in the Authorization header
    as a plain string (not a Bearer token).  We verify it before processing.
    """
    # Verify shared secret when one is configured.
    secret = settings.revenuecat_webhook_secret
    if secret:
        if authorization != secret:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid webhook secret")

    payload = await request.json()

    event: dict = payload.get("event", {})
    event_type: str = event.get("type", "")
    app_user_id: str | None = event.get("app_user_id")

    if event_type not in (_GRANT_EVENTS | _REVOKE_EVENTS):
        logger.info("revenuecat_webhook: ignoring unknown event type=%s", event_type)
        return {"status": "ignored"}

    if not app_user_id:
        logger.warning("revenuecat_webhook: missing app_user_id in event type=%s", event_type)
        return {"status": "ignored"}

    # app_user_id is the user's numeric id serialised as a string.
    try:
        user_id = int(app_user_id)
    except ValueError:
        logger.warning("revenuecat_webhook: non-numeric app_user_id=%s", app_user_id)
        return {"status": "ignored"}

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        logger.warning("revenuecat_webhook: user id=%s not found", user_id)
        return {"status": "ignored"}

    if event_type in _GRANT_EVENTS:
        # ── Record a real subscription + payment for the backoffice ──────────
        price = event.get("price")
        try:
            price = float(price) if price is not None else None
        except (TypeError, ValueError):
            price = None
        period_end = None
        exp_ms = event.get("expiration_at_ms")
        if exp_ms:
            try:
                period_end = datetime.fromtimestamp(int(exp_ms) / 1000, tz=timezone.utc)
            except (TypeError, ValueError, OSError):
                period_end = None
        period_type = str(event.get("period_type", "")).upper()
        is_trial = period_type == "TRIAL"
        await grant_premium(
            db,
            user,
            source="revenuecat",
            plan="yearly" if str(event.get("product_id", "")).lower().find("year") >= 0 else "monthly",
            price=price,
            currency=str(event.get("currency") or "USD"),
            period_end=period_end,
            is_trial=is_trial,
            provider="revenuecat",
        )
        new_premium = True
    else:
        await revoke_premium(
            db,
            user,
            source="revenuecat",
            reason="expired" if event_type == "EXPIRATION" else "canceled",
            provider="revenuecat",
        )
        new_premium = False

    logger.info(
        "revenuecat_webhook: user id=%s is_premium set to %s via event %s",
        user_id, new_premium, event_type,
    )
    return {"status": "ok"}


# ─── Stripe webhook ──────────────────────────────────────────────────────────

async def _save_stripe_subscription_record(
    db: AsyncSession, user: User, stripe_sub: dict, plan: str
) -> None:
    """Save or update internal Subscription record from a Stripe Subscription object."""
    from ..services.subscription import utcnow

    def _from_ts(ts) -> datetime | None:
        if not ts:
            return None
        try:
            return datetime.fromtimestamp(ts, tz=timezone.utc)
        except (ValueError, TypeError, OSError):
            return None

    stripe_sub_id = stripe_sub.get("id", "")
    stripe_status = stripe_sub.get("status", "")
    items = stripe_sub.get("items", {}).get("data", [])
    price = (items[0].get("price", {}).get("unit_amount", 0) / 100.0) if items else 0.0
    currency = (items[0].get("price", {}).get("currency", "usd")).upper() if items else "USD"

    # Faithful 1:1 mapping — the subscription object represents the real billing
    # state, not premium access. past_due/unpaid/paused/incomplete never mean a
    # working premium subscription and must not collapse into "active".
    status_map = {
        "active": "active",
        "trialing": "trial",
        "past_due": "past_due",
        "canceled": "canceled",
        "unpaid": "unpaid",
        "incomplete_expired": "expired",
        "incomplete": "incomplete",
        "paused": "paused",
    }
    internal_status = status_map.get(stripe_status, stripe_status[:16])

    period_start = _from_ts(stripe_sub.get("current_period_start"))
    period_end = _from_ts(stripe_sub.get("current_period_end"))
    canceled_at = _from_ts(stripe_sub.get("canceled_at"))

    # Find existing internal subscription for this Stripe subscription.
    existing = (
        await db.execute(
            select(Subscription).where(
                Subscription.provider_subscription_id == stripe_sub_id
            )
        )
    ).scalar_one_or_none()

    now = utcnow()
    if existing:
        existing.status = internal_status
        existing.price = price
        existing.currency = currency
        existing.current_period_start = period_start or existing.current_period_start
        existing.current_period_end = period_end or existing.current_period_end
        if canceled_at is not None:
            existing.canceled_at = canceled_at
        existing.updated_at = now
        db.add(existing)
    else:
        # Close the user's previous ACTIVE STRIPE subscriptions only. A user may
        # keep an active RevenueCat subscription — granting via Stripe must never
        # cancel the other provider's valid subscription.
        await close_active_subscriptions(db, user, "stripe")

        sub = Subscription(
            user_id=user.id,
            plan=plan,
            status=internal_status,
            price=price,
            currency=currency,
            is_trial=stripe_status == "trialing",
            provider="stripe",
            provider_subscription_id=stripe_sub_id,
            started_at=period_start or now,
            current_period_start=period_start or now,
            current_period_end=period_end,
            canceled_at=canceled_at,
        )
        db.add(sub)


@router.post("/webhooks/stripe", status_code=status.HTTP_200_OK)
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Handle Stripe subscription lifecycle events.

    Events handled:
    - invoice.paid: grant/extend premium
    - invoice.payment_failed: log failed payment
    - customer.subscription.updated: update subscription status
    - customer.subscription.deleted: revoke premium
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    secret = settings.stripe_webhook_secret
    if not secret:
        logger.warning("stripe_webhook: STRIPE_WEBHOOK_SECRET not configured — skipping signature verification")
        return {"status": "skipped"}

    try:
        event = stripe_lib.Webhook.construct_event(payload, sig_header, secret)
    except stripe_lib.SignatureVerificationError as e:
        logger.warning("stripe_webhook: invalid signature: %s", e)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid signature")
    except Exception as e:
        logger.error("stripe_webhook: error parsing event: %s", e)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid payload")

    event_type = event["type"]
    data_object = event["data"]["object"]

    if event_type == "invoice.paid":
        await _handle_invoice_paid(db, data_object)
    elif event_type == "invoice.payment_failed":
        await _handle_invoice_payment_failed(db, data_object)
    elif event_type == "customer.subscription.updated":
        await _handle_subscription_updated(db, data_object)
    elif event_type == "customer.subscription.deleted":
        await _handle_subscription_deleted(db, data_object)
    else:
        logger.info("stripe_webhook: ignoring event type=%s", event_type)

    return {"status": "ok"}


async def _handle_invoice_paid(db: AsyncSession, invoice: dict) -> None:
    """Process a successful invoice payment — grant/extend premium.

    A real payment requires ``amount_paid > 0``. A paid ``$0`` invoice (for
    example a trial invoice) records NO Payment and grants NO premium: only a
    genuinely paid invoice flips ``is_premium``.
    """
    stripe_sub_id = invoice.get("subscription")
    if not stripe_sub_id:
        logger.info("stripe_webhook: invoice.paid without subscription, skipping")
        return

    invoice_id = invoice.get("id", "")
    amount = (invoice.get("amount_paid") or 0) / 100.0
    currency = (invoice.get("currency", "usd")).upper()

    # Find user via subscription metadata.
    stripe_lib.api_key = settings.stripe_secret_key
    try:
        stripe_sub = stripe_lib.Subscription.retrieve(stripe_sub_id)
    except stripe_lib.StripeError as e:
        logger.error("stripe_webhook: failed to retrieve subscription %s: %s", stripe_sub_id, e)
        return

    metadata = stripe_sub.get("metadata", {})
    user_id_str = metadata.get("user_id")
    plan = metadata.get("plan", "monthly")

    if not user_id_str:
        logger.warning("stripe_webhook: missing user_id in subscription metadata for sub %s", stripe_sub_id)
        return

    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        logger.warning("stripe_webhook: invalid user_id=%s in sub %s", user_id_str, stripe_sub_id)
        return

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        logger.warning("stripe_webhook: user id=%s not found for sub %s", user_id, stripe_sub_id)
        return

    # Sync the internal subscription record (faithful status → no free grant).
    await _save_stripe_subscription_record(db, user, stripe_sub, plan)

    # $0 invoice paid — sync the record but NEVER treat it as a payment.
    if amount <= 0:
        await _commit_webhook(db)
        logger.info(
            "stripe_webhook: invoice %s paid but amount=$0 — no payment, no premium (user %s)",
            invoice_id, user_id,
        )
        return

    # Idempotency: skip if this invoice was already recorded as succeeded.
    existing_payment = (
        await db.execute(
            select(Payment).where(Payment.provider_payment_id == invoice_id)
        )
    ).scalar_one_or_none()
    if existing_payment is not None and existing_payment.status == "succeeded":
        logger.info("stripe_webhook: invoice %s already processed, skipping", invoice_id)
        await _commit_webhook(db)
        return

    internal_sub = (
        await db.execute(
            select(Subscription).where(Subscription.provider_subscription_id == stripe_sub_id)
        )
    ).scalar_one_or_none()

    if existing_payment is not None and existing_payment.status == "failed":
        # A previous payment_failed webhook for THIS invoice must not block the
        # later success: upgrade the existing row instead of creating a new one.
        existing_payment.status = "succeeded"
        existing_payment.amount = amount
        existing_payment.currency = currency
        if internal_sub is not None:
            existing_payment.subscription_id = internal_sub.id
        existing_payment.paid_at = datetime.now(timezone.utc)
        db.add(existing_payment)
    else:
        db.add(
            Payment(
                user_id=user.id,
                subscription_id=internal_sub.id if internal_sub else None,
                amount=amount,
                currency=currency,
                status="succeeded",
                source="stripe",
                provider="stripe",
                provider_payment_id=invoice_id,
                paid_at=datetime.now(timezone.utc),
            )
        )

    user.is_premium = True
    db.add(user)
    await _commit_webhook(db)
    logger.info("stripe_webhook: user %s premium activated via invoice %s (amount=%s)", user_id, invoice_id, amount)


async def _handle_invoice_payment_failed(db: AsyncSession, invoice: dict) -> None:
    """Log a failed invoice payment — do NOT revoke/alter premium.

    Stripe handles grace periods and retries; revoking access here would punish
    users for a temporary failed attempt. A failed webhook must ALSO never
    downgrade a Payment that was already recorded as succeeded.
    """
    invoice_id = invoice.get("id", "")
    stripe_sub_id = invoice.get("subscription")
    amount = (invoice.get("amount_due") or 0) / 100.0
    currency = (invoice.get("currency", "usd")).upper()

    existing = (
        await db.execute(
            select(Payment).where(Payment.provider_payment_id == invoice_id)
        )
    ).scalar_one_or_none()

    if existing is not None and existing.status == "succeeded":
        logger.info(
            "stripe_webhook: invoice %s payment_failed arrived after a succeeded payment — keeping success",
            invoice_id,
        )
        return

    if existing is not None:
        existing.status = "failed"
        existing.amount = amount
        existing.currency = currency
        db.add(existing)
        await _commit_webhook(db)
        logger.info("stripe_webhook: invoice %s failed payment updated", invoice_id)
        return

    if stripe_sub_id:
        # Find user via subscription metadata.
        stripe_lib.api_key = settings.stripe_secret_key
        try:
            stripe_sub = stripe_lib.Subscription.retrieve(stripe_sub_id)
            metadata = stripe_sub.get("metadata", {})
            user_id_str = metadata.get("user_id")
        except stripe_lib.StripeError:
            user_id_str = None

        if user_id_str:
            try:
                user_id = int(user_id_str)
            except (ValueError, TypeError):
                user_id = None

            if user_id:
                db.add(
                    Payment(
                        user_id=user_id,
                        amount=amount,
                        currency=currency,
                        status="failed",
                        source="stripe",
                        provider="stripe",
                        provider_payment_id=invoice_id,
                    )
                )
                await _commit_webhook(db)
                logger.info("stripe_webhook: failed payment recorded for user %s, invoice %s", user_id, invoice_id)
                return

    logger.warning("stripe_webhook: invoice.payment_failed for invoice %s — could not identify user", invoice_id)


async def _handle_subscription_updated(db: AsyncSession, stripe_sub: dict) -> None:
    """Handle subscription status changes.

    ``is_premium`` follows real payments, never the raw Stripe status:
    - ``active``: a charge went through (invoice.paid) ⇒ premium.
    - ``canceled`` / ``incomplete_expired``: no rights ⇒ revoke.
    - ``trialing`` / ``incomplete`` / ``past_due`` / ``unpaid`` / ``paused``:
      no real, confirmed payment ⇒ premium is NEVER granted here, and is left
      unchanged (we must not silently downgrade a paying user while Stripe is
      retrying a card).
    """
    stripe_sub_id = stripe_sub.get("id", "")
    stripe_status = stripe_sub.get("status", "")
    metadata = stripe_sub.get("metadata", {})
    user_id_str = metadata.get("user_id")
    plan = metadata.get("plan", "monthly")

    if not user_id_str:
        logger.warning("stripe_webhook: subscription.updated missing user_id for sub %s", stripe_sub_id)
        return

    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        return

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        logger.warning("stripe_webhook: user id=%s not found for sub %s", user_id, stripe_sub_id)
        return

    await _save_stripe_subscription_record(db, user, stripe_sub, plan)

    if stripe_status == "active":
        user.is_premium = True
    elif stripe_status in ("canceled", "incomplete_expired"):
        if not await has_active_subscription(db, user, provider="stripe"):
            user.is_premium = False

    db.add(user)
    await _commit_webhook(db)
    logger.info("stripe_webhook: subscription %s updated → status=%s, user %s is_premium=%s",
                stripe_sub_id, stripe_status, user_id, user.is_premium)


async def _handle_subscription_deleted(db: AsyncSession, stripe_sub: dict) -> None:
    """Handle subscription cancellation — revoke premium."""
    stripe_sub_id = stripe_sub.get("id", "")
    metadata = stripe_sub.get("metadata", {})
    user_id_str = metadata.get("user_id")

    if not user_id_str:
        logger.warning("stripe_webhook: subscription.deleted missing user_id for sub %s", stripe_sub_id)
        return

    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        return

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        logger.warning("stripe_webhook: user id=%s not found for sub %s", user_id, stripe_sub_id)
        return

    await _save_stripe_subscription_record(db, user, stripe_sub, metadata.get("plan", "monthly"))

    if not await has_active_subscription(db, user, provider="stripe"):
        user.is_premium = False
    db.add(user)
    await _commit_webhook(db)
    logger.info("stripe_webhook: subscription %s deleted, user %s premium revoked", stripe_sub_id, user_id)
