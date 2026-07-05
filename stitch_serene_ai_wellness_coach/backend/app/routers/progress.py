from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import ProgressOut
from ..services import progress as prog

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("", response_model=ProgressOut)
async def get_progress(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return ProgressOut(
        streak_days=await prog.current_streak(db, user.id),
        sessions_this_week=await prog.sessions_this_week(db, user.id),
        sessions_limit=settings.free_sessions_per_week,
        avg_mood=await prog.avg_mood(db, user.id),
        mood_trend=await prog.mood_trend(db, user.id),
        anxiety_change_pct=await prog.anxiety_change_pct(db, user.id),
        is_premium=user.is_premium,
    )
