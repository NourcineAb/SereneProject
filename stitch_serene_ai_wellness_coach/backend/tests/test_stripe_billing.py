"""Phase 4 — Stripe billing flow (subscribe/confirm) + webhook regression tests.

Covers the invariants fixed in Phase 4:
- premium is ONLY granted by a real, paid invoice (``invoice.paid`` with
  ``amount_paid > 0``); a ``$0`` invoice, or ``SetupIntent`` succeeded, or a
  ``subscription.updated`` status like ``past_due``/``unpaid``/``trialing``
  never grant premium.
- ``invoice.payment_failed`` never downgrades a succeeded Payment.
- internal status mapping is faithful (``past_due → past_due``, never
  ``active``) and ``canceled_at`` is synced.
- ``/billing/subscribe/confirm`` verifies the SetupIntent, sets the default
  PaymentMethod (Customer + Subscription), creates the Subscription without a
  free trial, and keeps ``is_premium=false`` until the webhook fires.
"""
from __future__ import annotations

import pytest
import stripe as stripe_lib
from sqlalchemy import func, select

from app.config import settings
from app.models import Payment, Subscription, User
from app.services.subscription import grant_premium
from .conftest import auth_headers, register_and_login

pytestmark = pytest.mark.asyncio


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _stripe_sub(
    user_id: int,
    status: str = "active",
    stripe_sub_id: str = "sub_1",
    canceled_at: float | None = None,
) -> dict:
    return {
        "id": stripe_sub_id,
        "status": status,
        "metadata": {"user_id": str(user_id), "plan": "monthly"},
        "items": {"data": [{"price": {"unit_amount": 999, "currency": "eur"}}]},
        "current_period_start": 1750000000,
        "current_period_end": 1752592000,
        "canceled_at": canceled_at,
    }


def _stripe_invoice(**overrides) -> dict:
    invoice = {
        "id": "in_1",
        "subscription": "sub_1",
        "amount_paid": 999,
        "amount_due": 999,
        "currency": "eur",
    }
    invoice.update(overrides)
    return invoice


async def _register_user(client, db, email: str = "alice@test.com") -> User:
    await register_and_login(client, email=email)
    return (await db.execute(select(User).where(User.email == email))).scalar_one()


async def _count(db, model) -> int:
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


@pytest.fixture
def stripe_webhook_event(monkeypatch):
    """Route Stripe webhook events through a fake construct_event."""
    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_test")
    box: dict = {}

    def _construct_event(payload, sig_header, secret):
        return {"type": box["type"], "data": {"object": box["object"]}}

    monkeypatch.setattr(stripe_lib.Webhook, "construct_event", _construct_event)

    def set_event(event_type: str, obj: dict):
        box["type"] = event_type
        box["object"] = obj

    return set_event


def _mock_subscription_retrieve(monkeypatch, sub: dict):
    monkeypatch.setattr(
        stripe_lib.Subscription,
        "retrieve",
        lambda sub_id: sub,
    )


@pytest.fixture
def stripe_billing_mocks(monkeypatch):
    """Mock Stripe for the /billing/subscribe/confirm endpoint."""
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_fake")
    monkeypatch.setattr(settings, "stripe_price_monthly", "price_monthly")
    monkeypatch.setattr(settings, "stripe_price_yearly", "price_yearly")

    calls: dict = {
        "setup_intent": {
            "id": "seti_1",
            "status": "succeeded",
            "customer": "cus_test",
            "payment_method": "pm_1",
            "metadata": {"user_id": "0", "plan": "monthly"},
        },
    }

    class FakeSetupIntent:
        @staticmethod
        def retrieve(setup_intent_id):
            return calls["setup_intent"]

    class FakePaymentMethod:
        @staticmethod
        def attach(payment_method_id, customer=None):
            calls["attach"] = (payment_method_id, customer)
            return {"id": payment_method_id}

    class FakeCustomer:
        @staticmethod
        def modify(customer_id, **params):
            calls["modify"] = (customer_id, params)

    class FakeSubscription:
        @staticmethod
        def create(**params):
            calls["create"] = params
            return {
                "id": "sub_1",
                "status": "incomplete",
                "metadata": {"user_id": "0", "plan": "monthly"},
                "items": {"data": [{"price": {"unit_amount": 999, "currency": "eur"}}]},
                "current_period_start": 1750000000,
                "current_period_end": 1752592000,
                "canceled_at": None,
                "latest_invoice": {
                    "payment_intent": {"id": "pi_1", "client_secret": "pi_1_secret"}
                },
            }

    monkeypatch.setattr(stripe_lib.SetupIntent, "retrieve", FakeSetupIntent.retrieve)
    monkeypatch.setattr(stripe_lib.PaymentMethod, "attach", FakePaymentMethod.attach)
    monkeypatch.setattr(stripe_lib.Customer, "modify", FakeCustomer.modify)
    monkeypatch.setattr(stripe_lib.Subscription, "create", FakeSubscription.create)
    monkeypatch.setattr(stripe_lib.Subscription, "cancel", lambda sub_id: None)

    return calls


