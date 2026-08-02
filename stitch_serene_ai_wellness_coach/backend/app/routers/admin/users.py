"""Backoffice user management — advanced search, filters and secured actions."""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...deps import get_current_admin_user
from ...models import (
    AdminAuditLog,
    AdminNotification,
    AIUsageLog,
    ExerciseCompletion,
    Message,
    MoodLog,
    Session,
    User,
)
from ...services.subscription import grant_premium, revoke_premium
from .common import log_audit, technique_label, utcnow

router = APIRouter(prefix="/admin", tags=["admin"])


def _user_out(u: User, counts: dict | None = None) -> dict:
    counts = counts or {}
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "is_premium": u.is_premium,
        "is_admin": u.is_admin,
        "is_suspended": u.is_suspended,
        "email_verified": u.email_verified,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
        "session_count": counts.get(u.id, {}).get("sessions", 0),
        "message_count": counts.get(u.id, {}).get("messages", 0),
        "mood_count": counts.get(u.id, {}).get("moods", 0),
        "avg_mood": counts.get(u.id, {}).get("avg_mood"),
        "is_active_7d": counts.get(u.id, {}).get("active", False),
    }


async def _build_counts(db: AsyncSession, users: list[User]) -> dict[int, dict]:
    """Aggregate sessions/messages/moods/activity for a page of users."""
    ids = [u.id for u in users]
    out: dict[int, dict] = {uid: {"sessions": 0, "messages": 0, "moods": 0, "avg_mood": None, "active": False} for uid in ids}
    if not ids:
        return out
    now = utcnow()
    week_ago = now - timedelta(days=7)

    sess_rows = (
        await db.execute(
            select(Session.user_id, func.count(Session.id)).where(Session.user_id.in_(ids)).group_by(Session.user_id)
        )
    ).all()
    for uid, c in sess_rows:
        out[uid]["sessions"] = c

    msg_rows = (
        await db.execute(
            select(Session.user_id, func.count(Message.id))
            .join(Message, Message.session_id == Session.id)
            .where(Session.user_id.in_(ids))
            .group_by(Session.user_id)
        )
    ).all()
    for uid, c in msg_rows:
        out[uid]["messages"] = c

    mood_rows = (
        await db.execute(
            select(MoodLog.user_id, func.count(MoodLog.id), func.avg(MoodLog.score))
            .where(MoodLog.user_id.in_(ids))
            .group_by(MoodLog.user_id)
        )
    ).all()
    for uid, c, avg in mood_rows:
        out[uid]["moods"] = c
        out[uid]["avg_mood"] = round(float(avg), 1) if avg else None

    active_ids = (
        await db.execute(
            select(func.distinct(Session.user_id)).where(
                Session.user_id.in_(ids), Session.created_at >= week_ago
            )
        )
    ).all()
    for (uid,) in active_ids:
        out[uid]["active"] = True
    return out


# ── GET /admin/users (advanced search + filters) ─────────────────────────────

@router.get("/users")
async def list_users(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    q: str = Query("", description="Search by email or name"),
    premium: bool | None = Query(None),
    active: bool | None = Query(None),
    suspended: bool | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    now = utcnow()
    week_ago = now - timedelta(days=7)
    offset = (page - 1) * per_page

    conditions = []
    if q:
        like = f"%{q}%"
        conditions.append(or_(User.email.ilike(like), User.name.ilike(like)))
    if premium is not None:
        conditions.append(User.is_premium == premium)
    if suspended is not None:
        conditions.append(User.is_suspended == suspended)
    if date_from:
        conditions.append(User.created_at >= date_from)
    if date_to:
        conditions.append(User.created_at <= date_to)
    if active is not None:
        if active:
            conditions.append(
                User.id.in_(
                    select(func.distinct(Session.user_id)).where(Session.created_at >= week_ago)
                )
            )
        else:
            conditions.append(
                User.id.not_in(
                    select(func.distinct(Session.user_id)).where(Session.created_at >= week_ago)
                )
            )

    query = select(User)
    count_query = select(func.count(User.id))
    if conditions:
        query = query.where(and_(*conditions))
        count_query = count_query.where(and_(*conditions))

    total = (await db.execute(count_query)).scalar() or 0
    users = (
        (await db.execute(query.order_by(User.created_at.desc()).offset(offset).limit(per_page)))
        .scalars()
        .all()
    )
    counts = await _build_counts(db, users)

    return {
        "users": [_user_out(u, counts) for u in users],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),
    }


# ── GET /admin/users/{user_id} ───────────────────────────────────────────────

