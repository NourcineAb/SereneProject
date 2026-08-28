"""Billing routes — Stripe SetupIntent → PaymentMethod → Subscription + dev-only mock premium toggle.

Production ``is_premium`` is driven ONLY by the verified Stripe webhook
(``/webhooks/stripe``) after a real, *paid* invoice. The client flow:

1. ``POST /billing/subscribe`` — get/create the Stripe Customer and create a
   SetupIntent (no Subscription is created yet). Returns the SetupIntent client
   secret to the mobile app.
2. The mobile app confirms the SetupIntent. The card number / CVC never leave
   the Stripe secure field; only the resulting ``payment_method_id`` is sent
   back to the backend.
3. ``POST /billing/subscribe/confirm`` — verifies the SetupIntent really
   succeeded for the authenticated user, attaches the PaymentMethod to the
   Customer, sets it as the default payment method (Customer + Subscription),
   and creates the Subscription. There is NO free trial: the first invoice is
   collected immediately. If 3DS/SCA is required, the first PaymentIntent
   client secret is returned so the app can authenticate it.
4. ``invoice.paid`` (amount > 0) ⇒ a `Payment` recorded as succeeded, the
   internal Subscription set to active, ``is_premium=true``.

The ``/billing/premium`` mock endpoint is hard-disabled in production via
``ALLOW_MOCK_BILLING``."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import stripe as stripe_lib
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Subscription, User
from ..schemas import UserOut

logger = logging.getLogger("serene.billing")

router = APIRouter(prefix="/billing", tags=["billing"])


# ── Stripe subscribe (SetupIntent → confirm → Subscription) ──────────────────

class SubscribeIn(BaseModel):
    plan: str = "monthly"  # "monthly" | "yearly"


class SubscribeOut(BaseModel):
    setup_intent_client_secret: str
    setup_intent_id: str
    customer_id: str
    price_id: str


class SubscribeConfirmIn(BaseModel):
    setup_intent_id: str
    payment_method_id: str
    plan: str = "monthly"  # "monthly" | "yearly"


class SubscribeConfirmOut(BaseModel):
    subscription_id: str
    payment_intent_id: str | None = None
    payment_intent_client_secret: str | None = None


async def _get_or_create_stripe_customer(user: User) -> str:
    """Return the Stripe Customer ID for a user, creating one if needed."""
    if user.stripe_customer_id:
        return user.stripe_customer_id

    customer = stripe_lib.Customer.create(
        email=user.email,
        name=user.name,
        metadata={"user_id": str(user.id)},
    )
    return customer.id


def _price_id_for(plan: str) -> str:
    """Resolve the Stripe Price ID for the requested plan."""
    return settings.stripe_price_monthly if plan == "monthly" else settings.stripe_price_yearly


async def _cancel_incomplete_subscriptions(db: AsyncSession, user: User) -> None:
    """Cancel any leftover Stripe incomplete subscriptions for this user.

    An ``incomplete`` subscription was never paid; canceling it before creating
    a fresh one keeps Stripe clean if the mobile confirm call is retried or a
    previous attempt was abandoned.
    """
    now = datetime.now(timezone.utc)
    rows = (
        await db.execute(
            select(Subscription).where(
                Subscription.user_id == user.id,
                Subscription.provider == "stripe",
                Subscription.status == "incomplete",
            )
        )
    ).scalars().all()
    for sub in rows:
        if sub.provider_subscription_id:
            try:
                stripe_lib.Subscription.cancel(sub.provider_subscription_id)
            except stripe_lib.StripeError as e:
                logger.info("billing: could not cancel leftover sub %s: %s", sub.provider_subscription_id, e)
        sub.status = "canceled"
        sub.canceled_at = now
        sub.updated_at = now
        db.add(sub)
    await db.flush()


async def _build_confirm_response(stripe_subscription) -> SubscribeConfirmOut:
    """Extract the first PaymentIntent (for SCA) from a freshly created subscription."""
    payment_intent_id = None
    payment_intent_client_secret = None
    invoice = stripe_subscription.get("latest_invoice")
    if invoice:
        pi = invoice.get("payment_intent")
        if isinstance(pi, str) and pi.startswith("pi_"):
            # Expand failed — retrieve the PaymentIntent explicitly.
            try:
                pi = stripe_lib.PaymentIntent.retrieve(pi)
            except stripe_lib.StripeError:
                pi = None
        if pi:
            payment_intent_id = pi.get("id")
            payment_intent_client_secret = pi.get("client_secret")
    return SubscribeConfirmOut(
        subscription_id=stripe_subscription.get("id"),
        payment_intent_id=payment_intent_id,
        payment_intent_client_secret=payment_intent_client_secret,
    )


@router.post("/subscribe", response_model=SubscribeOut)
async def create_subscribe(
    body: SubscribeIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Stripe SetupIntent for Serene Pro (no Subscription yet).

    The Subscription is created only after the SetupIntent is confirmed
    (``/billing/subscribe/confirm``), so the first invoice is tied to a real,
    already-confirmed payment method.

    Flow:
    1. Get/create Stripe Customer
    2. Create SetupIntent to save the payment method
    3. Return client_secret + customer id to mobile
    4. Mobile confirms SetupIntent → sends payment_method_id back
    5. Backend creates the Subscription with the confirmed PaymentMethod
    6. Webhook invoice.paid (amount > 0) → activate premium
    """
    if not settings.stripe_secret_key:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Stripe is not configured. Please contact support.",
        )

    stripe_lib.api_key = settings.stripe_secret_key

    price_id = _price_id_for(body.plan)
    if not price_id:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Payment plan is not configured. Please contact support.",
        )

    # Check if the user already has an active subscription.
    existing_active = (
        await db.execute(
            select(Subscription).where(
                Subscription.user_id == user.id,
                Subscription.status.in_(("active", "trial")),
            )
        )
    ).scalar_one_or_none()
    if existing_active:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "You already have an active subscription.",
        )

    # 1. Get or create Stripe Customer
    try:
        customer_id = await _get_or_create_stripe_customer(user)
        if user.stripe_customer_id != customer_id:
            user.stripe_customer_id = customer_id
            db.add(user)
            await db.flush()
    except stripe_lib.StripeError as e:
        logger.error("Stripe Customer creation failed: %s", e)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Payment initialization failed. Please try again.",
        )

    # 2. Create SetupIntent (collects the card and saves it as a PaymentMethod)
    try:
        setup_intent = stripe_lib.SetupIntent.create(
            customer=customer_id,
            payment_method_types=["card"],
            metadata={
                "user_id": str(user.id),
                "plan": body.plan,
            },
        )
    except stripe_lib.StripeError as e:
        logger.error("Stripe SetupIntent creation failed: %s", e)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Payment initialization failed. Please try again.",
        )

    await db.commit()

    logger.info(
        "subscribe: user %s → Stripe customer %s, setup_intent %s",
        user.id, customer_id, setup_intent.id,
    )

    return SubscribeOut(
        setup_intent_client_secret=setup_intent.client_secret,
        setup_intent_id=setup_intent.id,
        customer_id=customer_id,
        price_id=price_id,
    )


