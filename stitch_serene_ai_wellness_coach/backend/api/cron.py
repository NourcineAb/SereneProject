"""Vercel Cron entry point — daily check-in push reminders.

Vercel Cron calls GET /api/cron/daily-checkin on the schedule defined in
vercel.json (every day at 18:00 UTC).  The request is authenticated via a
shared ``CRON_SECRET`` token passed in the ``Authorization: Bearer <token>``
header that Vercel injects automatically.
"""
import sys
import os

# Ensure ``app`` package is importable.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, Header, HTTPException, status  # noqa: E402
from app.config import settings  # noqa: E402

cron_app = FastAPI(title="Serene Cron")


@cron_app.get("/api/cron/daily-checkin")
async def daily_checkin(authorization: str = Header(default="")):
    """Send daily check-in push reminders to eligible users.

    Authenticated via the ``CRON_SECRET`` env var that Vercel injects.
    """
    secret = settings.cron_secret
    if not secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "CRON_SECRET not configured")

    # Vercel sends "Bearer <token>"
    token = authorization.replace("Bearer ", "").strip()
    if token != secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid cron secret")

    # Lazy-import DB + push module so cold start stays fast for normal requests.
    from app.database import get_session_factory  # noqa: E402
    from app.services.push import send_daily_checkin_reminder  # noqa: E402

    factory = get_session_factory()
    async with factory() as db:
        sent = await send_daily_checkin_reminder(db)

    return {"status": "ok", "sent": sent}
