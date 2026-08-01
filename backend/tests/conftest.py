"""Shared pytest fixtures for the Serene backend test suite.

Key design choices:
- In-memory async SQLite (aiosqlite) — no Postgres required.
- DB engine/session are created fresh per test function so every test starts
  with a clean schema.
- `get_db` is overridden via FastAPI dependency_overrides.
- `app.services.llm.generate` is monkeypatched at the module level so no
  real network calls are ever made.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Import the app *after* environment is set up so settings pick up test defaults.
from app.main import app
from app.database import Base, get_db

SQLITE_URL = "sqlite+aiosqlite:///:memory:"

CANNED_REPLY = "Let's try box breathing together.\n[TECHNIQUE: box_breathing]"


# ─── Disable rate limiting for all tests ─────────────────────────────────────

@pytest.fixture(autouse=True)
def deterministic_test_env(monkeypatch):
    """Make the suite independent of the developer's local ``.env``.

    - Disable SlowAPI rate limiting so tests can hammer the same endpoints.
    - Neutralize the RevenueCat webhook secret: the webhook tests in
      ``test_api.py`` exercise the *no-signature-configured* path, so a secret
      present in a local ``.env`` would otherwise make them 401. Tests must not
      depend on local environment.
    """
    from app.config import settings
    monkeypatch.setattr(settings, "rate_limit_enabled", False)
    monkeypatch.setattr(settings, "revenuecat_webhook_secret", "")
    # Also reset the limiter's in-memory storage between tests.
    from app.limiter import limiter
    limiter.reset()


# ─── Per-test SQLite engine + session override ───────────────────────────────

@pytest_asyncio.fixture()
async def db_session():
    """Create an in-memory SQLite engine, create all tables, yield a session,
    and tear down afterwards."""
    engine = create_async_engine(SQLITE_URL, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture()
async def client(db_session: AsyncSession, monkeypatch):
    """Return an async test client with the DB override and LLM monkeypatched."""
    # Monkeypatch the LLM generate function to return a canned reply.
    import app.services.llm as llm_module

    async def _fake_generate(system: str, history: list[dict]) -> str:  # noqa: ARG001
        return CANNED_REPLY

    monkeypatch.setattr(llm_module, "generate", _fake_generate)

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)


# ─── Convenience helpers ─────────────────────────────────────────────────────

async def register_and_login(client: AsyncClient, email: str = "alice@test.com", password: str = "secret123") -> str:
    """Register a user and return the JWT access token."""
    r = await client.post("/auth/register", json={"email": email, "password": password, "name": "Alice"})
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
