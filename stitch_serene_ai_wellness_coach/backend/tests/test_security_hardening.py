"""Tests for security hardening features: refresh tokens, RGPD endpoints,
rate limiting, and at-rest field encryption."""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Message, MoodLog, Session, User
from .conftest import auth_headers, register_and_login, CANNED_REPLY

pytestmark = pytest.mark.asyncio


# ═══════════════════════════════════════════════════════════════════════════════
# H3 — Rate limiting (verify the limiter is wired; limits are disabled in tests)
# ═══════════════════════════════════════════════════════════════════════════════

async def test_rate_limit_exempt_in_tests(client: AsyncClient):
    """Confirms rate limiting is bypassed in the test environment so repeated
    calls to /auth/register and /auth/login succeed without 429."""
    for i in range(10):
        r = await client.post(
            "/auth/register",
            json={"email": f"ratelimit{i}@test.com", "password": "pass123"},
        )
        assert r.status_code == 201, f"Request {i} was unexpectedly rate-limited"


# ═══════════════════════════════════════════════════════════════════════════════
# H1 — Refresh tokens + revocation
# ═══════════════════════════════════════════════════════════════════════════════

async def test_login_returns_refresh_token(client: AsyncClient):
    """Login response includes both access_token and refresh_token."""
    await client.post("/auth/register", json={"email": "tok@test.com", "password": "pass123"})
    r = await client.post("/auth/login", json={"email": "tok@test.com", "password": "pass123"})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


async def test_register_returns_refresh_token(client: AsyncClient):
    """Register response also includes a refresh_token."""
    r = await client.post(
        "/auth/register",
        json={"email": "reg_tok@test.com", "password": "pass123"},
    )
    assert r.status_code == 201
    data = r.json()
    assert "refresh_token" in data
    assert data["refresh_token"] is not None


async def test_refresh_endpoint_issues_new_access_token(client: AsyncClient):
    """POST /auth/refresh exchanges a refresh token for a new access token
    that authenticates successfully against /auth/me."""
    r = await client.post(
        "/auth/register",
        json={"email": "refresh@test.com", "password": "pass123"},
    )
    refresh_token = r.json()["refresh_token"]

    r2 = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert r2.status_code == 200
    data = r2.json()
    assert "access_token" in data
    # The new access token must work for authenticated requests.
    r_me = await client.get("/auth/me", headers=auth_headers(data["access_token"]))
    assert r_me.status_code == 200
    assert r_me.json()["email"] == "refresh@test.com"


async def test_refresh_with_invalid_token_returns_401(client: AsyncClient):
    """A forged/invalid refresh token is rejected."""
    r = await client.post("/auth/refresh", json={"refresh_token": "not.a.real.token"})
    assert r.status_code == 401


async def test_refresh_with_access_token_rejected(client: AsyncClient):
    """Passing an access token to /refresh must fail (wrong token type)."""
    r = await client.post(
        "/auth/register",
        json={"email": "wrongtype@test.com", "password": "pass123"},
    )
    access_token = r.json()["access_token"]

    r2 = await client.post("/auth/refresh", json={"refresh_token": access_token})
    assert r2.status_code == 401


async def test_logout_revokes_access_token(client: AsyncClient):
    """After POST /auth/logout the original access token must return 401."""
    token = await register_and_login(client)
    h = auth_headers(token)

    # Token works before logout.
    assert (await client.get("/auth/me", headers=h)).status_code == 200

    # Logout.
    r_logout = await client.post("/auth/logout", headers=h)
    assert r_logout.status_code == 204

    # Same access token is now revoked.
    r_me = await client.get("/auth/me", headers=h)
    assert r_me.status_code == 401


async def test_logout_revokes_refresh_token(client: AsyncClient):
    """After logout, the old refresh token must also be rejected."""
    r_reg = await client.post(
        "/auth/register",
        json={"email": "revoke_refresh@test.com", "password": "pass123"},
    )
    access_token = r_reg.json()["access_token"]
    refresh_token = r_reg.json()["refresh_token"]

    await client.post("/auth/logout", headers=auth_headers(access_token))

    r_refresh = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert r_refresh.status_code == 401


async def test_new_login_after_logout_works(client: AsyncClient):
    """Logging in again after logout produces a valid token."""
    await client.post("/auth/register", json={"email": "relogin@test.com", "password": "pass123"})
    r_login = await client.post("/auth/login", json={"email": "relogin@test.com", "password": "pass123"})
    old_token = r_login.json()["access_token"]

    await client.post("/auth/logout", headers=auth_headers(old_token))

    r_login2 = await client.post("/auth/login", json={"email": "relogin@test.com", "password": "pass123"})
    assert r_login2.status_code == 200
    new_token = r_login2.json()["access_token"]

    r_me = await client.get("/auth/me", headers=auth_headers(new_token))
    assert r_me.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════════
# M2 — RGPD: account deletion and data export
# ═══════════════════════════════════════════════════════════════════════════════

