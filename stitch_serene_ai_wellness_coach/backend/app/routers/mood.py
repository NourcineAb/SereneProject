from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_user
from ..models import MoodLog, User
from ..schemas import MoodIn, MoodOut

router = APIRouter(prefix="/mood", tags=["mood"])


@router.post("", response_model=MoodOut, status_code=201)
async def log_mood(body: MoodIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    entry = MoodLog(user_id=user.id, score=body.score, label=body.label, note=body.note)
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.get("", response_model=list[MoodOut])
async def mood_history(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(MoodLog).where(MoodLog.user_id == user.id).order_by(MoodLog.created_at.desc()).limit(60)
    )).scalars().all()
    return rows
