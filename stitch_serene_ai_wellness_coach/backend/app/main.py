from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .config import settings
from .limiter import limiter


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
                admin_password = os.environ.get("ADMIN_PASSWORD", "SereneAdmin2024!")
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

from .routers import auth, billing, chat, community, integrations, journal, mood, progress, report, admin  # noqa: E402

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(mood.router)
app.include_router(journal.router)
app.include_router(progress.router)
app.include_router(billing.router)
app.include_router(integrations.router)
app.include_router(report.router)
app.include_router(community.router)
app.include_router(admin.router)


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