# ─── /billing/subscribe/confirm ───────────────────────────────────────────────

async def test_confirm_subscribe_success_sets_default_payment_method_and_charges(
    client, db_session, stripe_billing_mocks
):
    user = await _register_user(client, db_session)
    user.stripe_customer_id = "cus_test"
    db_session.add(user)
    await db_session.commit()

    si = stripe_billing_mocks["setup_intent"]
    si["status"] = "succeeded"
    si["customer"] = "cus_test"
    si["payment_method"] = "pm_1"
    si["metadata"] = {"user_id": str(user.id), "plan": "monthly"}

    token = (await client.post("/auth/login", json={
        "email": "alice@test.com", "password": "secret123",
    })).json()["access_token"]

    r = await client.post(
        "/billing/subscribe/confirm",
        json={"setup_intent_id": "seti_1", "payment_method_id": "pm_1", "plan": "monthly"},
        headers=auth_headers(token),
    )
    assert r.status_code == 200, r.text
    assert r.json() == {
        "subscription_id": "sub_1",
        "payment_intent_id": "pi_1",
        "payment_intent_client_secret": "pi_1_secret",
    }

    # PaymentMethod attached to the Customer and set as the DEFAULT method.
    assert stripe_billing_mocks["attach"] == ("pm_1", "cus_test")
    customer_id, params = stripe_billing_mocks["modify"]
    assert customer_id == "cus_test"
    assert params["invoice_settings"] == {"default_payment_method": "pm_1"}

    # Subscription created WITHOUT a free trial and charged immediately.
    created = stripe_billing_mocks["create"]
    assert created["customer"] == "cus_test"
    assert created["default_payment_method"] == "pm_1"
    assert created["payment_behavior"] == "default_incomplete"
    assert created["payment_settings"]["save_default_payment_method"] == "on_subscription"
    assert created["items"] == [{"price": "price_monthly"}]
    assert "trial_period_days" not in created

    # Internal record is saved but premium stays OFF until the webhook.
    sub = (await db_session.execute(
        select(Subscription).where(Subscription.provider_subscription_id == "sub_1")
    )).scalar_one()
    assert sub.status == "incomplete"
    fresh_user = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh_user.is_premium is False
    assert await _count(db_session, Payment) == 0


async def test_confirm_subscribe_rejects_unconfirmed_setup_intent(
    client, db_session, stripe_billing_mocks
):
    user = await _register_user(client, db_session)
    user.stripe_customer_id = "cus_test"
    db_session.add(user)
    await db_session.commit()

    stripe_billing_mocks["setup_intent"]["status"] = "processing"

    token = (await client.post("/auth/login", json={
        "email": "alice@test.com", "password": "secret123",
    })).json()["access_token"]

    r = await client.post(
        "/billing/subscribe/confirm",
        json={"setup_intent_id": "seti_1", "payment_method_id": "pm_1", "plan": "monthly"},
        headers=auth_headers(token),
    )
    assert r.status_code == 400
    assert "create" not in stripe_billing_mocks


async def test_confirm_subscribe_rejects_foreign_setup_intent(
    client, db_session, stripe_billing_mocks
):
    user = await _register_user(client, db_session)
    user.stripe_customer_id = "cus_test"
    db_session.add(user)
    await db_session.commit()

    si = stripe_billing_mocks["setup_intent"]
    si["status"] = "succeeded"
    si["customer"] = "cus_OTHER"
    si["metadata"] = {"user_id": "999", "plan": "monthly"}

    token = (await client.post("/auth/login", json={
        "email": "alice@test.com", "password": "secret123",
    })).json()["access_token"]

    r = await client.post(
        "/billing/subscribe/confirm",
        json={"setup_intent_id": "seti_1", "payment_method_id": "pm_1", "plan": "monthly"},
        headers=auth_headers(token),
    )
    assert r.status_code == 400
    assert "create" not in stripe_billing_mocks