@router.post("/subscribe/confirm", response_model=SubscribeConfirmOut)
async def confirm_subscribe(
    body: SubscribeConfirmIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Attach the confirmed PaymentMethod and create the Stripe Subscription.

    Security: the payment method id is a Stripe token — no card data ever
    reaches the backend. We re-verify the SetupIntent before using its payment
    method so a client cannot attach an arbitrary/unrelated PaymentMethod to
    this user's Customer.

    There is no free trial: the first invoice must be paid immediately. If the
    invoice requires 3DS/SCA the PaymentIntent client secret is returned so the
    app can authenticate it (SetupIntent succeeded alone is NEVER treated as a
    payment — ``is_premium`` is only flipped by ``invoice.paid`` with amount>0).
    """
    if not settings.stripe_secret_key:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Stripe is not configured. Please contact support.",
        )

    stripe_lib.api_key = settings.stripe_secret_key

    price_id = _price_id_for(body.plan)
    if not price_id:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Payment plan is not configured. Please contact support.",
        )

    if not user.stripe_customer_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No Stripe customer yet — call /billing/subscribe first.",
        )
    customer_id = user.stripe_customer_id

    # The Subscription is created only once — block if already active.
    existing_active = (
        await db.execute(
            select(Subscription).where(
                Subscription.user_id == user.id,
                Subscription.status.in_(("active", "trial")),
            )
        )
    ).scalar_one_or_none()
    if existing_active:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "You already have an active subscription.",
        )

    # 1. Verify the SetupIntent genuinely succeeded for this user.
    try:
        setup_intent = stripe_lib.SetupIntent.retrieve(body.setup_intent_id)
    except stripe_lib.StripeError as e:
        logger.error("SetupIntent retrieve failed: %s", e)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Payment initialization failed. Please try again.",
        )

    si_status = setup_intent.get("status", "")
    if si_status != "succeeded":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Payment method has not been confirmed. Please try again.",
        )
    if setup_intent.get("customer") != customer_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This SetupIntent does not belong to your account.",
        )
    si_meta = setup_intent.get("metadata") or {}
    if si_meta.get("user_id") != str(user.id):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This SetupIntent does not belong to your account.",
        )
    if setup_intent.get("payment_method") != body.payment_method_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "The payment method does not match the confirmed SetupIntent.",
        )

    # 2. Cancel any abandoned incomplete subscriptions (they were never paid).
    await _cancel_incomplete_subscriptions(db, user)

    # 3. Make sure the PaymentMethod is attached to the Customer and is the
    #    default method used to pay future invoices.
    payment_method_id = body.payment_method_id
    try:
        try:
            stripe_lib.PaymentMethod.attach(payment_method_id, customer=customer_id)
        except stripe_lib.StripeError as e:
            if getattr(e, "code", None) != "payment_method_already_attached":
                raise
        stripe_lib.Customer.modify(
            customer_id,
            invoice_settings={"default_payment_method": payment_method_id},
        )
    except stripe_lib.StripeError as e:
        logger.error("Unable to set default payment method for customer %s: %s", customer_id, e)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Payment initialization failed. Please try again.",
        )

    # 4. Create the Subscription (charged immediately — no free trial).
    try:
        stripe_subscription = stripe_lib.Subscription.create(
            customer=customer_id,
            items=[{"price": price_id}],
            default_payment_method=payment_method_id,
            payment_behavior="default_incomplete",
            payment_settings={
                "save_default_payment_method": "on_subscription",
            },
            metadata={
                "user_id": str(user.id),
                "plan": body.plan,
            },
            expand=["latest_invoice.payment_intent"],
        )
    except stripe_lib.StripeError as e:
        logger.error("Stripe Subscription creation failed: %s", e)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Payment initialization failed. Please try again.",
        )

    # 5. Save the internal subscription record (pending until the webhook
    #    confirms a real payment). is_premium stays false here.
    from .integrations import _save_stripe_subscription_record
    await _save_stripe_subscription_record(db, user, stripe_subscription, body.plan)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        logger.warning("confirm: duplicate internal subscription record for user %s", user.id)
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Subscription already being processed. Refresh and try again.",
        )

    logger.info(
        "confirm: user %s → subscription %s (customer %s, plan %s)",
        user.id, stripe_subscription.get("id"), customer_id, body.plan,
    )

    return await _build_confirm_response(stripe_subscription)


# ── Dev-only mock billing ────────────────────────────────────────────────────

class PremiumIn(BaseModel):
    is_premium: bool = True


@router.post("/premium", response_model=UserOut)
async def set_premium(body: PremiumIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Mock premium toggle — DEV ONLY.

    In production, is_premium is driven solely by the verified Stripe webhook
    (/webhooks/stripe). This endpoint exists only so the Expo Go / web mock
    flow works without a paid build, and is hard-disabled in production via
    ALLOW_MOCK_BILLING.
    """
    if not settings.allow_mock_billing:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Mock billing is disabled. Premium is granted only via the payment webhook.",
        )
    user.is_premium = body.is_premium
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user