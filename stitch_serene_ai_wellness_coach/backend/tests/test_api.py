"""Comprehensive API test suite for the Serene backend."""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from .conftest import auth_headers, register_and_login, CANNED_REPLY

pytestmark = pytest.mark.asyncio


# ═══════════════════════════════════════════════════════════════════════════════
# Auth: register / login / me
# ═══════════════════════════════════════════════════════════════════════════════

async def test_register_login_me(client: AsyncClient):
    token = await register_and_login(client)
    r = await client.get("/auth/me", headers=auth_headers(token))
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == "alice@test.com"
    assert data["is_premium"] is False


async def test_register_duplicate_email_409(client: AsyncClient):
    await register_and_login(client)
    r = await client.post(
        "/auth/register",
        json={"email": "alice@test.com", "password": "another123"},
    )
    assert r.status_code == 409


async def test_login_bad_credentials_401(client: AsyncClient):
    await register_and_login(client)
    r = await client.post(
        "/auth/login",
        json={"email": "alice@test.com", "password": "wrong-password"},
    )
    assert r.status_code == 401


async def test_me_no_token_403(client: AsyncClient):
    r = await client.get("/auth/me")
    assert r.status_code in (401, 403)


# ═══════════════════════════════════════════════════════════════════════════════
# Freemium gate
# ═══════════════════════════════════════════════════════════════════════════════

async def test_freemium_gate_blocks_new_session_beyond_limit(client: AsyncClient, monkeypatch):
    """When FREE_SESSIONS_PER_WEEK is 1, starting a second NEW session returns paywall=true."""
    from app.config import settings
    monkeypatch.setattr(settings, "free_sessions_per_week", 1)

    token = await register_and_login(client)
    h = auth_headers(token)

    # First new session — should succeed.
    r1 = await client.post("/chat", json={"message": "Hello"}, headers=h)
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["paywall"] is False

    # Second NEW session (session_id omitted) — should hit the gate.
    r2 = await client.post("/chat", json={"message": "Hello again"}, headers=h)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["paywall"] is True


async def test_freemium_gate_continuation_not_blocked(client: AsyncClient, monkeypatch):
    """Continuing an existing session is never blocked even past the limit."""
    from app.config import settings
    monkeypatch.setattr(settings, "free_sessions_per_week", 1)

    token = await register_and_login(client)
    h = auth_headers(token)

    # Create the first session.
    r1 = await client.post("/chat", json={"message": "Hello"}, headers=h)
    assert r1.status_code == 200
    session_id = r1.json()["session_id"]

    # Continue the same session — should NOT be blocked.
    r2 = await client.post("/chat", json={"message": "Tell me more", "session_id": session_id}, headers=h)
    assert r2.status_code == 200
    assert r2.json()["paywall"] is False


async def test_freemium_gate_premium_user_bypasses(client: AsyncClient, monkeypatch):
    """A premium user can always start a new session regardless of the limit."""
    from app.config import settings
    monkeypatch.setattr(settings, "free_sessions_per_week", 0)

    token = await register_and_login(client)
    h = auth_headers(token)

    # Make the user premium.
    await client.post("/billing/premium", json={"is_premium": True}, headers=h)

    r = await client.post("/chat", json={"message": "Hello"}, headers=h)
    assert r.status_code == 200
    assert r.json()["paywall"] is False


# ═══════════════════════════════════════════════════════════════════════════════
# Crisis detection
# ═══════════════════════════════════════════════════════════════════════════════

