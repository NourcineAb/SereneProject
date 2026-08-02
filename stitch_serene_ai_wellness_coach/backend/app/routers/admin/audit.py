"""Backoffice audit trail — immutable record of every admin action."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...deps import get_current_admin_user
from ...models import AdminAuditLog, User

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/audit-logs")
async def list_audit_logs(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    action: str = Query("", description="Filter by action type"),
    target_user_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    query = select(AdminAuditLog)
    count_query = select(func.count(AdminAuditLog.id))
    if action:
        query = query.where(AdminAuditLog.action == action)
        count_query = count_query.where(AdminAuditLog.action == action)
    if target_user_id:
        query = query.where(AdminAuditLog.target_user_id == target_user_id)
        count_query = count_query.where(AdminAuditLog.target_user_id == target_user_id)

    total = (await db.execute(count_query)).scalar() or 0
    rows = (
        (
            await db.execute(
                query.order_by(AdminAuditLog.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
            )
        )
        .scalars()
        .all()
    )

    # Distinct action types for the filter dropdown.
    actions = (
        await db.execute(select(func.distinct(AdminAuditLog.action)).order_by(AdminAuditLog.action))
    ).scalars().all()

    result = []
    for log in rows:
        admin_user = (
            await db.execute(select(User).where(User.id == log.admin_user_id))
        ).scalar_one_or_none() if log.admin_user_id else None
        target = (
            await db.execute(select(User).where(User.id == log.target_user_id))
        ).scalar_one_or_none() if log.target_user_id else None
        result.append(
            {
                "id": log.id,
                "action": log.action,
                "admin_email": admin_user.email if admin_user else None,
                "target_email": target.email if target else None,
                "details": log.details,
                "result": log.result,
                "ip": log.ip,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
        )

    return {
        "logs": result,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),
        "actions": list(actions),
    }
