"""Client-facing feedback — stores real user feedback for the backoffice."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..limiter import limiter
from ..models import Feedback, User

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackIn(BaseModel):
    category: str = Field(default="feedback", pattern="^(feedback|suggestion|bug)$")
    content: str = Field(min_length=1, max_length=4000)


@router.post("", status_code=201)
@limiter.limit(settings.rate_limit_chat, exempt_when=lambda: not settings.rate_limit_enabled)
async def submit_feedback(
    request: Request,
    body: FeedbackIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.content.strip():
        raise HTTPException(422, "Feedback content is required")
    item = Feedback(user_id=user.id, category=body.category, content=body.content.strip())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {"id": item.id, "status": item.status}