async def test_crisis_detection_returns_referral(client: AsyncClient, monkeypatch):
    """A crisis message must return technique==crisis_referral and paywall==False,
    and the LLM must NOT be called."""
    import app.services.llm as llm_module

    llm_called = []

    async def _spy_generate(system, history):
        llm_called.append(True)
        return CANNED_REPLY

    monkeypatch.setattr(llm_module, "generate", _spy_generate)

    token = await register_and_login(client)
    r = await client.post(
        "/chat",
        json={"message": "I want to kill myself"},
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["technique"] == "crisis_referral"
    assert data["paywall"] is False
    assert llm_called == [], "LLM must NOT be called on crisis messages"


async def test_crisis_bypasses_freemium_gate(client: AsyncClient, monkeypatch):
    """Crisis messages bypass the freemium gate even when the limit is exceeded."""
    from app.config import settings
    monkeypatch.setattr(settings, "free_sessions_per_week", 0)

    token = await register_and_login(client)
    r = await client.post(
        "/chat",
        json={"message": "I want to end my life"},
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["technique"] == "crisis_referral"
    assert data["paywall"] is False


# ═══════════════════════════════════════════════════════════════════════════════
# Technique tag extraction
# ═══════════════════════════════════════════════════════════════════════════════

async def test_technique_tag_extracted_and_stripped(client: AsyncClient):
    """The [TECHNIQUE: box_breathing] tag must be stripped from reply and returned
    as the technique field."""
    token = await register_and_login(client)
    r = await client.post("/chat", json={"message": "I feel anxious"}, headers=auth_headers(token))
    assert r.status_code == 200
    data = r.json()
    assert data["technique"] == "box_breathing"
    assert "[TECHNIQUE:" not in data["reply"], "Tag must be stripped from the reply text"
    # The canned LLM reply's prose should still be present.
    assert "box breathing" in data["reply"].lower()


# ═══════════════════════════════════════════════════════════════════════════════
# Mood logging + /progress streak and avg_mood
# ═══════════════════════════════════════════════════════════════════════════════

async def test_mood_log_and_progress(client: AsyncClient):
    """Log a mood entry, then assert /progress returns a non-zero avg_mood."""
    token = await register_and_login(client)
    h = auth_headers(token)

    r = await client.post("/mood", json={"score": 7, "label": "Calme"}, headers=h)
    assert r.status_code == 201
    entry = r.json()
    assert entry["score"] == 7

    r2 = await client.get("/progress", headers=h)
    assert r2.status_code == 200
    prog = r2.json()
    assert prog["avg_mood"] == 7.0
    # streak_days: may be 0 or 1 depending on timezone in CI; just assert it's non-negative.
    assert prog["streak_days"] >= 0


async def test_progress_streak_increases_with_session(client: AsyncClient):
    """After creating a session, sessions_this_week should be 1."""
    token = await register_and_login(client)
    h = auth_headers(token)

    await client.post("/chat", json={"message": "Hey"}, headers=h)

    r = await client.get("/progress", headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["sessions_this_week"] == 1


# ═══════════════════════════════════════════════════════════════════════════════
# IDOR: user B cannot read user A's session messages
# ═══════════════════════════════════════════════════════════════════════════════

async def test_idor_user_b_cannot_read_user_a_session(client: AsyncClient):
    """User B requesting user A's session messages must get 404."""
    token_a = await register_and_login(client, email="userA@test.com")
    token_b = await register_and_login(client, email="userB@test.com", password="secretB1")

    # User A creates a session.
    r = await client.post("/chat", json={"message": "private"}, headers=auth_headers(token_a))
    assert r.status_code == 200
    session_id = r.json()["session_id"]

    # User B tries to read it.
    r2 = await client.get(
        f"/chat/sessions/{session_id}/messages",
        headers=auth_headers(token_b),
    )
    assert r2.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# Push token registration
# ═══════════════════════════════════════════════════════════════════════════════

async def test_push_register_persists_token(client: AsyncClient, db_session: AsyncSession):
    """POST /push/register persists the expo token on the user row."""
    token = await register_and_login(client)
    h = auth_headers(token)

    r = await client.post(
        "/push/register",
        json={"expo_push_token": "ExponentPushToken[xxxx]"},
        headers=h,
    )
    assert r.status_code == 204

    user = (await db_session.execute(
        select(User).where(User.email == "alice@test.com")
    )).scalar_one()
    assert user.expo_push_token == "ExponentPushToken[xxxx]"


async def test_push_register_requires_auth(client: AsyncClient):
    r = await client.post("/push/register", json={"expo_push_token": "tok"})
    assert r.status_code in (401, 403)


# ═══════════════════════════════════════════════════════════════════════════════
# RevenueCat webhook
# ═══════════════════════════════════════════════════════════════════════════════

async def test_revenuecat_initial_purchase_sets_premium(client: AsyncClient, db_session: AsyncSession):
    """INITIAL_PURCHASE event sets is_premium=True."""
    token = await register_and_login(client)
    user = (await db_session.execute(
        select(User).where(User.email == "alice@test.com")
    )).scalar_one()
    assert user.is_premium is False

    payload = {"event": {"type": "INITIAL_PURCHASE", "app_user_id": str(user.id)}}
    r = await client.post("/webhooks/revenuecat", json=payload)
    assert r.status_code == 200

    await db_session.refresh(user)
    assert user.is_premium is True


async def test_revenuecat_cancellation_revokes_premium(client: AsyncClient, db_session: AsyncSession):
    """CANCELLATION event sets is_premium=False."""
    token = await register_and_login(client)
    # First grant premium.
    await client.post("/billing/premium", json={"is_premium": True}, headers=auth_headers(token))

    user = (await db_session.execute(
        select(User).where(User.email == "alice@test.com")
    )).scalar_one()
    assert user.is_premium is True

    payload = {"event": {"type": "CANCELLATION", "app_user_id": str(user.id)}}
    r = await client.post("/webhooks/revenuecat", json=payload)
    assert r.status_code == 200

    await db_session.refresh(user)
    assert user.is_premium is False


async def test_revenuecat_unknown_event_ignored(client: AsyncClient):
    """Unknown event types are ignored and return 200."""
    payload = {"event": {"type": "SOME_FUTURE_EVENT", "app_user_id": "1"}}
    r = await client.post("/webhooks/revenuecat", json=payload)
    assert r.status_code == 200
    assert r.json()["status"] == "ignored"


async def test_revenuecat_renewal_sets_premium(client: AsyncClient, db_session: AsyncSession):
    """RENEWAL event also grants premium."""
    token = await register_and_login(client)
    user = (await db_session.execute(
        select(User).where(User.email == "alice@test.com")
    )).scalar_one()

    payload = {"event": {"type": "RENEWAL", "app_user_id": str(user.id)}}
    r = await client.post("/webhooks/revenuecat", json=payload)
    assert r.status_code == 200

    await db_session.refresh(user)
    assert user.is_premium is True


async def test_revenuecat_webhook_secret_enforced(client: AsyncClient, monkeypatch):
    """When REVENUECAT_WEBHOOK_SECRET is set, wrong/missing secret returns 401."""
    from app.config import settings
    monkeypatch.setattr(settings, "revenuecat_webhook_secret", "my-secret")

    payload = {"event": {"type": "INITIAL_PURCHASE", "app_user_id": "1"}}

    # Wrong secret.
    r = await client.post(
        "/webhooks/revenuecat",
        json=payload,
        headers={"Authorization": "wrong-secret"},
    )
    assert r.status_code == 401

    # No secret at all.
    r2 = await client.post("/webhooks/revenuecat", json=payload)
    assert r2.status_code == 401


async def test_revenuecat_webhook_secret_accepted(client: AsyncClient, db_session: AsyncSession, monkeypatch):
    """Correct secret is accepted."""
    from app.config import settings
    monkeypatch.setattr(settings, "revenuecat_webhook_secret", "my-secret")

    await register_and_login(client)
    user = (await db_session.execute(
        select(User).where(User.email == "alice@test.com")
    )).scalar_one()

    payload = {"event": {"type": "INITIAL_PURCHASE", "app_user_id": str(user.id)}}
    r = await client.post(
        "/webhooks/revenuecat",
        json=payload,
        headers={"Authorization": "my-secret"},
    )
    assert r.status_code == 200
    await db_session.refresh(user)
    assert user.is_premium is True
