"""Backoffice admin panel tests — access control, data and CRUD.

These tests exercise the admin routers that power the SPA backoffice:
- access control (non-admin / anonymous users are refused admin routes)
- subscription provider filter + provider field
- feedback status update and delete
- user premium toggle coherence (provider stays 'admin')
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import Feedback, Subscription, User
from .conftest import auth_headers, register_and_login

pytestmark = pytest.mark.asyncio


async def _make_admin(client, db_session, email: str = "admin@serene.app", password: str = "secret123") -> str:
    """Register a normal user, promote them to admin, return their token."""
    token = await register_and_login(client, email=email, password=password)
    user = (await db_session.execute(select(User).where(User.email == email))).scalar_one()
    user.is_admin = True
    await db_session.commit()
    return token


# ─── Access control ──────────────────────────────────────────────────────────

async def test_admin_endpoint_refuses_non_admin(client):
    token = await register_and_login(client)
    r = await client.get("/admin/stats", headers=auth_headers(token))
    assert r.status_code == 403


async def test_admin_endpoint_refuses_anonymous(client):
    r = await client.get("/admin/stats")
    assert r.status_code == 403


async def test_admin_endpoint_allows_admin(client, db_session):
    token = await _make_admin(client, db_session)
    r = await client.get("/admin/stats", headers=auth_headers(token))
    assert r.status_code == 200
    assert "totals" in r.json()


# ─── Admin login ─────────────────────────────────────────────────────────────

async def test_admin_login_refuses_non_admin(client, db_session):
    await register_and_login(client, email="bob@test.com")
    r = await client.post("/admin/login", json={"email": "bob@test.com", "password": "secret123"})
    assert r.status_code == 403


async def test_admin_login_success(client, db_session):
    token = await _make_admin(client, db_session)
    r = await client.post("/admin/login", json={"email": "admin@serene.app", "password": "secret123"})
    assert r.status_code == 200
    assert "access_token" in r.json()
    assert token  # sanity


# ─── Subscriptions: provider filter + field ─────────────────────────────────

async def test_subscriptions_expose_provider_and_filter(client, db_session):
    await _make_admin(client, db_session)
    tkn = (await client.post("/admin/login", json={"email": "admin@serene.app", "password": "secret123"})).json()["access_token"]
    h = auth_headers(tkn)
    uid = (await db_session.execute(select(User).where(User.email == "admin@serene.app"))).scalar_one().id

    db_session.add(Subscription(user_id=uid, plan="monthly", status="active", provider="stripe"))
    db_session.add(Subscription(user_id=uid, plan="monthly", status="active", provider="revenuecat"))
    db_session.add(Subscription(user_id=uid, plan="monthly", status="canceled", provider="admin"))
    await db_session.commit()

    # provider field present on every row
    r = await client.get("/admin/subscriptions?page=1&per_page=50", headers=h)
    assert r.status_code == 200
    subs = r.json()["subscriptions"]
    assert len(subs) == 3
    assert {s["provider"] for s in subs} == {"stripe", "revenuecat", "admin"}

    # filter by provider
    r2 = await client.get("/admin/subscriptions?provider=stripe", headers=h)
    assert r2.status_code == 200
    assert len(r2.json()["subscriptions"]) == 1
    assert r2.json()["subscriptions"][0]["provider"] == "stripe"


# ─── Feedback: status + delete ───────────────────────────────────────────────

async def test_feedback_status_update_and_delete(client, db_session):
    await _make_admin(client, db_session)
    tkn = (await client.post("/admin/login", json={"email": "admin@serene.app", "password": "secret123"})).json()["access_token"]
    h = auth_headers(tkn)
    user_id = (await db_session.execute(select(User).where(User.email == "admin@serene.app"))).scalar_one().id

    fb = Feedback(user_id=user_id, category="suggestion", content="Ajoutez une option sombre")
    db_session.add(fb)
    await db_session.commit()
    fb_id = fb.id

    r = await client.put(f"/admin/feedback/{fb_id}/status", json={"status": "resolved"}, headers=h)
    assert r.status_code == 200
    assert r.json()["status"] == "resolved"

    r2 = await client.delete(f"/admin/feedback/{fb_id}", headers=h)
    assert r2.status_code == 200
    remaining = (await db_session.execute(select(Feedback).where(Feedback.id == fb_id))).scalar_one_or_none()
    assert remaining is None


# ─── Premium toggle keeps provider=admin ─────────────────────────────────────

async def test_admin_grant_premium_uses_provider_admin(client, db_session):
    email = "prem@test.com"
    await _make_admin(client, db_session)
    token = await register_and_login(client, email=email)
    uid = (await db_session.execute(select(User).where(User.email == email))).scalar_one().id

    tkn = (await client.post("/admin/login", json={"email": "admin@serene.app", "password": "secret123"})).json()["access_token"]
    h = auth_headers(tkn)

    r = await client.put(f"/admin/users/{uid}/toggle-premium", headers=h)
    assert r.status_code == 200
    assert r.json()["is_premium"] is True

    sub = (await db_session.execute(select(Subscription).where(Subscription.user_id == uid))).scalar_one()
    assert sub.provider == "admin"

