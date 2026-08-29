"""Backoffice feedback — user feedback, suggestions and bug reports."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...deps import get_current_admin_user
from ...models import Feedback, User
from .common import log_audit, utcnow

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/feedback")
async def list_feedback(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    status: str = Query("", description="open | in_progress | resolved"),
    category: str = Query("", description="feedback | suggestion | bug"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    query = select(Feedback)
    count_query = select(func.count(Feedback.id))
    if status:
        query = query.where(Feedback.status == status)
        count_query = count_query.where(Feedback.status == status)
    if category:
        query = query.where(Feedback.category == category)
        count_query = count_query.where(Feedback.category == category)

    total = (await db.execute(count_query)).scalar() or 0
    rows = (
        (
            await db.execute(
                query.order_by(Feedback.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
            )
        )
        .scalars()
        .all()
    )

    open_count = (
        await db.execute(select(func.count(Feedback.id)).where(Feedback.status == "open"))
    ).scalar() or 0
    resolved_count = (
        await db.execute(select(func.count(Feedback.id)).where(Feedback.status == "resolved"))
    ).scalar() or 0

    result = []
    for f in rows:
        user = (
            await db.execute(select(User).where(User.id == f.user_id))
        ).scalar_one_or_none()
        result.append(
            {
                "id": f.id,
                "user_id": f.user_id,
                "email": user.email if user else None,
                "name": user.name if user else None,
                "category": f.category,
                "content": f.content,
                "status": f.status,
                "created_at": f.created_at.isoformat() if f.created_at else None,
                "resolved_at": f.resolved_at.isoformat() if f.resolved_at else None,
            }
        )

    return {
        "feedback": result,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),
        "counts": {"open": open_count, "resolved": resolved_count, "total": total},
    }


class FeedbackStatusIn(BaseModel):
    status: str = Field(pattern="^(open|in_progress|resolved)$")


@router.put("/feedback/{feedback_id}/status")
async def update_feedback_status(
    feedback_id: int,
    body: FeedbackStatusIn,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    item = (
        await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Feedback not found")
    item.status = body.status
    item.resolved_at = utcnow() if body.status == "resolved" else None
    db.add(item)
    await db.commit()
    await log_audit(
        db, admin, "update_feedback",
        details=f"feedback={item.id} status={item.status}",
        request=request,
    )
    return {"id": item.id, "status": item.status}


@router.delete("/feedback/{feedback_id}")
async def delete_feedback(
    feedback_id: int,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    item = (
        await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Feedback not found")
    await db.delete(item)
    await db.commit()
    await log_audit(
        db, admin, "delete_feedback",
        details=f"feedback={feedback_id}",
        request=request,
    )
    return {"ok": True}