@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    now = utcnow()
    week_ago = now - timedelta(days=7)

    sessions = (
        (
            await db.execute(
                select(Session)
                .where(Session.user_id == user_id)
                .order_by(Session.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    mood_logs = (
        (
            await db.execute(
                select(MoodLog)
                .where(MoodLog.user_id == user_id)
                .order_by(MoodLog.created_at.desc())
                .limit(60)
            )
        )
        .scalars()
        .all()
    )
    msg_count = (
        await db.execute(
            select(func.count(Message.id))
            .join(Session, Message.session_id == Session.id)
            .where(Session.user_id == user_id)
        )
    ).scalar() or 0
    sessions_7d = sum(1 for s in sessions if s.created_at and _naive(s.created_at) >= week_ago.replace(tzinfo=None))
    messages_7d = (
        await db.execute(
            select(func.count(Message.id))
            .join(Session, Message.session_id == Session.id)
            .where(and_(Session.user_id == user_id, Message.created_at >= week_ago))
        )
    ).scalar() or 0
    avg_mood = (
        await db.execute(select(func.avg(MoodLog.score)).where(MoodLog.user_id == user_id))
    ).scalar()
    avg_mood_7d = (
        await db.execute(
            select(func.avg(MoodLog.score)).where(
                and_(MoodLog.user_id == user_id, MoodLog.created_at >= week_ago)
            )
        )
    ).scalar()
    exercise_count = (
        await db.execute(
            select(func.count(ExerciseCompletion.id)).where(ExerciseCompletion.user_id == user_id)
        )
    ).scalar() or 0

    technique_rows = (
        await db.execute(
            select(Message.technique, func.count(Message.id))
            .join(Session, Message.session_id == Session.id)
            .where(
                and_(
                    Session.user_id == user_id,
                    Message.technique.isnot(None),
                    Message.technique != "",
                )
            )
            .group_by(Message.technique)
            .order_by(func.count(Message.id).desc())
        )
    ).all()
    techniques = {technique_label(t): c for t, c in technique_rows}

    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "is_premium": user.is_premium,
            "is_admin": user.is_admin,
            "is_suspended": user.is_suspended,
            "email_verified": user.email_verified,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        },
        "metrics": {
            "total_sessions": len(sessions),
            "sessions_7d": sessions_7d,
            "total_messages": msg_count,
            "messages_7d": messages_7d,
            "total_mood_logs": len(mood_logs),
            "total_exercises": exercise_count,
            "avg_mood": round(float(avg_mood), 1) if avg_mood else None,
            "avg_mood_7d": round(float(avg_mood_7d), 1) if avg_mood_7d else None,
            "techniques": techniques,
        },
        "sessions": [
            {
                "id": s.id,
                "title": s.title,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in sessions
        ],
        "mood_logs": [
            {
                "id": m.id,
                "score": m.score,
                "label": m.label,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in mood_logs
        ],
    }


def _naive(dt: datetime) -> datetime:
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


# ── PUT /admin/users/{user_id} (edit) ────────────────────────────────────────

class AdminUserUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    is_premium: bool | None = None


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    body: AdminUserUpdateIn,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    if body.email is not None and body.email != user.email:
        exists = (
            await db.execute(select(User.id).where(User.email == body.email, User.id != user_id))
        ).scalar_one_or_none()
        if exists:
            raise HTTPException(409, "Email already in use by another account")
        user.email = body.email
    if body.name is not None:
        user.name = body.name
    if body.is_premium is not None and body.is_premium != user.is_premium:
        if body.is_premium:
            await grant_premium(db, user, source="admin", plan="monthly")
        else:
            await revoke_premium(db, user, source="admin", reason="canceled")
    else:
        db.add(user)
        await db.commit()

    await log_audit(
        db, admin, "user_update", target_user_id=user.id,
        details=f"name={user.name} email={user.email}", request=request,
    )
    await db.refresh(user)
    return _user_out(user)


# ── PUT /admin/users/{user_id}/toggle-admin ──────────────────────────────────

@router.put("/users/{user_id}/toggle-admin")
async def toggle_admin(
    user_id: int,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(400, "You cannot change your own admin role")
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_admin = not user.is_admin
    db.add(user)
    await db.commit()
    await log_audit(
        db, admin, "toggle_admin", target_user_id=user.id,
        details=f"is_admin={user.is_admin}", request=request,
    )
    return {"id": user.id, "is_admin": user.is_admin}


# ── PUT /admin/users/{user_id}/toggle-premium ────────────────────────────────

@router.put("/users/{user_id}/toggle-premium")
async def toggle_premium(
    user_id: int,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if user.is_premium:
        await revoke_premium(db, user, source="admin", reason="canceled")
        await log_audit(db, admin, "remove_premium", target_user_id=user.id, request=request)
    else:
        await grant_premium(db, user, source="admin", plan="monthly")
        await log_audit(db, admin, "grant_premium", target_user_id=user.id, request=request)
    return {"id": user.id, "is_premium": user.is_premium}


# ── PUT /admin/users/{user_id}/suspend | /reactivate ─────────────────────────

@router.put("/users/{user_id}/suspend")
async def suspend_user(
    user_id: int,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(400, "You cannot suspend your own account")
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_suspended = True
    user.token_version = (user.token_version or 0) + 1  # invalidate existing tokens
    db.add(user)
    await db.commit()
    await log_audit(db, admin, "suspend_user", target_user_id=user.id, request=request)
    return {"id": user.id, "is_suspended": True}


@router.put("/users/{user_id}/reactivate")
async def reactivate_user(
    user_id: int,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_suspended = False
    db.add(user)
    await db.commit()
    await log_audit(db, admin, "reactivate_user", target_user_id=user.id, request=request)
    return {"id": user.id, "is_suspended": False}


# ── DELETE /admin/users/{user_id} ────────────────────────────────────────────

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(400, "You cannot delete your own account")
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    # Detach backoffice references before deleting the user (cascade handles the rest).
    await db.execute(
        update(AdminAuditLog)
        .where(or_(AdminAuditLog.admin_user_id == user_id, AdminAuditLog.target_user_id == user_id))
        .values(admin_user_id=None, target_user_id=None)
    )
    await db.execute(update(AIUsageLog).where(AIUsageLog.user_id == user_id).values(user_id=None))
    await db.execute(
        update(AdminNotification)
        .where(or_(AdminNotification.created_by == user_id, AdminNotification.target_user_id == user_id))
        .values(created_by=None, target_user_id=None)
    )

    await db.delete(user)
    await db.commit()
    await log_audit(db, admin, "delete_user", target_user_id=user_id, request=request)
    return {"ok": True}