async def test_delete_me_removes_user_and_data(client: AsyncClient, db_session: AsyncSession):
    """DELETE /auth/me removes the user row and cascades to sessions, messages,
    and mood logs."""
    token = await register_and_login(client)
    h = auth_headers(token)

    # Create some data.
    r_chat = await client.post("/chat", json={"message": "Hello"}, headers=h)
    assert r_chat.status_code == 200

    await client.post("/mood", json={"score": 5, "label": "Calme", "note": "test note"}, headers=h)

    user_id = (await client.get("/auth/me", headers=h)).json()["id"]

    # Delete the account.
    r_delete = await client.delete("/auth/me", headers=h)
    assert r_delete.status_code == 204

    # User row is gone.
    user = (await db_session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    assert user is None

    # Sessions are gone (cascade).
    sessions = (await db_session.execute(
        select(Session).where(Session.user_id == user_id)
    )).scalars().all()
    assert sessions == []

    # Mood logs are gone (cascade).
    logs = (await db_session.execute(
        select(MoodLog).where(MoodLog.user_id == user_id)
    )).scalars().all()
    assert logs == []

    # Old access token returns 401.
    assert (await client.get("/auth/me", headers=h)).status_code == 401


async def test_export_me_returns_all_data(client: AsyncClient):
    """GET /auth/me/export returns profile, sessions with messages, and mood logs."""
    token = await register_and_login(client)
    h = auth_headers(token)

    # Create session + mood log.
    r_chat = await client.post("/chat", json={"message": "How do I calm down?"}, headers=h)
    assert r_chat.status_code == 200

    await client.post("/mood", json={"score": 7, "label": "Calme", "note": "feeling ok"}, headers=h)

    r_export = await client.get("/auth/me/export", headers=h)
    assert r_export.status_code == 200
    data = r_export.json()

    # Profile present.
    assert data["profile"]["email"] == "alice@test.com"
    assert "id" in data["profile"]

    # At least one session with messages.
    assert len(data["sessions"]) >= 1
    assert len(data["sessions"][0]["messages"]) >= 1

    # Mood log present with decrypted note.
    assert len(data["mood_logs"]) >= 1
    assert data["mood_logs"][0]["score"] == 7
    assert data["mood_logs"][0]["note"] == "feeling ok"


async def test_export_requires_auth(client: AsyncClient):
    """Unauthenticated export request is rejected."""
    r = await client.get("/auth/me/export")
    assert r.status_code in (401, 403)


async def test_delete_requires_auth(client: AsyncClient):
    """Unauthenticated delete request is rejected."""
    r = await client.delete("/auth/me")
    assert r.status_code in (401, 403)


# ═══════════════════════════════════════════════════════════════════════════════
# M3 — At-rest field encryption
# ═══════════════════════════════════════════════════════════════════════════════

async def test_chat_message_stored_as_ciphertext(client: AsyncClient, db_session: AsyncSession):
    """The raw DB value for message.content must be ciphertext (not the plaintext
    user message), but the API response returns readable plaintext."""
    token = await register_and_login(client)
    plaintext_message = "I feel really anxious today"

    r = await client.post("/chat", json={"message": plaintext_message}, headers=auth_headers(token))
    assert r.status_code == 200
    session_id = r.json()["session_id"]

    # Fetch the raw column value directly via SQL — bypass ORM type mapping.
    result = await db_session.execute(
        text("SELECT content FROM messages WHERE session_id = :sid LIMIT 1"),
        {"sid": session_id},
    )
    raw_content = result.scalar_one()

    # The stored value must NOT be the plaintext (it's encrypted).
    assert raw_content != plaintext_message, "Message content must not be stored as plaintext"
    # Fernet tokens start with "gAAAAA" (URL-safe base64).
    assert raw_content.startswith("gAAAAA"), f"Expected Fernet ciphertext, got: {raw_content[:20]}"

    # But reading via the API (ORM decrypts transparently) returns plaintext.
    r2 = await client.get(f"/chat/sessions/{session_id}/messages", headers=auth_headers(token))
    assert r2.status_code == 200
    messages = r2.json()
    user_messages = [m for m in messages if m["role"] == "user"]
    assert user_messages[0]["content"] == plaintext_message


async def test_mood_note_stored_as_ciphertext(client: AsyncClient, db_session: AsyncSession):
    """The raw DB value for mood_log.note must be ciphertext, but the API
    returns the original plaintext note."""
    token = await register_and_login(client)
    plaintext_note = "Feeling a bit overwhelmed"

    r = await client.post(
        "/mood",
        json={"score": 4, "label": "Anxieux", "note": plaintext_note},
        headers=auth_headers(token),
    )
    assert r.status_code == 201
    log_id = r.json()["id"]

    # Raw DB value.
    result = await db_session.execute(
        text("SELECT note FROM mood_logs WHERE id = :id"),
        {"id": log_id},
    )
    raw_note = result.scalar_one()

    assert raw_note != plaintext_note, "Mood note must not be stored as plaintext"
    assert raw_note.startswith("gAAAAA"), f"Expected Fernet ciphertext, got: {raw_note[:20]}"

    # API returns decrypted value.
    r2 = await client.get("/mood", headers=auth_headers(token))
    assert r2.status_code == 200
    logs = r2.json()
    assert logs[0]["note"] == plaintext_note


async def test_mood_note_null_stored_as_null(client: AsyncClient, db_session: AsyncSession):
    """A null note is stored and retrieved as null — no encryption artefact."""
    token = await register_and_login(client)

    r = await client.post(
        "/mood",
        json={"score": 8, "label": "Joyeux"},
        headers=auth_headers(token),
    )
    assert r.status_code == 201
    log_id = r.json()["id"]

    result = await db_session.execute(
        text("SELECT note FROM mood_logs WHERE id = :id"),
        {"id": log_id},
    )
    raw_note = result.scalar_one_or_none()
    assert raw_note is None
