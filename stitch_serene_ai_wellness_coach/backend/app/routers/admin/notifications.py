"""Backoffice notifications — send real push notifications and record history."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...deps import get_current_admin_user
from ...models import AdminNotification, User
from ...services.push import send_bulk_push, send_push
from .common import log_audit, utcnow

router = APIRouter(prefix="/admin", tags=["admin"])


class AdminNotificationIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=2000)
    target_type: str = Field(default="all", description="all | premium | free | specific")
    target_user_id: int | None = None


@router.post("/notifications/send")
async def send_admin_notification(
    body: AdminNotificationIn,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if body.target_type not in ("all", "premium", "free", "specific"):
        raise HTTPException(400, "Invalid target_type")

    if body.target_type == "specific":
        if not body.target_user_id:
            raise HTTPException(400, "target_user_id is required for specific targets")
        user = (
            await db.execute(select(User).where(User.id == body.target_user_id))
        ).scalar_one_or_none()
        if not user:
            raise HTTPException(404, "Target user not found")
        targets = [user] if user.expo_push_token else []
    else:
        query = select(User).where(User.expo_push_token.isnot(None))
        if body.target_type == "premium":
            query = query.where(User.is_premium)
        elif body.target_type == "free":
            query = query.where(User.is_premium.is_(False))
        targets = (await db.execute(query)).scalars().all()

    notifications = [
        {
            "to": u.expo_push_token,
            "title": body.title,
            "body": body.body,
            "sound": "default",
            "data": {"screen": "home", "source": "admin"},
        }
        for u in targets
        if u.expo_push_token
    ]

    sent = await send_bulk_push(notifications) if notifications else 0

    record = AdminNotification(
        title=body.title,
        body=body.body,
        target_type=body.target_type,
        target_user_id=body.target_user_id,
        status="sent" if sent == len(notifications) else ("failed" if sent == 0 else "partial"),
        total_targets=len(notifications),
        sent_count=sent,
        failed_count=len(notifications) - sent,
        created_by=admin.id,
    )
    db.add(record)
    await db.commit()
    await log_audit(
        db, admin, "send_notification",
        target_user_id=body.target_user_id,
        details=f"target={body.target_type} targets={len(notifications)} sent={sent}",
        request=request,
    )
    return {"id": record.id, "targets": len(notifications), "sent": sent}


@router.get("/notifications")
async def list_notifications(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    total = (await db.execute(select(func.count(AdminNotification.id)))).scalar() or 0
    rows = (
        (
            await db.execute(
                select(AdminNotification)
                .order_by(AdminNotification.created_at.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        )
        .scalars()
        .all()
    )
    return {
        "notifications": [
            {
                "id": n.id,
                "title": n.title,
                "body": n.body,
                "target_type": n.target_type,
                "status": n.status,
                "total_targets": n.total_targets,
                "sent_count": n.sent_count,
                "failed_count": n.failed_count,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in rows
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),
    }
