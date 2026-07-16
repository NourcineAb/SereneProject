from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_user
from ..models import Challenge, Session, User, UserChallenge
from ..schemas import ChallengeOut, CommunityStatsOut, UserChallengeOut

router = APIRouter(prefix="/community", tags=["community"])


async def _build_user_challenge_out(db: AsyncSession, uc: UserChallenge) -> UserChallengeOut:
    challenge = (
        await db.execute(select(Challenge).where(Challenge.id == uc.challenge_id))
    ).scalar_one_or_none()
    ch_out = None
    if challenge:
        participant_count = (
            await db.execute(
                select(func.count(UserChallenge.id)).where(UserChallenge.challenge_id == challenge.id)
            )
        ).scalar_one()
        ch_out = ChallengeOut(
            id=challenge.id,
            title=challenge.title,
            description=challenge.description,
            duration_days=challenge.duration_days,
            target_sessions=challenge.target_sessions,
            target_streak=challenge.target_streak,
            created_at=challenge.created_at,
            participant_count=participant_count,
        )
    return UserChallengeOut(
        id=uc.id,
        challenge_id=uc.challenge_id,
        started_at=uc.started_at,
        completed=uc.completed,
        completed_at=uc.completed_at,
        current_sessions=uc.current_sessions,
        current_streak=uc.current_streak,
        challenge=ch_out,
    )


async def _seed_challenges(db: AsyncSession) -> None:
    """Insert default challenges if the table is empty."""
    count = (await db.execute(select(func.count(Challenge.id)))).scalar_one()
    if count > 0:
        return

    defaults = [
        Challenge(
            title="Défi 7 jours",
            description="Complétez 1 session par jour pendant 7 jours consécutifs.",
            duration_days=7,
            target_sessions=7,
            target_streak=7,
        ),
        Challenge(
            title="Marathon d'humeur",
            description="Enregistrez votre humeur chaque jour pendant 14 jours.",
            duration_days=14,
            target_sessions=14,
            target_streak=14,
        ),
        Challenge(
            title="Explorateur complet",
            description="Essayez toutes les 5 techniques de bien-être.",
            duration_days=30,
            target_sessions=5,
            target_streak=0,
        ),
        Challenge(
            title="Zen master",
            description="Complétez 30 sessions au total.",
            duration_days=60,
            target_sessions=30,
            target_streak=0,
        ),
        Challenge(
            title="Streak challenge",
            description="Maintenez une série de 21 jours consécutifs.",
            duration_days=21,
            target_sessions=21,
            target_streak=21,
        ),
    ]
    db.add_all(defaults)
    await db.commit()


@router.get("/challenges", response_model=list[ChallengeOut])
async def list_challenges(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _seed_challenges(db)

    rows = (await db.execute(select(Challenge).order_by(Challenge.id))).scalars().all()
    result: list[ChallengeOut] = []
    for ch in rows:
        participant_count = (
            await db.execute(
                select(func.count(UserChallenge.id)).where(UserChallenge.challenge_id == ch.id)
            )
        ).scalar_one()
        result.append(
            ChallengeOut(
                id=ch.id,
                title=ch.title,
                description=ch.description,
                duration_days=ch.duration_days,
                target_sessions=ch.target_sessions,
                target_streak=ch.target_streak,
                created_at=ch.created_at,
                participant_count=participant_count,
            )
        )
    return result


@router.post("/challenges/{challenge_id}/join", response_model=UserChallengeOut, status_code=201)
async def join_challenge(
    challenge_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    challenge = (
        await db.execute(select(Challenge).where(Challenge.id == challenge_id))
    ).scalar_one_or_none()
    if not challenge:
        raise HTTPException(404, "Challenge not found")

    existing = (
        await db.execute(
            select(UserChallenge).where(
                UserChallenge.user_id == user.id,
                UserChallenge.challenge_id == challenge_id,
                UserChallenge.completed == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Already joined this challenge")

    uc = UserChallenge(user_id=user.id, challenge_id=challenge_id)
    db.add(uc)
    await db.commit()
    await db.refresh(uc)
    return await _build_user_challenge_out(db, uc)


@router.post("/challenges/{challenge_id}/leave", status_code=204)
async def leave_challenge(
    challenge_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uc = (
        await db.execute(
            select(UserChallenge).where(
                UserChallenge.user_id == user.id,
                UserChallenge.challenge_id == challenge_id,
                UserChallenge.completed == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not uc:
        raise HTTPException(404, "Active challenge participation not found")
    await db.delete(uc)
    await db.commit()


@router.get("/challenges/my", response_model=list[UserChallengeOut])
async def my_challenges(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(UserChallenge)
            .where(UserChallenge.user_id == user.id, UserChallenge.completed == False)  # noqa: E712
            .order_by(UserChallenge.started_at.desc())
        )
    ).scalars().all()

    result: list[UserChallengeOut] = []
    for uc in rows:
        result.append(await _build_user_challenge_out(db, uc))
    return result


@router.get("/stats", response_model=CommunityStatsOut)
async def community_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommunityStatsOut:
    """Aggregated, anonymised community statistics shown on the community screen."""
    active_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    total_sessions = (await db.execute(select(func.count(Session.id)))).scalar_one()
    # Approximate "shared calm hours": ~6 minutes of coaching per session.
    calm_hours = int(total_sessions * 6 / 60)
    return CommunityStatsOut(
        active_users=active_users,
        total_sessions=total_sessions,
        calm_hours=calm_hours,
    )


@router.post("/challenges/{challenge_id}/progress", response_model=UserChallengeOut)
async def update_progress(
    challenge_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uc = (
        await db.execute(
            select(UserChallenge).where(
                UserChallenge.user_id == user.id,
                UserChallenge.challenge_id == challenge_id,
                UserChallenge.completed == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not uc:
        raise HTTPException(404, "Active challenge participation not found")

    challenge = (
        await db.execute(select(Challenge).where(Challenge.id == challenge_id))
    ).scalar_one_or_none()
    if not challenge:
        raise HTTPException(404, "Challenge not found")

    uc.current_sessions += 1

    today = datetime.now(timezone.utc).date()
    yesterday = today - timedelta(days=1)
    last_session_date = (await db.execute(
        select(Session.created_at)
        .where(Session.user_id == user.id)
        .order_by(Session.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()

    if last_session_date:
        last_date = last_session_date.date() if last_session_date.tzinfo else last_session_date
        if last_date == yesterday:
            uc.current_streak += 1
        elif last_date != today:
            uc.current_streak = 1
    else:
        uc.current_streak = 1

    completed = False
    if challenge.target_sessions > 0 and uc.current_sessions >= challenge.target_sessions:
        completed = True
    if challenge.target_streak > 0 and uc.current_streak >= challenge.target_streak:
        completed = True

    if completed:
        uc.completed = True
        uc.completed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(uc)
    return await _build_user_challenge_out(db, uc)
