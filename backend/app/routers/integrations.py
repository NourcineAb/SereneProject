"""Push notification token registration, delivery, and RevenueCat webhook handler."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..services import push

logger = logging.getLogger(__name__)

router = APIRouter(tags=["integrations"])

# RevenueCat event types that grant / revoke premium.
_GRANT_EVENTS = {"INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE"}
_REVOKE_EVENTS = {"CANCELLATION", "EXPIRATION"}


# ─── Push token registration ────────────────────────────────────────────────

class PushTokenIn(BaseModel):
    expo_push_token: str


@router.post("/push/register")
async def register_push_token(
    body: PushTokenIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Persist the Expo push token for the authenticated user."""
    user.expo_push_token = body.expo_push_token
    db.add(user)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── Push delivery ───────────────────────────────────────────────────────────

@router.post("/push/daily-checkin")
async def trigger_daily_checkin(
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> dict:
    """Trigger daily check-in reminders for all eligible users.

    Protected by the ``CRON_SECRET`` shared secret.  Vercel Cron injects this
    as ``Authorization: Bearer <token>``.  Manual callers must do the same.
    """
    secret = settings.cron_secret
    if secret:
        token = (authorization or "").replace("Bearer ", "").strip()
        if token != secret:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid cron secret")
    else:
        logger.warning("/push/daily-checkin called without CRON_SECRET configured — allowing in dev")

    sent = await push.send_daily_checkin_reminder(db)
    return {"status": "ok", "sent": sent}


# ─── RevenueCat webhook ──────────────────────────────────────────────────────

@router.post("/webhooks/revenuecat", status_code=status.HTTP_200_OK)
async def revenuecat_webhook(
    request: Request,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Handle RevenueCat subscription lifecycle events.

    RevenueCat sends the configured shared secret in the Authorization header
    as a plain string (not a Bearer token).  We verify it before processing.
    """
    # Verify shared secret when one is configured.
    secret = settings.revenuecat_webhook_secret
    if secret:
        if authorization != secret:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid webhook secret")

    payload = await request.json()

    event: dict = payload.get("event", {})
    event_type: str = event.get("type", "")
    app_user_id: str | None = event.get("app_user_id")

    if event_type not in (_GRANT_EVENTS | _REVOKE_EVENTS):
        logger.info("revenuecat_webhook: ignoring unknown event type=%s", event_type)
        return {"status": "ignored"}

    if not app_user_id:
        logger.warning("revenuecat_webhook: missing app_user_id in event type=%s", event_type)
        return {"status": "ignored"}

    # app_user_id is the user's numeric id serialised as a string.
    try:
        user_id = int(app_user_id)
    except ValueError:
        logger.warning("revenuecat_webhook: non-numeric app_user_id=%s", app_user_id)
        return {"status": "ignored"}

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        logger.warning("revenuecat_webhook: user id=%s not found", user_id)
        return {"status": "ignored"}

    new_premium = event_type in _GRANT_EVENTS
    user.is_premium = new_premium
    db.add(user)
    await db.commit()
    logger.info(
        "revenuecat_webhook: user id=%s is_premium set to %s via event %s",
        user_id, new_premium, event_type,
    )
    return {"status": "ok"}