async def test_confirm_subscribe_rejects_mismatched_payment_method(
    client, db_session, stripe_billing_mocks
):
    user = await _register_user(client, db_session)
    user.stripe_customer_id = "cus_test"
    db_session.add(user)
    await db_session.commit()

    si = stripe_billing_mocks["setup_intent"]
    si["status"] = "succeeded"
    si["customer"] = "cus_test"
    si["payment_method"] = "pm_OTHER"

    token = (await client.post("/auth/login", json={
        "email": "alice@test.com", "password": "secret123",
    })).json()["access_token"]

    r = await client.post(
        "/billing/subscribe/confirm",
        json={"setup_intent_id": "seti_1", "payment_method_id": "pm_1", "plan": "monthly"},
        headers=auth_headers(token),
    )
    assert r.status_code == 400
    assert "create" not in stripe_billing_mocks


async def test_confirm_subscribe_rejects_when_already_active(
    client, db_session, stripe_billing_mocks
):
    user = await _register_user(client, db_session)
    user.stripe_customer_id = "cus_test"
    db_session.add(user)
    await db_session.commit()
    db_session.add(Subscription(user_id=user.id, plan="monthly", status="active"))
    await db_session.commit()

    token = (await client.post("/auth/login", json={
        "email": "alice@test.com", "password": "secret123",
    })).json()["access_token"]

    r = await client.post(
        "/billing/subscribe/confirm",
        json={"setup_intent_id": "seti_1", "payment_method_id": "pm_1", "plan": "monthly"},
        headers=auth_headers(token),
    )
    assert r.status_code == 400
    assert "create" not in stripe_billing_mocks


# ─── invoice.paid ─────────────────────────────────────────────────────────────

async def test_invoice_paid_gt_zero_grants_premium(client, db_session, stripe_webhook_event, monkeypatch):
    user = await _register_user(client, db_session)
    _mock_subscription_retrieve(monkeypatch, _stripe_sub(user.id, status="active"))
    stripe_webhook_event("invoice.paid", _stripe_invoice(amount_paid=999))

    r = await client.post("/webhooks/stripe", json={})
    assert r.status_code == 200

    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.is_premium is True
    pay = (await db_session.execute(
        select(Payment).where(Payment.provider_payment_id == "in_1")
    )).scalar_one()
    assert pay.status == "succeeded"
    assert pay.amount == 9.99
    assert pay.currency == "EUR"
    sub = (await db_session.execute(
        select(Subscription).where(Subscription.provider_subscription_id == "sub_1")
    )).scalar_one()
    assert sub.status == "active"


async def test_invoice_paid_zero_amount_no_payment_no_premium(
    client, db_session, stripe_webhook_event, monkeypatch
):
    user = await _register_user(client, db_session)
    _mock_subscription_retrieve(monkeypatch, _stripe_sub(user.id, status="active"))
    stripe_webhook_event("invoice.paid", _stripe_invoice(amount_paid=0))

    r = await client.post("/webhooks/stripe", json={})
    assert r.status_code == 200

    # $0 paid invoice: the subscription record is synced, but NO payment and NO premium.
    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.is_premium is False
    assert await _count(db_session, Payment) == 0
    sub = (await db_session.execute(
        select(Subscription).where(Subscription.provider_subscription_id == "sub_1")
    )).scalar_one()
    assert sub.status == "active"


async def test_invoice_paid_upgrades_existing_failed_payment(
    client, db_session, stripe_webhook_event, monkeypatch
):
    user = await _register_user(client, db_session)
    _mock_subscription_retrieve(monkeypatch, _stripe_sub(user.id, status="active"))

    # First delivery: payment_failed for the same invoice.
    stripe_webhook_event("invoice.payment_failed", _stripe_invoice(amount_due=999))
    r = await client.post("/webhooks/stripe", json={})
    assert r.status_code == 200
    assert (await db_session.execute(
        select(Payment).where(Payment.provider_payment_id == "in_1")
    )).scalar_one().status == "failed"

    # Later delivery: invoice.paid succeeds → the SAME row must be upgraded,
    # not rejected as a duplicate.
    stripe_webhook_event("invoice.paid", _stripe_invoice(amount_paid=999))
    r = await client.post("/webhooks/stripe", json={})
    assert r.status_code == 200

    pay = (await db_session.execute(
        select(Payment).where(Payment.provider_payment_id == "in_1")
    )).scalar_one()
    assert pay.status == "succeeded"
    assert await _count(db_session, Payment) == 1
    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.is_premium is True


