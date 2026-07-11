from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_user
from ..models import JournalEntry, User
from ..schemas import JournalEntryIn, JournalEntryOut, WeeklySummaryOut

router = APIRouter(prefix="/journal", tags=["journal"])


@router.post("", response_model=JournalEntryOut, status_code=201)
async def create_entry(
    body: JournalEntryIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entry = JournalEntry(
        user_id=user.id,
        mood_score=body.mood_score,
        content=body.content,
        technique=body.technique,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.get("", response_model=list[JournalEntryOut])
async def list_entries(
    date: str | None = Query(None, description="Filter by date YYYY-MM-DD"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(JournalEntry).where(JournalEntry.user_id == user.id)

    if date:
        try:
            day_start = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD.")
        day_end = day_start + timedelta(days=1)
        stmt = stmt.where(
            JournalEntry.created_at >= day_start,
            JournalEntry.created_at < day_end,
        )

    stmt = stmt.order_by(JournalEntry.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return rows


@router.get("/weekly-summary", response_model=WeeklySummaryOut)
async def weekly_summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    rows = (
        await db.execute(
            select(JournalEntry)
            .where(JournalEntry.user_id == user.id, JournalEntry.created_at >= week_ago)
            .order_by(JournalEntry.created_at.desc())
        )
    ).scalars().all()

    avg_score = 0.0
    technique_counts: dict[str, int] = {}
    entries_by_day: dict[str, int] = {}

    if rows:
        scores = [r.mood_score for r in rows]
        avg_score = sum(scores) / len(scores)

        for r in rows:
            if r.technique:
                technique_counts[r.technique] = technique_counts.get(r.technique, 0) + 1

            day_key = r.created_at.strftime("%Y-%m-%d")
            entries_by_day[day_key] = entries_by_day.get(day_key, 0) + 1

    most_used_technique = max(technique_counts, key=technique_counts.get) if technique_counts else None

    return WeeklySummaryOut(
        total_entries=len(rows),
        average_mood=round(avg_score, 1),
        most_used_technique=most_used_technique,
        entries_by_day=entries_by_day,
    )


@router.get("/export")
async def export_entries(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(JournalEntry)
            .where(JournalEntry.user_id == user.id)
            .order_by(JournalEntry.created_at.desc())
        )
    ).scalars().all()

    return [
        {
            "id": r.id,
            "mood_score": r.mood_score,
            "content": r.content,
            "technique": r.technique,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]
