import logging
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..limiter import limiter
from ..models import Message, Session, User
from ..schemas import ChatIn, ChatOut, MessageOut, SessionOut
from ..services import coach
from ..services.llm import LLMError

logger = logging.getLogger("serene.chat")
router = APIRouter(prefix="/chat", tags=["chat"])


class RenameSessionIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)


@router.post("", response_model=ChatOut)
@limiter.limit(settings.rate_limit_chat, exempt_when=lambda: not settings.rate_limit_enabled)
async def chat(
    request: Request,
    body: Annotated[ChatIn, Body()],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await coach.handle_chat(db, user, body.message, body.session_id)
    except ValueError as e:
        raise HTTPException(404, "Session not found") from e
    except LLMError as e:
        logger.warning("LLM provider failure: %s", e)
        raise HTTPException(503, "Coach is temporarily unavailable, please retry.") from e
    return result


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Session).where(Session.user_id == user.id).order_by(Session.created_at.desc())
    )).scalars().all()
    return rows


@router.get("/sessions/{session_id}/messages", response_model=list[MessageOut])
async def session_messages(
    session_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    session = (await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user.id)
    )).scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")
    rows = (await db.execute(
        select(Message).where(Message.session_id == session_id).order_by(Message.id)
    )).scalars().all()
    return rows


@router.put("/sessions/{session_id}", response_model=SessionOut)
async def rename_session(
    session_id: int,
    body: RenameSessionIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = (await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user.id)
    )).scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")
    session.title = body.title
    await db.commit()
    await db.refresh(session)
    return session


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = (await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user.id)
    )).scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")
    await db.delete(session)
    await db.commit()
    return {"ok": True}