async def test_invoice_paid_duplicate_delivery_is_idempotent(
    client, db_session, stripe_webhook_event, monkeypatch
):
    user = await _register_user(client, db_session)
    _mock_subscription_retrieve(monkeypatch, _stripe_sub(user.id, status="active"))
    stripe_webhook_event("invoice.paid", _stripe_invoice(amount_paid=999))

    await client.post("/webhooks/stripe", json={})
    await client.post("/webhooks/stripe", json={})

    assert await _count(db_session, Payment) == 1
    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.is_premium is True


# ─── invoice.payment_failed ───────────────────────────────────────────────────

async def test_payment_failed_does_not_downgrade_succeeded_payment(
    client, db_session, stripe_webhook_event, monkeypatch
):
    user = await _register_user(client, db_session)
    _mock_subscription_retrieve(monkeypatch, _stripe_sub(user.id, status="active"))

    stripe_webhook_event("invoice.paid", _stripe_invoice(amount_paid=999))
    await client.post("/webhooks/stripe", json={})

    # A late / out-of-order payment_failed must not erase the successful payment.
    stripe_webhook_event("invoice.payment_failed", _stripe_invoice(amount_due=999))
    await client.post("/webhooks/stripe", json={})

    pay = (await db_session.execute(
        select(Payment).where(Payment.provider_payment_id == "in_1")
    )).scalar_one()
    assert pay.status == "succeeded"


async def test_payment_failed_records_failed_payment_without_premium(
    client, db_session, stripe_webhook_event, monkeypatch
):
    user = await _register_user(client, db_session)
    _mock_subscription_retrieve(monkeypatch, _stripe_sub(user.id, status="active"))

    stripe_webhook_event("invoice.payment_failed", _stripe_invoice(amount_due=999))
    r = await client.post("/webhooks/stripe", json={})
    assert r.status_code == 200

    pay = (await db_session.execute(
        select(Payment).where(Payment.provider_payment_id == "in_1")
    )).scalar_one()
    assert pay.status == "failed"
    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.is_premium is False


# ─── customer.subscription.updated ────────────────────────────────────────────

@pytest.mark.parametrize("stripe_status,expected_internal", [
    ("past_due", "past_due"),
    ("unpaid", "unpaid"),
    ("incomplete", "incomplete"),
    ("paused", "paused"),
    ("canceled", "canceled"),
])
async def test_subscription_updated_failed_states_never_grant_premium(
    client, db_session, stripe_webhook_event, stripe_status, expected_internal
):
    user = await _register_user(client, db_session)
    sub = _stripe_sub(user.id, status=stripe_status)
    stripe_webhook_event("customer.subscription.updated", sub)

    r = await client.post("/webhooks/stripe", json={})
    assert r.status_code == 200

    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.is_premium is False
    internal = (await db_session.execute(
        select(Subscription).where(Subscription.provider_subscription_id == "sub_1")
    )).scalar_one()
    assert internal.status == expected_internal


async def test_subscription_updated_past_due_does_not_downgrade_paying_user(
    client, db_session, stripe_webhook_event
):
    user = await _register_user(client, db_session)
    user.is_premium = True
    db_session.add(user)
    await db_session.commit()

    stripe_webhook_event("customer.subscription.updated", _stripe_sub(user.id, status="past_due"))
    r = await client.post("/webhooks/stripe", json={})
    assert r.status_code == 200

    # Stripe is within its retry/grace period — premium is NOT silently revoked.
    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.is_premium is True


async def test_subscription_updated_active_grants_premium(
    client, db_session, stripe_webhook_event
):
    user = await _register_user(client, db_session)
    stripe_webhook_event("customer.subscription.updated", _stripe_sub(user.id, status="active"))

    r = await client.post("/webhooks/stripe", json={})
    assert r.status_code == 200

    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.is_premium is True


async def test_subscription_updated_canceled_revokes_and_syncs_canceled_at(
    client, db_session, stripe_webhook_event
):
    user = await _register_user(client, db_session)
    user.is_premium = True
    db_session.add(user)
    await db_session.commit()

    stripe_webhook_event(
        "customer.subscription.updated",
        _stripe_sub(user.id, status="canceled", canceled_at=1750000000),
    )
    r = await client.post("/webhooks/stripe", json={})
    assert r.status_code == 200

    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.is_premium is False
    internal = (await db_session.execute(
        select(Subscription).where(Subscription.provider_subscription_id == "sub_1")
    )).scalar_one()
    assert internal.canceled_at is not None


