from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings

engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    """Run Alembic migrations to bring the schema up to date.

    Falls back to create_all when Alembic is unavailable (e.g. in tests
    that use an in-memory SQLite engine).
    """
    # Import models so they register on Base.metadata.
    from . import models  # noqa: F401

    try:
        from alembic.config import Config
        from alembic import command

        alembic_cfg = Config("alembic.ini")
        # Override the URL to use the async engine's URL.
        alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)

        # Run migrations in offline mode to generate SQL, then apply.
        # For async engines we use the env.py which handles async directly.
        command.upgrade(alembic_cfg, "head")
    except Exception:
        # Fallback for tests / dev: create tables directly.
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
