from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .config import settings
from .database import init_db
from .limiter import limiter
from .routers import auth, billing, chat, community, integrations, journal, mood, progress, report


@asynccontextmanager
async def lifespan(app: FastAPI):
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
    allow_origins=[
        "*",
        "http://localhost:8082",
        "http://localhost:8081",
        "http://localhost:19006",
        "http://localhost:8002",
        "http://localhost:8081",
        "http://192.168.100.107:8082",
        "http://192.168.100.107:8081",
        "http://192.168.100.107:8002",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


@app.get("/health", tags=["meta"])
async def health():
    return {
        "status": "ok",
        "service": "serene-api",
        "llm_primary": settings.llm_primary,
        "monetization_mode": settings.monetization_mode,
    }