async def test_subscription_updated_incomplete_expired_revokes(
    client, db_session, stripe_webhook_event
):
    user = await _register_user(client, db_session)
    user.is_premium = True
    db_session.add(user)
    await db_session.commit()

    stripe_webhook_event(
        "customer.subscription.updated", _stripe_sub(user.id, status="incomplete_expired")
    )
    r = await client.post("/webhooks/stripe", json={})
    assert r.status_code == 200

    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.is_premium is False


# ─── customer.subscription.deleted ────────────────────────────────────────────

async def test_subscription_deleted_revokes_premium(
    client, db_session, stripe_webhook_event
):
    user = await _register_user(client, db_session)
    user.is_premium = True
    db_session.add(user)
    await db_session.commit()

    stripe_webhook_event("customer.subscription.deleted", _stripe_sub(user.id, status="canceled"))
    r = await client.post("/webhooks/stripe", json={})
    assert r.status_code == 200

    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.is_premium is False


# ─── unique provider_id idempotence ───────────────────────────────────────────

async def test_provider_ids_are_unique(client, db_session):
    user = await _register_user(client, db_session)
    uid = user.id
    db_session.add(Subscription(
        user_id=uid, plan="monthly", status="active",
        provider="stripe", provider_subscription_id="sub_1",
    ))
    db_session.add(Payment(
        user_id=uid, amount=9.99, currency="EUR", status="succeeded",
        provider="stripe", provider_payment_id="in_1",
    ))
    await db_session.commit()

    from sqlalchemy.exc import IntegrityError
    with pytest.raises(IntegrityError):
        db_session.add(Subscription(
            user_id=uid, plan="monthly", status="active",
            provider="stripe", provider_subscription_id="sub_1",
        ))
        await db_session.commit()
    await db_session.rollback()

    with pytest.raises(IntegrityError):
        db_session.add(Payment(
            user_id=uid, amount=9.99, currency="EUR", status="succeeded",
            provider="stripe", provider_payment_id="in_1",
        ))
        await db_session.commit()
    await db_session.rollback()

    # NULL provider ids remain allowed (RevenueCat / admin rows).
    db_session.add(Subscription(
        user_id=uid, plan="monthly", status="active",
        provider="revenuecat", provider_subscription_id=None,
    ))
    db_session.add(Subscription(
        user_id=uid, plan="monthly", status="active",
        provider="revenuecat", provider_subscription_id=None,
    ))
    await db_session.commit()
    assert await _count(db_session, Subscription) == 3


async def test_mock_premium_blocked_outside_dev(client, db_session, monkeypatch):
    from app.config import settings as s
    token = await register_and_login(client)
    monkeypatch.setattr(s, "allow_mock_billing", False)
    r = await client.post("/billing/premium", json={"is_premium": True}, headers=auth_headers(token))
    assert r.status_code == 403


# ─── Cross-provider premium (Stripe ⨯ RevenueCat) ────────────────────────────

def _revcat_grant_event(user_id: int, *, product: str = "serene_monthly", price: str = "9.99") -> dict:
    return {
        "event": {
            "type": "INITIAL_PURCHASE",
            "app_user_id": str(user_id),
            "product_id": product,
            "price": price,
            "currency": "USD",
            "period_type": "NORMAL",
            "expiration_at_ms": 1760000000000,
        }
    }


def _revcat_revoke_event(user_id: int) -> dict:
    return {
        "event": {
            "type": "CANCELLATION",
            "app_user_id": str(user_id),
            "product_id": "serene_monthly",
        }
    }


async def test_stripe_active_plus_revenuecat_revoked_keeps_premium(
    client, db_session, stripe_webhook_event
):
    """Stripe active + RevenueCat revoked → user stays premium (Stripe still valid)."""
    user = await _register_user(client, db_session)
    stripe_webhook_event("customer.subscription.updated", _stripe_sub(user.id, status="active"))
    await client.post("/webhooks/stripe", json={})

    r = await client.post("/webhooks/revenuecat", json=_revcat_revoke_event(user.id))
    assert r.status_code == 200

    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.is_premium is True
    sub = (await db_session.execute(
        select(Subscription).where(Subscription.provider_subscription_id == "sub_1")
    )).scalar_one()
    assert sub.status == "active"


