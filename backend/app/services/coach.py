"""Serene coaching orchestration: builds the dynamic prompt, enforces the
freemium gate and crisis safety rule, calls the LLM and persists messages."""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import ExerciseCompletion, Message, Session, User
from ..prompts import (
    CRISIS_REPLY,
    build_system_prompt,
    detect_crisis,
    extract_technique,
)
from . import llm, progress, push
from .moderation import moderate_message

logger = logging.getLogger("serene.coach")

HISTORY_LIMIT = 20  # messages of context sent to the model

# Mapping: technique tag -> list of exercise suggestions
TECHNIQUE_EXERCISES: dict[str, list[dict]] = {
    "box_breathing": [
        {"id": "square-breathing", "name": "Respiration carrée", "icon": "fitness", "route": "/breathing", "duration": "2 min", "description": "Cycle 4-4-4-4 pour calmer l'esprit"},
    ],
    "grounding_54321": [
        {"id": "grounding-54321", "name": "Ancrage 5-4-3-2-1", "icon": "earth", "route": "/grounding", "duration": "5 min", "description": "Ancrage sensoriel complet"},
    ],
    "pmr": [
        {"id": "pmr", "name": "Relaxation musculaire", "icon": "body", "route": "/pmr", "duration": "8 min", "description": "PMR pour relâcher les tensions"},
    ],
    "cognitive_reframing": [
        {"id": "reframing", "name": "Reprogrammation cognitive", "icon": "bulb", "route": "/reframing", "duration": "10 min", "description": "Transformez vos pensées négatives"},
    ],
    "journaling": [
        {"id": "journal", "name": "Journaling apaisant", "icon": "book", "route": "/journal", "duration": "10 min", "description": "Exprimez-vous librement"},
    ],
}

# Default suggestions when no specific technique was recommended
DEFAULT_EXERCISES = [
    {"id": "square-breathing", "name": "Respiration carrée", "icon": "fitness", "route": "/breathing", "duration": "2 min", "description": "Cycle 4-4-4-4 pour calmer l'esprit"},
    {"id": "grounding-54321", "name": "Ancrage 5-4-3-2-1", "icon": "earth", "route": "/grounding", "duration": "5 min", "description": "Ancrage sensoriel complet"},
]


async def _load_history(db: AsyncSession, session_id: int) -> list[dict]:
    rows = (await db.execute(
        select(Message.role, Message.content)
        .where(Message.session_id == session_id)
        .order_by(Message.id.desc())
        .limit(HISTORY_LIMIT)
    )).all()
    return [{"role": r, "content": c} for r, c in reversed(rows)]


async def _get_exercise_stats(db: AsyncSession, user_id: int) -> dict[str, int]:
    """Return {exercise_id: completion_count} for the user."""
    rows = (await db.execute(
        select(ExerciseCompletion.exercise_id, func.count(ExerciseCompletion.id))
        .where(ExerciseCompletion.user_id == user_id)
        .group_by(ExerciseCompletion.exercise_id)
    )).all()
    return {exercise_id: count for exercise_id, count in rows}


async def handle_chat(
    db: AsyncSession, user: User, message: str, session_id: int | None
) -> dict:
    used = await progress.sessions_this_week(db, user.id)
    limit = settings.free_sessions_per_week
    starting_new = session_id is None

    # ── Content moderation — reject harmful messages before processing.
    mod_result = moderate_message(message)
    if not mod_result.allowed:
        return {
            "session_id": 0,
            "reply": (
                "Je comprends que vous puissiez ressentir des émotions fortes. "
                "Cependant, je ne peux pas traiter ce type de message. "
                "Si vous traversez une difficile, n'hésitez pas à contacter "
                "un professionnel : 3114 (FR) · 988 (US)."
            ),
            "technique": None,
            "paywall": False,
            "sessions_used": used,
            "sessions_limit": limit,
            "suggested_exercises": DEFAULT_EXERCISES,
            "exercise_stats": await _get_exercise_stats(db, user.id),
        }

    # ── Freemium gate: block only the *start* of a new session past the limit.
    gate_enabled = settings.monetization_mode in {"iap", "both"}
    gate_hit = (
        gate_enabled
        and starting_new
        and not user.is_premium
        and used >= limit
        and not detect_crisis(message)
    )
    if gate_hit:
        return {
            "session_id": 0,
            "reply": (
                f"You've had {limit} sessions this week — you're building a real habit. 🌱 "
                f"To continue, unlock unlimited sessions for {settings.premium_price_label}."
            ),
            "technique": None,
            "paywall": True,
            "sessions_used": used,
            "sessions_limit": limit,
            "suggested_exercises": [],
            "exercise_stats": {},
        }

    # ── Resolve or create the session.
    if session_id is None:
        session = Session(user_id=user.id)
        db.add(session)
        await db.flush()
        used += 1
        short = message.strip()[:80]
        if len(message.strip()) > 80:
            short = short.rsplit(" ", 1)[0] + "..."
        session.title = short
    else:
        session = (await db.execute(
            select(Session).where(Session.id == session_id, Session.user_id == user.id)
        )).scalar_one_or_none()
        if session is None:
            raise ValueError("session_not_found")

    db.add(Message(session_id=session.id, role="user", content=message))
    await db.flush()

    # ── Crisis safety rule overrides everything (no LLM call).
    if detect_crisis(message):
        db.add(Message(session_id=session.id, role="assistant",
                       content=CRISIS_REPLY, technique="crisis_referral"))
        await db.commit()
        return {
            "session_id": session.id, "reply": CRISIS_REPLY,
            "technique": "crisis_referral", "paywall": False,
            "sessions_used": used, "sessions_limit": limit,
            "suggested_exercises": DEFAULT_EXERCISES,
            "exercise_stats": await _get_exercise_stats(db, user.id),
        }

    # ── Build the dynamic system prompt from the live user profile.
    streak_days = await progress.current_streak(db, user.id)
    system = build_system_prompt(
        user_name=user.name,
        streak_days=streak_days,
        last_mood=await progress.last_mood_score(db, user.id),
        sessions_count=used,
        free_limit=limit,
        is_premium=user.is_premium,
        price=settings.premium_price_label,
    )
    history = await _load_history(db, session.id)

    raw = await llm.generate(system, history)
    reply, technique = extract_technique(raw)

    db.add(Message(session_id=session.id, role="assistant", content=reply, technique=technique))
    await db.commit()

    # ── Build exercise suggestions based on the technique.
    if technique and technique in TECHNIQUE_EXERCISES:
        suggested = TECHNIQUE_EXERCISES[technique]
    else:
        suggested = DEFAULT_EXERCISES

    exercise_stats = await _get_exercise_stats(db, user.id)

    # ── Fire-and-forget: send streak milestone push notification.
    if streak_days > 0:
        async def _safe_send_streak():
            try:
                from ..database import _get_session_factory
                factory = _get_session_factory()
                async with factory() as new_db:
                    await push.send_streak_milestone(new_db, user, streak_days)
            except Exception:
                logger.warning("Failed to send streak milestone push", exc_info=True)
        asyncio.create_task(_safe_send_streak())

    return {
        "session_id": session.id,
        "reply": reply,
        "technique": technique,
        "paywall": False,
        "sessions_used": used,
        "sessions_limit": limit,
        "suggested_exercises": suggested,
        "exercise_stats": exercise_stats,
    }
