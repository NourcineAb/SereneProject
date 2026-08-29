"""Backoffice dashboard stats + analytics time-series.

All numbers come from real rows in the database. Nothing is mocked.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...deps import get_current_admin_user
from ...models import (
    AIUsageLog,
    ExerciseCompletion,
    Message,
    MoodLog,
    Payment,
    Session,
    Subscription,
    User,
)
from .common import technique_label, utcnow

router = APIRouter(prefix="/admin", tags=["admin"])


def _date_range(days: int) -> list[date]:
    today = utcnow().date()
    return [today - timedelta(days=d) for d in range(days - 1, -1, -1)]


def _naive_utc(dt: datetime) -> datetime:
    """Return a naive-UTC copy (SQLite stores naive; Postgres returns aware)."""
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


async def _new_users_by_day(db: AsyncSession, days: int) -> dict[date, int]:
    since = utcnow() - timedelta(days=days)
    rows = (
        await db.execute(
            select(func.date(User.created_at).label("day"), func.count(User.id))
            .where(User.created_at >= since)
            .group_by(text("day"))
        )
    ).all()
    return {r.day: r.count for r in rows}


async def _sessions_by_day(db: AsyncSession, days: int) -> dict[date, int]:
    since = utcnow() - timedelta(days=days)
    rows = (
        await db.execute(
            select(func.date(Session.created_at).label("day"), func.count(Session.id))
            .where(Session.created_at >= since)
            .group_by(text("day"))
        )
    ).all()
    return {r.day: r.count for r in rows}


async def _messages_by_day(db: AsyncSession, days: int) -> dict[date, int]:
    since = utcnow() - timedelta(days=days)
    rows = (
        await db.execute(
            select(func.date(Message.created_at).label("day"), func.count(Message.id))
            .where(Message.created_at >= since)
            .group_by(text("day"))
        )
    ).all()
    return {r.day: r.count for r in rows}


async def _mood_by_day(db: AsyncSession, days: int) -> dict[date, tuple[float, int]]:
    since = utcnow() - timedelta(days=days)
    rows = (
        await db.execute(
            select(
                func.date(MoodLog.created_at).label("day"),
                func.avg(MoodLog.score),
                func.count(MoodLog.id),
            )
            .where(MoodLog.created_at >= since)
            .group_by(text("day"))
        )
    ).all()
    return {r.day: (round(float(r.avg or 0), 1), r.count) for r in rows}


async def _payments_by_day(db: AsyncSession, days: int) -> dict[date, float]:
    since = utcnow() - timedelta(days=days)
    rows = (
        await db.execute(
            select(func.date(Payment.created_at).label("day"), func.sum(Payment.amount))
            .where(Payment.created_at >= since)
            .group_by(text("day"))
        )
    ).all()
    return {r.day: round(float(r.sum or 0), 2) for r in rows}


async def _active_subscription_days(db: AsyncSession, days: int) -> dict[date, int]:
    """For each day, the number of subscriptions active at that time (real)."""
    subs = (
        await db.execute(
            select(Subscription.started_at, Subscription.canceled_at)
        )
    ).all()
    series: dict[date, int] = {}
    for day in _date_range(days):
        day_start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)
        count = sum(
            1
            for s, c in subs
            if s is not None
            and _naive_utc(s) < day_end.replace(tzinfo=None)
            and (c is None or _naive_utc(c) >= day_start.replace(tzinfo=None))
        )
        series[day] = count
    return series


async def _techniques(db: AsyncSession, days: int) -> dict[str, int]:
    since = utcnow() - timedelta(days=days)
    rows = (
        await db.execute(
            select(Message.technique, func.count(Message.id))
            .where(
                Message.technique.isnot(None),
                Message.technique != "",
                Message.created_at >= since,
            )
            .group_by(Message.technique)
            .order_by(func.count(Message.id).desc())
        )
    ).all()
    return {technique_label(t): c for t, c in rows}


async def _retention(db: AsyncSession) -> dict[str, float | None]:
    """Real cohort retention: % of a signup-week cohort still active recently.

    For N days ago, we take users who registered between (N+7) and N days ago
    and measure how many of them were active in the last 7 days.
    """
    now = utcnow()
    result: dict[str, float | None] = {}
    for label, n in (("d1", 1), ("d7", 7), ("d14", 14), ("d30", 30)):
        cohort_end = now - timedelta(days=n)
        cohort_start = cohort_end - timedelta(days=7)
        cohort = (
            await db.execute(
                select(User.id).where(
                    User.created_at >= cohort_start,
                    User.created_at < cohort_end,
                )
            )
        ).scalars().all()
        if not cohort:
            result[label] = None
            continue
        active_7d = (
            await db.execute(
                select(func.count(func.distinct(Session.user_id))).where(
                    Session.user_id.in_(cohort),
                    Session.created_at >= now - timedelta(days=7),
                )
            )
        ).scalar() or 0
        result[label] = round(active_7d / len(cohort) * 100, 1)
    return result


# ── GET /admin/stats (dashboard; extended, backward-compatible) ──────────────

@router.get("/stats")
async def admin_stats(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    now = utcnow()
    day_start = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)

    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    premium_users = (
        await db.execute(select(func.count(User.id)).where(User.is_premium))
    ).scalar() or 0
    new_users_7d = (
        await db.execute(select(func.count(User.id)).where(User.created_at >= week_ago))
    ).scalar() or 0
    new_users_today = (
        await db.execute(select(func.count(User.id)).where(User.created_at >= day_start))
    ).scalar() or 0
    active_users_7d = (
        await db.execute(
            select(func.count(func.distinct(Session.user_id))).where(
                Session.created_at >= week_ago
            )
        )
    ).scalar() or 0
    active_users_today = (
        await db.execute(
            select(func.count(func.distinct(Session.user_id))).where(
                Session.created_at >= day_start
            )
        )
    ).scalar() or 0

    total_sessions = (await db.execute(select(func.count(Session.id)))).scalar() or 0
    sessions_7d = (
        await db.execute(select(func.count(Session.id)).where(Session.created_at >= week_ago))
    ).scalar() or 0
    sessions_today = (
        await db.execute(select(func.count(Session.id)).where(Session.created_at >= day_start))
    ).scalar() or 0

    total_messages = (await db.execute(select(func.count(Message.id)))).scalar() or 0
    messages_7d = (
        await db.execute(select(func.count(Message.id)).where(Message.created_at >= week_ago))
    ).scalar() or 0
    messages_today = (
        await db.execute(select(func.count(Message.id)).where(Message.created_at >= day_start))
    ).scalar() or 0

    total_mood_logs = (await db.execute(select(func.count(MoodLog.id)))).scalar() or 0
    mood_logs_7d = (
        await db.execute(select(func.count(MoodLog.id)).where(MoodLog.created_at >= week_ago))
    ).scalar() or 0
    avg_mood_all = (
        await db.execute(select(func.avg(MoodLog.score)))
    ).scalar()
    avg_mood_7d = (
        await db.execute(select(func.avg(MoodLog.score)).where(MoodLog.created_at >= week_ago))
    ).scalar()

    # Revenue & subscriptions (real payment/subscription rows).
    revenue_total = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0))
        )
    ).scalar() or 0
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    revenue_month = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.created_at >= month_start
            )
        )
    ).scalar() or 0
    active_subs = (
        await db.execute(
            select(func.count(Subscription.id)).where(Subscription.status.in_(["active", "trial"]))
        )
    ).scalar() or 0
    trial_subs = (
        await db.execute(
            select(func.count(Subscription.id)).where(Subscription.status == "trial")
        )
    ).scalar() or 0
    canceled_subs = (
        await db.execute(
            select(func.count(Subscription.id)).where(Subscription.status == "canceled")
        )
    ).scalar() or 0
    expiring_7d = (
        await db.execute(
            select(func.count(Subscription.id)).where(
                Subscription.status.in_(["active", "trial"]),
                Subscription.current_period_end.isnot(None),
                Subscription.current_period_end <= now + timedelta(days=7),
                Subscription.current_period_end >= now,
            )
        )
    ).scalar() or 0

    # AI usage (real logs).
    ai_requests_7d = (
        await db.execute(select(func.count(AIUsageLog.id)).where(AIUsageLog.created_at >= week_ago))
    ).scalar() or 0
    ai_errors_7d = (
        await db.execute(
            select(func.count(AIUsageLog.id)).where(
                AIUsageLog.created_at >= week_ago, AIUsageLog.status == "error"
            )
        )
    ).scalar() or 0

    # Payments (real rows) for the dashboard card.
    payments_total = (await db.execute(select(func.count(Payment.id)))).scalar() or 0
    payments_succeeded = (
        await db.execute(select(func.count(Payment.id)).where(Payment.status == "succeeded"))
    ).scalar() or 0
    payments_failed = (
        await db.execute(select(func.count(Payment.id)).where(Payment.status == "failed"))
    ).scalar() or 0

    technique_distribution = await _techniques(db, 7)

    mood_rows = (
        await db.execute(
            select(
                func.date(MoodLog.created_at).label("day"),
                func.avg(MoodLog.score).label("avg_score"),
                func.count(MoodLog.id).label("count"),
            )
            .where(MoodLog.created_at >= week_ago)
            .group_by(text("day"))
            .order_by(text("day"))
        )
    ).all()
    mood_trend = [
        {"date": str(r.day), "avg": round(float(r.avg_score or 0), 1), "count": r.count}
        for r in mood_rows
    ]

    exercise_rows = (
        await db.execute(
            select(ExerciseCompletion.exercise_id, func.count(ExerciseCompletion.id))
            .where(ExerciseCompletion.created_at >= week_ago)
            .group_by(ExerciseCompletion.exercise_id)
            .order_by(func.count(ExerciseCompletion.id).desc())
        )
    ).all()
    exercise_stats = {eid: c for eid, c in exercise_rows}

    return {
        "totals": {
            "users": total_users,
            "premium_users": premium_users,
            "sessions": total_sessions,
            "messages": total_messages,
            "mood_logs": total_mood_logs,
        },
        "week": {
            "new_users": new_users_7d,
            "active_users": active_users_7d,
            "sessions": sessions_7d,
            "messages": messages_7d,
            "mood_logs": mood_logs_7d,
            "avg_mood": round(float(avg_mood_7d or 0), 1) if avg_mood_7d else None,
            "conversion_rate": (
                round(premium_users / total_users * 100, 1) if total_users else 0
            ),
        },
        "today": {
            "new_users": new_users_today,
            "active_users": active_users_today,
            "sessions": sessions_today,
            "messages": messages_today,
        },
        "avg_mood": round(float(avg_mood_all or 0), 1) if avg_mood_all else None,
        "revenue": {
            "total": round(float(revenue_total or 0), 2),
            "month": round(float(revenue_month or 0), 2),
            "mrr": round(float(revenue_month or 0), 2),
        },
        "subscriptions": {
            "active": active_subs,
            "trials": trial_subs,
            "canceled": canceled_subs,
            "expiring_7d": expiring_7d,
        },
        "payments": {
            "total": payments_total,
            "succeeded": payments_succeeded,
            "failed": payments_failed,
        },
        "ai": {
            "requests_7d": ai_requests_7d,
            "errors_7d": ai_errors_7d,
        },
        "techniques": technique_distribution,
        "mood_trend": mood_trend,
        "exercises": exercise_stats,
    }


# ── GET /admin/analytics (time-series + retention) ───────────────────────────

@router.get("/analytics")
async def admin_analytics(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(30, ge=7, le=90),
):
    now = utcnow()
    days_list = _date_range(days)

    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    premium_users = (
        await db.execute(select(func.count(User.id)).where(User.is_premium))
    ).scalar() or 0
    total_sessions = (await db.execute(select(func.count(Session.id)))).scalar() or 0
    total_messages = (await db.execute(select(func.count(Message.id)))).scalar() or 0

    new_by_day = await _new_users_by_day(db, days)
    sess_by_day = await _sessions_by_day(db, days)
    msg_by_day = await _messages_by_day(db, days)
    mood_by_day = await _mood_by_day(db, days)
    pay_by_day = await _payments_by_day(db, days)
    sub_by_day = await _active_subscription_days(db, days)

    base_users = total_users - sum(new_by_day.values())
    users_series = []
    cum_users = base_users
    for day in days_list:
        day_new = new_by_day.get(day, 0)
        cum_users += day_new
        users_series.append({"date": str(day), "total": cum_users, "new": day_new})

    premium_series = [{"date": str(day), "total": sub_by_day.get(day, 0)} for day in days_list]
    revenue_series = [{"date": str(day), "amount": pay_by_day.get(day, 0.0)} for day in days_list]
    sessions_series = [{"date": str(day), "count": sess_by_day.get(day, 0)} for day in days_list]
    messages_series = [{"date": str(day), "count": msg_by_day.get(day, 0)} for day in days_list]
    mood_series = [
        {
            "date": str(day),
            "avg": mood_by_day.get(day, (0, 0))[0],
            "count": mood_by_day.get(day, (0, 0))[1],
        }
        for day in days_list
    ]

    growth_series = [{"date": str(day), "new": new_by_day.get(day, 0)} for day in days_list]

    # AI usage time-series.
    ai_since = now - timedelta(days=days)
    ai_rows = (
        await db.execute(
            select(
                func.date(AIUsageLog.created_at).label("day"),
                func.count(AIUsageLog.id),
                func.sum(text("CASE WHEN ai_usage_logs.status='error' THEN 1 ELSE 0 END")),
                func.avg(AIUsageLog.latency_ms),
            )
            .where(AIUsageLog.created_at >= ai_since)
            .group_by(text("day"))
        )
    ).all()
    ai_map = {
        r.day: (r.count, int(r.sum or 0), round(float(r.avg or 0), 1))
        for r in ai_rows
    }
    ai_series = [
        {"date": str(day), "requests": ai_map.get(day, (0, 0, 0))[0],
         "errors": ai_map.get(day, (0, 0, 0))[1],
         "avg_latency": ai_map.get(day, (0, 0, 0))[2]}
        for day in days_list
    ]

    return {
        "overview": {
            "total_users": total_users,
            "premium_users": premium_users,
            "conversion_rate": round(premium_users / total_users * 100, 1) if total_users else 0,
            "total_sessions": total_sessions,
            "total_messages": total_messages,
        },
        "series": {
            "users": users_series,
            "growth": growth_series,
            "premium": premium_series,
            "revenue": revenue_series,
            "sessions": sessions_series,
            "messages": messages_series,
            "mood": mood_series,
            "techniques": await _techniques(db, days),
            "ai": ai_series,
        },
        "retention": await _retention(db),
    }
