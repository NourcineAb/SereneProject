import logging
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .config import settings
from .limiter import limiter

_logger = logging.getLogger("serene.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.is_production:
        from .database import init_db
        await init_db()
    # Ensure at least one admin user exists (safe to fail if DB unavailable)
    try:
        from .database import get_session_factory
        from .models import User
        from .security import hash_password
        from sqlalchemy import select
        factory = get_session_factory()
        async with factory() as db:
            admin_exists = (await db.execute(
                select(User).where(User.is_admin == True)
            )).scalar_one_or_none()
            if not admin_exists:
                import os
                admin_email = os.environ.get("ADMIN_EMAIL", "admin@serene.app")
                admin_password = os.environ.get("ADMIN_PASSWORD")
                if not admin_password:
                    if settings.is_production:
                        _logger.error("ADMIN_PASSWORD is not set; skipping default admin creation in production")
                    else:
                        admin_password = "SereneAdmin2024!"  # dev-only fallback
                if admin_password:
                    existing = (await db.execute(
                        select(User).where(User.email == admin_email)
                    )).scalar_one_or_none()
                    if existing:
                        existing.is_admin = True
                        await db.commit()
                    else:
                        user = User(
                            email=admin_email,
                            name="Admin",
                            hashed_password=hash_password(admin_password),
                            is_admin=True,
                            email_verified=True,
                        )
                        db.add(user)
                        await db.commit()
    except Exception:
        pass
    yield


app = FastAPI(
    title="Serene API",
    description="Backend for Serene — an AI stress & anxiety coach (CBT + mindfulness).",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter

app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_origin_regex=r"https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from .routers import auth, billing, chat, community, feedback, integrations, journal, mood, progress, report  # noqa: E402
from .routers.admin import (  # noqa: E402
    ai_monitoring,
    audit,
    feedback as admin_feedback,
    notifications,
    panel,
    payments as admin_payments,
    stats,
    subscriptions,
    system,
    users,
)

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(mood.router)
app.include_router(journal.router)
app.include_router(progress.router)
app.include_router(billing.router)
app.include_router(integrations.router)
app.include_router(report.router)
app.include_router(community.router)
app.include_router(feedback.router)
app.include_router(panel.router)
app.include_router(stats.router)
app.include_router(users.router)
app.include_router(subscriptions.router)
app.include_router(admin_payments.router)
app.include_router(ai_monitoring.router)
app.include_router(notifications.router)
app.include_router(admin_feedback.router)
app.include_router(audit.router)
app.include_router(system.router)


@app.exception_handler(Exception)
async def catch_all_exception_handler(request: Request, exc: Exception):
    _logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    await _record_error(
        source="api",
        method=request.method,
        path=request.url.path,
        message=str(exc) or exc.__class__.__name__,
        detail=exc.__class__.__name__,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Une erreur interne est survenue. Réessayez dans quelques instants."},
    )


async def _record_error(
    source: str,
    method: str | None,
    path: str | None,
    message: str,
    detail: str | None = None,
) -> None:
    """Persist a server error for the backoffice System page. Best-effort."""
    try:
        from .database import get_session_factory
        from .models import ErrorLog
        factory = get_session_factory()
        async with factory() as db:
            db.add(ErrorLog(source=source, method=method, path=path, message=message[:4000], detail=detail))
            await db.commit()
    except Exception:
        _logger.debug("Failed to persist error log", exc_info=True)


@app.get("/", tags=["meta"])
async def root():
    return {"message": "API is running"}


@app.get("/health", tags=["meta"])
async def health():
    return {
        "status": "ok",
        "service": "serene-api",
        "llm_primary": settings.llm_primary,
        "monetization_mode": settings.monetization_mode,
    }
