"""Premium toggle — DEV ONLY mock.

In production `is_premium` is driven solely by the verified RevenueCat webhook
(`/webhooks/revenuecat`). This client-callable endpoint exists only so the Expo Go /
web mock flow works without a paid dev build, and is hard-disabled in production via
`ALLOW_MOCK_BILLING` (see security finding C2)."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import UserOut

router = APIRouter(prefix="/billing", tags=["billing"])


class PremiumIn(BaseModel):
    is_premium: bool = True


@router.post("/premium", response_model=UserOut)
async def set_premium(body: PremiumIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not settings.allow_mock_billing:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Mock billing is disabled. Premium is granted only via the payment webhook.",
        )
    user.is_premium = body.is_premium
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
