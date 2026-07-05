"""Streak / weekly-session / mood-trend computations shared by the coach
prompt injection and the dashboard endpoint."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import MoodLog, Session


def _week_start(now: datetime) -> datetime:
    monday = now.date() - timedelta(days=now.weekday())
    return datetime(monday.year, monday.month, monday.day, tzinfo=timezone.utc)


async def sessions_this_week(db: AsyncSession, user_id: int, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    start = _week_start(now)
    stmt = select(func.count(Session.id)).where(
        Session.user_id == user_id, Session.created_at >= start
    )
    return int((await db.execute(stmt)).scalar() or 0)


async def current_streak(db: AsyncSession, user_id: int) -> int:
    """Consecutive days (ending today or yesterday) with at least one session OR mood log."""
    sess_dates = (await db.execute(
        select(func.date(Session.created_at)).where(Session.user_id == user_id)
    )).scalars().all()
    mood_dates = (await db.execute(
        select(func.date(MoodLog.created_at)).where(MoodLog.user_id == user_id)
    )).scalars().all()

    days: set[date] = set()
    for d in [*sess_dates, *mood_dates]:
        if isinstance(d, datetime):
            d = d.date()
        if isinstance(d, date):
            days.add(d)
    if not days:
        return 0

    today = datetime.now(timezone.utc).date()
    cursor = today if today in days else today - timedelta(days=1)
    if cursor not in days:
        return 0
    streak = 0
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


async def last_mood_score(db: AsyncSession, user_id: int) -> int:
    stmt = (
        select(MoodLog.score)
        .where(MoodLog.user_id == user_id)
        .order_by(MoodLog.created_at.desc())
        .limit(1)
    )
    return int((await db.execute(stmt)).scalar() or 0)


async def avg_mood(db: AsyncSession, user_id: int, days: int = 7) -> float:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    stmt = select(func.avg(MoodLog.score)).where(
        MoodLog.user_id == user_id, MoodLog.created_at >= since
    )
    val = (await db.execute(stmt)).scalar()
    return round(float(val), 1) if val is not None else 0.0


async def mood_trend(db: AsyncSession, user_id: int, days: int = 7) -> list[int]:
    """One value per day for the last `days` days (0 = no entry that day)."""
    today = datetime.now(timezone.utc).date()
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (await db.execute(
        select(MoodLog.score, MoodLog.created_at).where(
            MoodLog.user_id == user_id, MoodLog.created_at >= since
        )
    )).all()
    by_day: dict[date, list[int]] = {}
    for score, ts in rows:
        d = ts.date() if isinstance(ts, datetime) else ts
        by_day.setdefault(d, []).append(score)
    trend = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        vals = by_day.get(d, [])
        trend.append(round(sum(vals) / len(vals)) if vals else 0)
    return trend


async def anxiety_change_pct(db: AsyncSession, user_id: int) -> int:
    """Compare avg mood of last 7 days vs the 7 days before. Higher mood = lower
    anxiety, so we return the *anxiety* delta (negative = improvement)."""
    now = datetime.now(timezone.utc)
    this_week = await avg_mood(db, user_id, 7)

    prev_start = now - timedelta(days=14)
    prev_end = now - timedelta(days=7)
    stmt = select(func.avg(MoodLog.score)).where(
        MoodLog.user_id == user_id,
        MoodLog.created_at >= prev_start,
        MoodLog.created_at < prev_end,
    )
    prev = (await db.execute(stmt)).scalar()
    if not prev or not this_week:
        return 0
    mood_change = (this_week - float(prev)) / float(prev) * 100
    return int(round(-mood_change))  # invert: mood up => anxiety down