async def test_revenuecat_active_plus_stripe_revoked_keeps_premium(
    client, db_session, stripe_webhook_event
):
    """RevenueCat active + Stripe revoked → user stays premium (RevenueCat still valid)."""
    user = await _register_user(client, db_session)
    r = await client.post("/webhooks/revenuecat", json=_revcat_grant_event(user.id))
    assert r.status_code == 200

    stripe_webhook_event("customer.subscription.deleted", _stripe_sub(user.id, status="canceled"))
    await client.post("/webhooks/stripe", json={})

    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.is_premium is True
    revcat_subs = (await db_session.execute(
        select(Subscription).where(Subscription.provider == "revenuecat")
    )).scalars().all()
    assert len(revcat_subs) == 1
    assert revcat_subs[0].status == "active"


async def test_both_providers_revoked_sets_premium_false(client, db_session, stripe_webhook_event):
    """Both providers revoked → premium becomes false."""
    user = await _register_user(client, db_session)

    stripe_webhook_event("customer.subscription.updated", _stripe_sub(user.id, status="active"))
    await client.post("/webhooks/stripe", json={})
    r = await client.post("/webhooks/revenuecat", json=_revcat_grant_event(user.id))
    assert r.status_code == 200

    # Stripe gone, RevenueCat still active → premium must survive.
    stripe_webhook_event("customer.subscription.deleted", _stripe_sub(user.id, status="canceled"))
    await client.post("/webhooks/stripe", json={})
    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.is_premium is True

    # Then RevenueCat is revoked too → nothing left → premium drops.
    await client.post("/webhooks/revenuecat", json=_revcat_revoke_event(user.id))
    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.is_premium is False


async def test_grant_stripe_does_not_close_active_revenuecat_sub(client, db_session):
    """Granting via Stripe must not close an active RevenueCat subscription."""
    user = await _register_user(client, db_session)
    await grant_premium(
        db_session, user,
        source="revenuecat", provider="revenuecat", plan="monthly",
        price=9.99, currency="USD",
    )
    await grant_premium(
        db_session, user,
        source="stripe", provider="stripe", provider_subscription_id="sub_x",
    )

    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.is_premium is True
    subs = (await db_session.execute(
        select(Subscription).where(Subscription.user_id == user.id)
    )).scalars().all()
    by_provider = {s.provider: s for s in subs}
    assert by_provider["revenuecat"].status == "active"
    assert by_provider["stripe"].status == "active"


async def test_grant_revenuecat_does_not_close_active_stripe_sub(client, db_session):
    """Granting via RevenueCat must not close an active Stripe subscription."""
    user = await _register_user(client, db_session)
    await grant_premium(
        db_session, user,
        source="stripe", provider="stripe", provider_subscription_id="sub_x",
    )
    await grant_premium(
        db_session, user,
        source="revenuecat", provider="revenuecat", plan="monthly",
        price=9.99, currency="USD",
    )

    subs = (await db_session.execute(
        select(Subscription).where(Subscription.user_id == user.id)
    )).scalars().all()
    by_provider = {s.provider: s for s in subs}
    assert by_provider["stripe"].status == "active"
    assert by_provider["revenuecat"].status == "active"


async def test_webhook_invalid_signature_returns_400(client, monkeypatch):
    """A Stripe webhook with an invalid signature is rejected with HTTP 400."""
    from app.config import settings as s
    monkeypatch.setattr(s, "stripe_webhook_secret", "whsec_test")

    def _bad_signature(payload, sig_header, secret):  # noqa: ARG001
        raise stripe_lib.SignatureVerificationError(
            "No signatures found matching the expected signature for payload",
            sig_header or "t=1,v1=bad",
        )

    monkeypatch.setattr(stripe_lib.Webhook, "construct_event", _bad_signature)
    r = await client.post(
        "/webhooks/stripe",
        json={},
        headers={"stripe-signature": "t=1,v1=bad"},
    )
    assert r.status_code == 400


async def test_revenuecat_grant_records_provider_revenuecat(client, db_session):
    """A RevenueCat grant is recorded as provider=revenuecat, never stripe."""
    user = await _register_user(client, db_session)
    r = await client.post("/webhooks/revenuecat", json=_revcat_grant_event(user.id))
    assert r.status_code == 200

    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.is_premium is True

    subs = (await db_session.execute(
        select(Subscription).where(Subscription.user_id == user.id)
    )).scalars().all()
    assert len(subs) == 1
    assert subs[0].provider == "revenuecat"
    assert subs[0].status == "active"

    payments = (await db_session.execute(
        select(Payment).where(Payment.user_id == user.id)
    )).scalars().all()
    assert len(payments) == 1
    assert payments[0].provider == "revenuecat"