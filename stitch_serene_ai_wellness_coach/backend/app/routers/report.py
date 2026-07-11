from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_user
from ..models import JournalEntry, MoodLog, Session, User, Message
from ..services import progress as prog

router = APIRouter(prefix="/report", tags=["report"])

WEEKDAY_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MOOD_LABELS = ["Calme", "Joyeux", "Neutre", "Anxieux", "Fatigu\u00e9"]
MOOD_KEYS = ["calme", "joyeux", "neutre", "anxieux", "fatigu\u00e9"]
TECHNIQUES = [
    "box_breathing",
    "grounding_54321",
    "pmr",
    "reframing",
    "meditation",
    "journaling",
]


def _week_bounds(now: datetime) -> tuple[datetime, datetime]:
    monday = now.date() - timedelta(days=now.weekday())
    start = datetime(monday.year, monday.month, monday.day, tzinfo=timezone.utc)
    end = start + timedelta(days=7)
    return start, end


@router.get("/weekly")
async def weekly_report(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    start, end = _week_bounds(now)

    # ── Avg mood ───────────────────────────────────────────────────────
    avg_mood = await prog.avg_mood(db, user.id, days=7)

    # ── Total sessions ────────────────────────────────────────────────
    total_sessions = await prog.sessions_this_week(db, user.id, now)

    # ── Streak ────────────────────────────────────────────────────────
    streak_days = await prog.current_streak(db, user.id)

    # ── Mood distribution ─────────────────────────────────────────────
    mood_rows = (
        await db.execute(
            select(MoodLog.label, func.count(MoodLog.id)).where(
                MoodLog.user_id == user.id,
                MoodLog.created_at >= start,
                MoodLog.created_at < end,
            ).group_by(MoodLog.label)
        )
    ).all()
    mood_dist: dict[str, int] = {k: 0 for k in MOOD_KEYS}
    for label, cnt in mood_rows:
        normalised = label.strip().lower()
        for i, ref in enumerate(MOOD_LABELS):
            if normalised == ref.lower():
                mood_dist[MOOD_KEYS[i]] = cnt
                break

    # ── Sessions per day (Mon–Sun) ────────────────────────────────────
    session_rows = (
        await db.execute(
            select(func.date(Session.created_at), func.count(Session.id)).where(
                Session.user_id == user.id,
                Session.created_at >= start,
                Session.created_at < end,
            ).group_by(func.date(Session.created_at))
        )
    ).all()
    sessions_map: dict[int, int] = {}
    for d, cnt in session_rows:
        if isinstance(d, datetime):
            d = d.date()
        wd = d.weekday()  # 0=Mon
        sessions_map[wd] = cnt
    sessions_per_day = [sessions_map.get(i, 0) for i in range(7)]

    # ── Technique usage ───────────────────────────────────────────────
    tech_rows = (
        await db.execute(
            select(Message.technique, func.count(Message.id))
            .join(Session, Message.session_id == Session.id)
            .where(
                Session.user_id == user.id,
                Session.created_at >= start,
                Session.created_at < end,
                Message.technique.isnot(None),
                Message.role == "assistant",
            )
            .group_by(Message.technique)
        )
    ).all()
    technique_usage: dict[str, int] = {t: 0 for t in TECHNIQUES}
    most_used_technique: str | None = None
    max_tech_count = 0
    for tech, cnt in tech_rows:
        normalised = tech.strip().lower().replace("-", "_").replace(" ", "_")
        if normalised in technique_usage:
            technique_usage[normalised] = cnt
        else:
            technique_usage[normalised] = cnt
        if cnt > max_tech_count:
            max_tech_count = cnt
            most_used_technique = normalised

    # ── Insights ──────────────────────────────────────────────────────
    trend = await prog.mood_trend(db, user.id, days=7)
    non_zero = [v for v in trend if v > 0]

    if len(non_zero) >= 2:
        first_half = non_zero[: len(non_zero) // 2]
        second_half = non_zero[len(non_zero) // 2 :]
        avg_first = sum(first_half) / len(first_half) if first_half else 0
        avg_second = sum(second_half) / len(second_half) if second_half else 0
        diff = avg_second - avg_first
        if diff > 0.5:
            mood_trend = "improved"
        elif diff < -0.5:
            mood_trend = "declined"
        else:
            mood_trend = "stable"
    else:
        mood_trend = "stable"

    # Best day: the weekday with the highest total mood score
    mood_per_weekday: dict[int, list[int]] = {i: [] for i in range(7)}
    mood_log_rows = (
        await db.execute(
            select(MoodLog.score, MoodLog.created_at).where(
                MoodLog.user_id == user.id,
                MoodLog.created_at >= start,
                MoodLog.created_at < end,
            )
        )
    ).all()
    for score, ts in mood_log_rows:
        d = ts.date() if isinstance(ts, datetime) else ts
        wd = d.weekday()
        mood_per_weekday[wd].append(score)

    best_day_idx = 0
    best_avg = 0.0
    for wd, scores in mood_per_weekday.items():
        if scores:
            avg = sum(scores) / len(scores)
            if avg > best_avg:
                best_avg = avg
                best_day_idx = wd
    best_day = WEEKDAY_FR[best_day_idx]

    # Recommendation
    if avg_mood >= 7:
        recommendation = (
            "Votre humeur est au top cette semaine ! Continuez les sessions de "
            "respiration pour maintenir cet equilibre."
        )
    elif avg_mood >= 5:
        recommendation = (
            "Vous etes sur la bonne voie. Essayez d'ajouter une session de "
            "respiration le matin pour ameliorer votre energie."
        )
    else:
        recommendation = (
            "Cette semaine a ete difficile. Une petite session d'ancrage "
            "quotidienne peut vous aider a retrouver votre calme."
        )

    # ── Most used technique label ─────────────────────────────────────
    most_used_label: str | None = None
    if most_used_technique:
        label_map = {
            "box_breathing": "Respiration carree",
            "grounding_54321": "Ancrage 5-4-3-2-1",
            "pmr": "Relaxation musculaire",
            "reframing": "Reformulation cognitive",
            "meditation": "Meditation",
            "journaling": "Journaling",
        }
        most_used_label = label_map.get(most_used_technique, most_used_technique)

    return {
        "avg_mood": round(avg_mood, 1),
        "total_sessions": total_sessions,
        "most_used_technique": most_used_label,
        "streak_days": streak_days,
        "mood_distribution": mood_dist,
        "sessions_per_day": sessions_per_day,
        "technique_usage": technique_usage,
        "insights": {
            "mood_trend": mood_trend,
            "best_day": best_day,
            "recommendation": recommendation,
        },
    }


def _month_bounds(now: datetime) -> tuple[datetime, datetime]:
    start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    if now.month == 12:
        end = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    return start, end


@router.get("/monthly")
async def monthly_report(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    start, end = _month_bounds(now)

    # ── Avg mood ───────────────────────────────────────────────────────
    avg_mood_stmt = select(func.avg(MoodLog.score)).where(
        MoodLog.user_id == user.id,
        MoodLog.created_at >= start,
        MoodLog.created_at < end,
    )
    avg_mood_val = (await db.execute(avg_mood_stmt)).scalar()
    avg_mood = round(float(avg_mood_val), 1) if avg_mood_val is not None else 0.0

    # ── Total sessions ────────────────────────────────────────────────
    total_sessions_stmt = select(func.count(Session.id)).where(
        Session.user_id == user.id,
        Session.created_at >= start,
        Session.created_at < end,
    )
    total_sessions = int((await db.execute(total_sessions_stmt)).scalar() or 0)

    # ── Total journal entries ─────────────────────────────────────────
    journal_stmt = select(func.count(JournalEntry.id)).where(
        JournalEntry.user_id == user.id,
        JournalEntry.created_at >= start,
        JournalEntry.created_at < end,
    )
    total_journal_entries = int((await db.execute(journal_stmt)).scalar() or 0)

    # ── Mood distribution ─────────────────────────────────────────────
    mood_rows = (
        await db.execute(
            select(MoodLog.label, func.count(MoodLog.id)).where(
                MoodLog.user_id == user.id,
                MoodLog.created_at >= start,
                MoodLog.created_at < end,
            ).group_by(MoodLog.label)
        )
    ).all()
    mood_dist: dict[str, int] = {k: 0 for k in MOOD_KEYS}
    for label, cnt in mood_rows:
        normalised = label.strip().lower()
        for i, ref in enumerate(MOOD_LABELS):
            if normalised == ref.lower():
                mood_dist[MOOD_KEYS[i]] = cnt
                break

    # ── Sessions per week (4–5 weeks) ─────────────────────────────────
    sessions_per_week: list[int] = []
    cursor_date = start.date()
    while cursor_date < end.date():
        week_start_dt = datetime(cursor_date.year, cursor_date.month, cursor_date.day, tzinfo=timezone.utc)
        week_end_dt = week_start_dt + timedelta(days=7)
        if week_end_dt > end:
            week_end_dt = end
        week_count_stmt = select(func.count(Session.id)).where(
            Session.user_id == user.id,
            Session.created_at >= week_start_dt,
            Session.created_at < week_end_dt,
        )
        week_count = int((await db.execute(week_count_stmt)).scalar() or 0)
        sessions_per_week.append(week_count)
        cursor_date += timedelta(days=7)

    # ── Top techniques (top 3) ────────────────────────────────────────
    tech_rows = (
        await db.execute(
            select(Message.technique, func.count(Message.id))
            .join(Session, Message.session_id == Session.id)
            .where(
                Session.user_id == user.id,
                Session.created_at >= start,
                Session.created_at < end,
                Message.technique.isnot(None),
                Message.role == "assistant",
            )
            .group_by(Message.technique)
            .order_by(func.count(Message.id).desc())
            .limit(3)
        )
    ).all()
    top_techniques = [
        {"name": tech.strip().lower().replace("-", "_").replace(" ", "_"), "count": cnt}
        for tech, cnt in tech_rows
    ]

    # ── Streak record (current) ───────────────────────────────────────
    streak_record = await prog.current_streak(db, user.id)

    # ── Improvements (current month vs previous month) ─────────────────
    if now.month == 1:
        prev_start = datetime(now.year - 1, 12, 1, tzinfo=timezone.utc)
        prev_end = datetime(now.year, 1, 1, tzinfo=timezone.utc)
    else:
        prev_start = datetime(now.year, now.month - 1, 1, tzinfo=timezone.utc)
        prev_end = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

    prev_avg_stmt = select(func.avg(MoodLog.score)).where(
        MoodLog.user_id == user.id,
        MoodLog.created_at >= prev_start,
        MoodLog.created_at < prev_end,
    )
    prev_avg = (await db.execute(prev_avg_stmt)).scalar()

    prev_sessions_stmt = select(func.count(Session.id)).where(
        Session.user_id == user.id,
        Session.created_at >= prev_start,
        Session.created_at < prev_end,
    )
    prev_sessions = int((await db.execute(prev_sessions_stmt)).scalar() or 0)

    mood_change_pct = 0
    if prev_avg and float(prev_avg) > 0:
        mood_change_pct = int(round((avg_mood - float(prev_avg)) / float(prev_avg) * 100))

    sessions_change_pct = 0
    if prev_sessions > 0:
        sessions_change_pct = int(round((total_sessions - prev_sessions) / prev_sessions * 100))

    # ── AI summary ─────────────────────────────────────────────────────
    month_label = f"{now.year}-{now.month:02d}"
    ai_summary = (
        f"Ce mois-ci ({month_label}), vous avez complété {total_sessions} session{'s' if total_sessions != 1 else ''} "
        f"et votre humeur moyenne était {avg_mood}/10."
    )
    if streak_record > 0:
        ai_summary += f" Votre meilleure série a été de {streak_record} jour{'s' if streak_record != 1 else ''}."
    if mood_change_pct > 0:
        ai_summary += " Votre humeur s'est améliorée par rapport au mois dernier."
    elif mood_change_pct < 0:
        ai_summary += " Continuez, chaque petit pas compte."

    return {
        "avg_mood": avg_mood,
        "total_sessions": total_sessions,
        "total_journal_entries": total_journal_entries,
        "mood_distribution": mood_dist,
        "sessions_per_week": sessions_per_week,
        "top_techniques": top_techniques,
        "streak_record": streak_record,
        "improvements": {
            "mood_change_pct": mood_change_pct,
            "sessions_change_pct": sessions_change_pct,
        },
        "ai_summary": ai_summary,
    }
