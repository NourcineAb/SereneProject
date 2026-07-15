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
    # In production (Vercel), skip table creation — Alembic manages the schema.
    # In development, ensure tables exist for convenience.
    if not settings.is_production:
        from .database import init_db
        await init_db()
    yield


app = FastAPI(
    title="Serene API",
    description="Backend for Serene — an AI stress & anxiety coach (CBT + mindfulness).",
    version="0.1.0",
    lifespan=lifespan,
)

# Attach limiter state so SlowAPI can access it.
app.state.limiter = limiter

app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from .routers import auth, billing, chat, community, integrations, journal, mood, progress, report  # noqa: E402

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(mood.router)
app.include_router(journal.router)
app.include_router(progress.router)
app.include_router(billing.router)
app.include_router(integrations.router)
app.include_router(report.router)
app.include_router(community.router)


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
