"""Push notification delivery via the Expo Push Notification API.

Sends push notifications to users who have registered an Expo push token.
Includes a helper for daily check-in reminders and streak milestones.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import User

logger = logging.getLogger("serene.push")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_push(
    expo_push_token: str,
    title: str,
    body: str,
    data: dict | None = None,
    sound: str = "default",
) -> bool:
    """Send a single push notification. Returns True on success."""
    payload = {
        "to": expo_push_token,
        "title": title,
        "body": body,
        "sound": sound,
        "data": data or {},
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(EXPO_PUSH_URL, json=payload)
            if r.status_code == 200:
                result = r.json()
                if result.get("data", {}).get("status") == "ok":
                    return True
                logger.warning("Expo push rejected: %s", result)
                return False
            logger.warning("Expo push HTTP %s: %s", r.status_code, r.text[:200])
            return False
    except Exception:
        logger.exception("Failed to send push notification")
        return False


async def send_bulk_push(
    notifications: list[dict],
) -> int:
    """Send multiple push notifications in a single batch. Returns count of successful sends."""
    if not notifications:
        return 0
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(EXPO_PUSH_URL, json=notifications)
            if r.status_code == 200:
                results = r.json().get("data", [])
                success = sum(1 for item in results if item.get("status") == "ok")
                return success
            logger.warning("Expo bulk push HTTP %s: %s", r.status_code, r.text[:200])
            return 0
    except Exception:
        logger.exception("Failed to send bulk push notifications")
        return 0


async def send_daily_checkin_reminder(db: AsyncSession) -> int:
    """Send daily check-in reminders to users who haven't logged mood today.

    Returns the number of notifications sent.
    """
    from ..models import MoodLog

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    # Find users with push tokens who haven't logged mood today.
    users_with_token = (await db.execute(
        select(User).where(User.expo_push_token.isnot(None))
    )).scalars().all()

    sent = 0
    notifications = []
    for user in users_with_token:
        # Check if user already logged mood today.
        today_mood = (await db.execute(
            select(MoodLog.id).where(
                MoodLog.user_id == user.id,
                MoodLog.created_at >= today_start,
            ).limit(1)
        )).scalar_one_or_none()
        if today_mood is not None:
            continue

        notifications.append({
            "to": user.expo_push_token,
            "title": "Comment allez-vous aujourd'hui ?",
            "body": f"Bonjour {user.name} ! Prenez un moment pour enregistrer votre humeur.",
            "sound": "default",
            "data": {"screen": "home"},
        })

    if notifications:
        sent = await send_bulk_push(notifications)
        logger.info("Daily check-in reminders sent: %d/%d", sent, len(notifications))

    return sent


async def send_streak_milestone(db: AsyncSession, user: User, streak: int) -> bool:
    """Send a congratulatory push when a user hits a streak milestone."""
    milestones = {3, 7, 14, 21, 30, 50, 100}
    if streak not in milestones or not user.expo_push_token:
        return False

    messages = {
        3: "3 jours consécutifs ! Vous construisez une belle habitude.",
        7: "Une semaine complète ! Vous êtes sur la bonne voie.",
        14: "2 semaines ! Votre engagement est impressionnant.",
        21: "21 jours — on dit que c'est le temps pour former une habitude !",
        30: "Un mois de régularité. Votre bien-être s'en ressent.",
        50: "50 jours ! Vous êtes un exemple de constance.",
        100: "100 jours ! Un journey extraordinaire. Continuez.",
    }

    return await send_push(
        expo_push_token=user.expo_push_token,
        title=f"🔥 Série de {streak} jours !",
        body=messages.get(streak, f"Série de {streak} jours. Continuez !"),
        data={"screen": "progress"},
    )
