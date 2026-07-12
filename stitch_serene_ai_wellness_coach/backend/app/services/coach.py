"""Serene coaching orchestration: builds the dynamic prompt, enforces the
freemium gate and crisis safety rule, calls the LLM and persists messages."""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import Message, Session, User
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


async def _load_history(db: AsyncSession, session_id: int) -> list[dict]:
    rows = (await db.execute(
        select(Message.role, Message.content)
        .where(Message.session_id == session_id)
        .order_by(Message.id.desc())
        .limit(HISTORY_LIMIT)
    )).all()
    return [{"role": r, "content": c} for r, c in reversed(rows)]


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
        }

    # ── Freemium gate: block only the *start* of a new session past the limit.
    # Never block continuing an existing conversation (and crisis always passes).
    # In "ads" monetization mode the weekly limit is lifted (ads monetize free users);
    # the gate applies in "iap" and "both" modes.
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
        }

    # ── Resolve or create the session.
    if session_id is None:
        session = Session(user_id=user.id)
        db.add(session)
        await db.flush()
        used += 1  # this new session counts toward the weekly tally
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

    # ── Fire-and-forget: send streak milestone push notification.
    if streak_days > 0:
        async def _safe_send_streak():
            try:
                from ..database import SessionLocal
                async with SessionLocal() as new_db:
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
    }
