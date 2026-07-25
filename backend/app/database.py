from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings

_engine = None
_SessionLocal = None


def _get_engine():
    global _engine
    if _engine is None:
        kwargs: dict = {
            "echo": False,
            "pool_pre_ping": True,
        }
        if not settings.database_url.startswith("sqlite"):
            # Serverless (Vercel): use the Supabase pooler (port 6543) and
            # keep a tiny pool.  Each serverless invocation is short-lived, so
            # a large pool wastes connections.  The pooler handles multiplexing.
            kwargs["pool_size"] = 1
            kwargs["max_overflow"] = 0
            kwargs["pool_recycle"] = 300  # recycle connections after 5 min
            kwargs["pool_timeout"] = 10   # fail fast if pool is exhausted
        _engine = create_async_engine(settings.database_url, **kwargs)
    return _engine


def _get_session_factory():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = async_sessionmaker(
            _get_engine(), expire_on_commit=False, class_=AsyncSession
        )
    return _SessionLocal


# Public alias used by cron / external entry points that bypass FastAPI deps.
def get_session_factory():
    """Return the async session factory (importable without FastAPI DI)."""
    return _get_session_factory()


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    factory = _get_session_factory()
    async with factory() as session:
        yield session


async def init_db() -> None:
    """Create all tables (dev only — use Alembic in production)."""
    from . import models  # noqa: F401

    engine = _get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
