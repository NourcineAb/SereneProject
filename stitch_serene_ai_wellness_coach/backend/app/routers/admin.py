"""Admin backoffice — enhanced API + self-contained HTML panel."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import get_db
from ..deps import get_current_admin_user
from ..models import Challenge, ExerciseCompletion, Message, MoodLog, Session, User
from ..schemas import UserOut
from ..security import create_access_token, decode_token, verify_password

router = APIRouter(prefix="/admin", tags=["admin"])

_technique_labels = {
    "box_breathing": "Respiration carr\u00e9e",
    "grounding_54321": "Ancrage 5-4-3-2-1",
    "cognitive_reframing": "Reformulation cognitive",
    "pmr": "Relaxation musculaire",
    "journaling": "Journaling",
}


# ── API: dashboard stats ───────────────────────────────────────────────────

@router.get("/stats")
async def admin_stats(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    premium_users = (
        await db.execute(select(func.count(User.id)).where(User.is_premium))
    ).scalar() or 0
    new_users_7d = (
        await db.execute(
            select(func.count(User.id)).where(User.created_at >= week_ago)
        )
    ).scalar() or 0
    active_users_7d = (
        await db.execute(
            select(func.count(func.distinct(Session.user_id))).where(
                Session.created_at >= week_ago
            )
        )
    ).scalar() or 0

    total_sessions = (await db.execute(select(func.count(Session.id)))).scalar() or 0
    sessions_7d = (
        await db.execute(
            select(func.count(Session.id)).where(Session.created_at >= week_ago)
        )
    ).scalar() or 0
    total_messages = (await db.execute(select(func.count(Message.id)))).scalar() or 0
    messages_7d = (
        await db.execute(
            select(func.count(Message.id)).where(Message.created_at >= week_ago)
        )
    ).scalar() or 0
    total_mood_logs = (await db.execute(select(func.count(MoodLog.id)))).scalar() or 0
    mood_logs_7d = (
        await db.execute(
            select(func.count(MoodLog.id)).where(MoodLog.created_at >= week_ago)
        )
    ).scalar() or 0

    technique_rows = (
        await db.execute(
            select(Message.technique, func.count(Message.id))
            .where(
                and_(
                    Message.technique.isnot(None),
                    Message.technique != "",
                    Message.created_at >= week_ago,
                )
            )
            .group_by(Message.technique)
            .order_by(func.count(Message.id).desc())
        )
    ).all()
    technique_distribution = {
        _technique_labels.get(t, t or "unknown"): c for t, c in technique_rows
    }

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

    total_exercises_7d = sum(exercise_stats.values())

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
            "exercises": total_exercises_7d,
            "conversion_rate": (
                round(premium_users / total_users * 100, 1) if total_users else 0
            ),
        },
        "techniques": technique_distribution,
        "mood_trend": mood_trend,
        "exercises": exercise_stats,
    }


# ── API: user management ───────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    q: str = Query("", description="Search by email or name"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    offset = (page - 1) * per_page

    query = select(User)
    count_query = select(func.count(User.id))
    if q:
        like = f"%{q}%"
        condition = or_(User.email.ilike(like), User.name.ilike(like))
        query = query.where(condition)
        count_query = count_query.where(condition)

    total = (await db.execute(count_query)).scalar() or 0
    users = (
        (
            await db.execute(
                query.order_by(User.created_at.desc()).offset(offset).limit(per_page)
            )
        )
        .scalars()
        .all()
    )

    user_ids = [u.id for u in users]
    session_counts = {}
    if user_ids:
        rows = (
            await db.execute(
                select(Session.user_id, func.count(Session.id))
                .where(Session.user_id.in_(user_ids))
                .group_by(Session.user_id)
            )
        ).all()
        session_counts = {uid: c for uid, c in rows}

    active_user_ids = set()
    if user_ids:
        rows = (
            await db.execute(
                select(func.distinct(Session.user_id)).where(
                    and_(
                        Session.user_id.in_(user_ids),
                        Session.created_at >= week_ago,
                    )
                )
            )
        ).all()
        active_user_ids = {r[0] for r in rows}

    return {
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "name": u.name,
                "is_premium": u.is_premium,
                "is_admin": u.is_admin,
                "email_verified": u.email_verified,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "session_count": session_counts.get(u.id, 0),
                "is_active_7d": u.id in active_user_ids,
            }
            for u in users
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),
    }


@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    sessions = (
        (
            await db.execute(
                select(Session)
                .where(Session.user_id == user_id)
                .order_by(Session.created_at.desc())
            )
        )
        .scalars()
        .all()
    )

    mood_logs = (
        (
            await db.execute(
                select(MoodLog)
                .where(MoodLog.user_id == user_id)
                .order_by(MoodLog.created_at.desc())
                .limit(60)
            )
        )
        .scalars()
        .all()
    )

    msg_count = (
        await db.execute(
            select(func.count(Message.id))
            .join(Session, Message.session_id == Session.id)
            .where(Session.user_id == user_id)
        )
    ).scalar() or 0

    sessions_7d = sum(1 for s in sessions if s.created_at and s.created_at >= week_ago)
    messages_7d = (
        await db.execute(
            select(func.count(Message.id))
            .join(Session, Message.session_id == Session.id)
            .where(
                and_(Session.user_id == user_id, Message.created_at >= week_ago)
            )
        )
    ).scalar() or 0

    avg_mood = (
        await db.execute(
            select(func.avg(MoodLog.score)).where(MoodLog.user_id == user_id)
        )
    ).scalar()
    avg_mood_7d = (
        await db.execute(
            select(func.avg(MoodLog.score)).where(
                and_(MoodLog.user_id == user_id, MoodLog.created_at >= week_ago)
            )
        )
    ).scalar()

    exercise_count = (
        await db.execute(
            select(func.count(ExerciseCompletion.id)).where(
                ExerciseCompletion.user_id == user_id
            )
        )
    ).scalar() or 0

    technique_rows = (
        await db.execute(
            select(Message.technique, func.count(Message.id))
            .join(Session, Message.session_id == Session.id)
            .where(
                and_(
                    Session.user_id == user_id,
                    Message.technique.isnot(None),
                    Message.technique != "",
                )
            )
            .group_by(Message.technique)
            .order_by(func.count(Message.id).desc())
        )
    ).all()
    techniques = {_technique_labels.get(t, t or "unknown"): c for t, c in technique_rows}

    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "is_premium": user.is_premium,
            "is_admin": user.is_admin,
            "email_verified": user.email_verified,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "metrics": {
            "total_sessions": len(sessions),
            "sessions_7d": sessions_7d,
            "total_messages": msg_count,
            "messages_7d": messages_7d,
            "total_mood_logs": len(mood_logs),
            "total_exercises": exercise_count,
            "avg_mood": round(float(avg_mood), 1) if avg_mood else None,
            "avg_mood_7d": round(float(avg_mood_7d), 1) if avg_mood_7d else None,
            "techniques": techniques,
        },
        "sessions": [
            {
                "id": s.id,
                "title": s.title,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in sessions
        ],
        "mood_logs": [
            {
                "id": m.id,
                "score": m.score,
                "label": m.label,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in mood_logs
        ],
    }


@router.put("/users/{user_id}/toggle-admin")
async def toggle_admin(
    user_id: int,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.is_admin = not user.is_admin
    await db.commit()
    return {"id": user.id, "is_admin": user.is_admin}


@router.put("/users/{user_id}/toggle-premium")
async def toggle_premium(
    user_id: int,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.is_premium = not user.is_premium
    await db.commit()
    return {"id": user.id, "is_premium": user.is_premium}


# ── API: system health ─────────────────────────────────────────────────────

@router.get("/system")
async def system_health(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    db_ok = True
    db_error = None
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        db_ok = False
        db_error = str(e)

    return {
        "database": {"ok": db_ok, "error": db_error},
        "config": {
            "environment": settings.environment,
            "llm_primary": settings.llm_primary,
            "monetization_mode": settings.monetization_mode,
            "free_sessions_per_week": settings.free_sessions_per_week,
            "rate_limit_enabled": settings.rate_limit_enabled,
            "field_encryption_enabled": bool(settings.field_encryption_key),
        },
    }


# ── Admin login ─────────────────────────────────────────────────────────────

class AdminLoginIn(BaseModel):
    email: EmailStr
    password: str


@router.post("/login")
async def admin_login(body: AdminLoginIn, db: AsyncSession = Depends(get_db)):
    user = (
        await db.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    token = create_access_token(user.email, user.token_version)
    return {"access_token": token, "token_type": "bearer"}


# ── Self-contained HTML panel ───────────────────────────────────────────────

ADMIN_HTML = r"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Serene — Backoffice</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600&family=Quicksand:wght@600;700&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
/* ── Serene Design Tokens (from theme/serene.ts — Minimalisme Doux) ── */
:root{
  /* surfaces */
  --surface:#e8fff1;
  --surface-dim:#c9dfd2;
  --surface-clw:#ffffff;
  --surface-cl:#e2f9eb;
  --surface-c:#ddf3e5;
  --surface-ch:#d7eee0;
  --surface-cht:#d1e8da;
  --surface-v:#d1e8da;
  /* text */
  --on-surface:#0c1f17;
  --on-surface-v:#404943;
  --outline:#707973;
  --outline-v:#bfc9c1;
  /* primary */
  --primary:#0f5238;
  --on-primary:#ffffff;
  --primary-container:#2d6a4f;
  --on-primary-container:#a8e7c5;
  --primary-fixed:#b1f0ce;
  --primary-fixed-dim:#95d4b3;
  /* secondary */
  --secondary:#4e653f;
  --secondary-container:#d0ebbb;
  --on-secondary-container:#546b45;
  /* error */
  --error:#ba1a1a;
  --error-container:#ffdad6;
  --on-error-container:#93000a;
  /* semantic helpers */
  --success:#16a34a;
  --success-bg:rgba(22,163,74,.10);
  --warning:#b45309;
  --warning-bg:rgba(180,83,9,.10);
  --info:#0369a1;
  --info-bg:rgba(3,105,161,.10);
  /* radius — exact match */
  --r-sm:8px;
  --r-base:16px;
  --r-md:24px;
  --r-lg:32px;
  --r-xl:48px;
  --r-full:9999px;
  /* spacing — exact match */
  --sp-unit:8px;
  --sp-gutter:16px;
  --sp-container:24px;
  --sp-section:40px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,Roboto,sans-serif;
  background:var(--surface);
  color:var(--on-surface);
  line-height:1.5;
  min-height:100vh;
}
h1,h2,h3{font-family:'Quicksand',sans-serif}

/* ── Login (mirrors login.tsx) ── */
.login-wrap{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:var(--sp-container)}
.login-box{width:100%;max-width:420px;background:var(--surface-clw);border:1px solid var(--surface-v);border-radius:var(--r-md);padding:40px;box-shadow:0 12px 24px rgba(15,82,56,.12)}
.login-box .brand{display:flex;align-items:center;gap:8px;margin-bottom:var(--sp-section);justify-content:center}
.login-box .brand .leaf{width:48px;height:48px;border-radius:var(--r-full);background:var(--primary-fixed);display:flex;align-items:center;justify-content:center}
.login-box .brand .leaf svg{width:26px;height:26px;fill:var(--primary)}
.login-box .brand h1{font-size:36px;font-weight:700;color:var(--primary)}
.login-box .welcome{font-size:24px;font-weight:600;color:var(--primary);margin-bottom:4px;text-align:center}
.login-box .subtitle{font-size:16px;color:var(--on-surface-v);margin-bottom:var(--sp-section);text-align:center}
.form-group{margin-bottom:14px}
.form-group input{
  width:100%;
  background:var(--surface-clw);
  border:1.5px solid var(--outline-v);
  border-radius:var(--r-full);
  padding:16px 22px;
  font-size:16px;
  font-family:'Plus Jakarta Sans',sans-serif;
  color:var(--on-surface);
  outline:none;
  transition:border-color .2s;
}
.form-group input:focus{border-color:var(--primary)}
.form-group input::placeholder{color:var(--outline)}
.login-error{color:var(--error);font-size:13px;margin-top:12px;text-align:center}
.login-toggle{text-align:center;margin-top:20px;font-size:16px;color:var(--secondary);cursor:pointer}
.login-toggle:hover{text-decoration:underline}

/* ── PillButton (exact match from components/ui.tsx) ── */
.pill{
  display:inline-flex;align-items:center;justify-content:center;
  border-radius:var(--r-full);
  padding:16px 28px;
  border:none;
  font-family:'Plus Jakarta Sans',sans-serif;
  font-size:20px;font-weight:600;
  cursor:pointer;
  transition:transform .15s,opacity .15s;
  width:100%;
}
.pill:active{transform:scale(.97)}
.pill:disabled{opacity:.5}
.pill-primary{background:var(--primary);color:var(--on-primary);box-shadow:0 12px 24px rgba(15,82,56,.12)}
.pill-tonal{background:var(--surface-cht);color:var(--primary)}
.pill-outline{background:transparent;color:var(--primary);border:1.5px solid var(--outline-v)}
.pill-outline:hover{background:var(--surface-cl)}

/* ── Layout ── */
.app{display:none;min-height:100vh}
.sidebar{position:fixed;top:0;left:0;width:260px;height:100vh;background:var(--surface-clw);border-right:1px solid var(--surface-v);display:flex;flex-direction:column;z-index:100;box-shadow:4px 0 24px rgba(15,82,56,.06)}
.sidebar .brand{padding:24px;border-bottom:1px solid var(--surface-ch);display:flex;align-items:center;gap:10px}
.sidebar .brand .leaf{width:36px;height:36px;border-radius:var(--r-full);background:var(--primary-fixed);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sidebar .brand .leaf svg{width:20px;height:20px;fill:var(--primary)}
.sidebar .brand h1{font-size:22px;font-weight:700;color:var(--primary)}
.sidebar nav{flex:1;padding:var(--sp-gutter) 12px}
.sidebar nav a{
  display:flex;align-items:center;gap:12px;
  padding:12px 16px;border-radius:var(--r-base);
  color:var(--on-surface-v);font-size:16px;font-weight:500;
  text-decoration:none;transition:all .15s;
}
.sidebar nav a:hover{background:var(--surface-cl);color:var(--on-surface)}
.sidebar nav a.active{background:var(--primary-fixed);color:var(--primary);font-weight:600}
.sidebar nav a svg{width:22px;height:22px;flex-shrink:0}
.sidebar .foot{padding:16px 24px;border-top:1px solid var(--surface-ch)}

.main{margin-left:260px;padding:var(--sp-section) 40px;min-height:100vh}
.main h2{font-size:26px;font-weight:600;margin-bottom:4px;color:var(--primary)}
.main .subtitle{color:var(--on-surface-v);font-size:16px;margin-bottom:var(--sp-gutter)}

/* ── Stat Cards (mirrors Card component + statCard style) ── */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--sp-gutter);margin-bottom:var(--sp-section)}
.stat-card{
  background:var(--surface-clw);
  border:1px solid var(--surface-v);
  border-radius:var(--r-md);
  padding:var(--sp-gutter);
  display:flex;align-items:center;gap:var(--sp-gutter);
  box-shadow:0 12px 24px rgba(15,82,56,.12);
}
.stat-card .icon-bubble{
  width:48px;height:48px;border-radius:var(--r-full);
  display:flex;align-items:center;justify-content:center;flex-shrink:0;
}
.stat-card .icon-bubble svg{width:22px;height:22px}
.stat-card .info{flex:1;min-width:0}
.stat-card .value{font-size:28px;font-weight:700;color:var(--primary);line-height:1.2}
.stat-card .label{font-size:13px;font-weight:600;letter-spacing:.65px;text-transform:uppercase;color:var(--on-surface-v)}
.stat-card .sub{font-size:13px;color:var(--outline);margin-top:2px}

/* ── Charts ── */
.charts-row{display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-gutter);margin-bottom:var(--sp-section)}
.chart-card{
  background:var(--surface-clw);border:1px solid var(--surface-v);border-radius:var(--r-md);
  padding:20px;box-shadow:0 12px 24px rgba(15,82,56,.12);
}
.chart-card h3{font-size:18px;font-weight:600;margin-bottom:var(--sp-gutter);color:var(--on-surface)}
.chart-card canvas{width:100%!important;max-height:260px}

/* ── Table ── */
.table-wrap{background:var(--surface-clw);border:1px solid var(--surface-v);border-radius:var(--r-md);overflow:hidden;box-shadow:0 12px 24px rgba(15,82,56,.12)}
.table-toolbar{
  display:flex;align-items:center;gap:var(--sp-gutter);
  padding:var(--sp-gutter) 20px;
  border-bottom:1px solid var(--surface-v);
}
.table-toolbar input{
  flex:1;
  background:var(--surface-clw);
  border:1.5px solid var(--outline-v);
  border-radius:var(--r-full);
  padding:12px 22px;
  font-size:16px;
  font-family:'Plus Jakarta Sans',sans-serif;
  color:var(--on-surface);
  outline:none;
  transition:border-color .2s;
}
.table-toolbar input:focus{border-color:var(--primary)}
.table-toolbar input::placeholder{color:var(--outline)}
table{width:100%;border-collapse:collapse}
th{
  text-align:left;padding:12px 20px;
  font-size:12px;font-weight:600;letter-spacing:.65px;
  text-transform:uppercase;color:var(--outline);
  border-bottom:1px solid var(--surface-v);
  background:var(--surface-cl);
}
td{padding:14px 20px;border-bottom:1px solid var(--surface-ch);font-size:14px}
tr:last-child td{border-bottom:none}
tr:hover td{background:var(--surface-cl)}
.badge{
  display:inline-flex;align-items:center;
  padding:4px 14px;border-radius:var(--r-full);
  font-size:12px;font-weight:600;gap:4px;
}
.badge-premium{background:var(--warning-bg);color:var(--warning)}
.badge-free{background:var(--surface-c);color:var(--outline)}
.badge-admin{background:var(--info-bg);color:var(--info)}
.badge-active{background:var(--success-bg);color:var(--success)}
.badge-inactive{background:var(--surface-c);color:var(--outline)}
.badge-verified{background:var(--success-bg);color:var(--success)}
.badge-unverified{background:var(--error-container);color:var(--on-error-container)}

/* ── Buttons ── */
button{cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
.btn{
  display:inline-flex;align-items:center;justify-content:center;
  padding:10px 20px;border:none;border-radius:var(--r-full);
  font-size:13px;font-weight:600;transition:all .15s;
}
.btn:active{transform:scale(.97)}
.btn-primary{background:var(--primary);color:var(--on-primary);box-shadow:0 12px 24px rgba(15,82,56,.12)}
.btn-tonal{background:var(--surface-cht);color:var(--primary)}
.btn-tonal:hover{background:var(--surface-ch)}
.btn-outline{background:transparent;border:1.5px solid var(--outline-v);color:var(--primary)}
.btn-outline:hover{background:var(--surface-cl)}
.btn-danger{background:var(--error-container);color:var(--on-error-container);border:1.5px solid rgba(186,26,26,.2)}
.btn-danger:hover{background:var(--error);color:var(--on-primary)}
.btn-success{background:var(--success-bg);color:var(--success);border:1.5px solid rgba(22,163,74,.2)}
.btn-success:hover{background:var(--success);color:var(--on-primary)}
.btn-sm{padding:8px 16px;font-size:12px}

/* ── Pagination ── */
.pagination{display:flex;align-items:center;justify-content:center;gap:var(--sp-unit);padding:var(--sp-gutter) 20px;border-top:1px solid var(--surface-v)}
.pagination button{
  padding:8px 16px;border:1.5px solid var(--outline-v);border-radius:var(--r-full);
  background:transparent;color:var(--on-surface-v);font-size:13px;font-weight:600;
  cursor:pointer;transition:all .15s;
}
.pagination button:hover:not(:disabled){border-color:var(--primary);color:var(--primary)}
.pagination button:disabled{opacity:.3;cursor:default}
.pagination .page-info{font-size:13px;color:var(--outline)}

/* ── Modal ── */
.modal-overlay{position:fixed;inset:0;background:rgba(12,31,23,.45);z-index:200;display:none;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
.modal-overlay.open{display:flex}
.modal{background:var(--surface-clw);border:1px solid var(--surface-v);border-radius:var(--r-md);width:100%;max-width:720px;max-height:85vh;overflow-y:auto;box-shadow:0 24px 48px rgba(15,82,56,.18)}
.modal-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:20px 24px;border-bottom:1px solid var(--surface-v);
  position:sticky;top:0;background:var(--surface-clw);z-index:1;
}
.modal-header h3{font-size:20px;font-weight:600;color:var(--primary)}
.modal-close{
  width:40px;height:40px;border-radius:var(--r-full);border:none;
  background:var(--surface-c);color:var(--on-surface-v);font-size:20px;
  display:flex;align-items:center;justify-content:center;transition:all .15s;
}
.modal-close:hover{background:var(--surface-ch);color:var(--on-surface)}
.modal-body{padding:24px}
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-gutter);margin-bottom:24px}
.detail-item label{display:block;font-size:12px;color:var(--outline);text-transform:uppercase;letter-spacing:.65px;font-weight:600;margin-bottom:4px}
.detail-item .val{font-size:16px;font-weight:600;color:var(--on-surface)}
.detail-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid var(--surface-v)}

/* ── System ── */
.sys-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-gutter)}
.sys-card{background:var(--surface-clw);border:1px solid var(--surface-v);border-radius:var(--r-md);padding:20px;box-shadow:0 12px 24px rgba(15,82,56,.12)}
.sys-card h3{font-size:18px;font-weight:600;margin-bottom:var(--sp-gutter);color:var(--on-surface)}
.sys-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--surface-ch);font-size:14px}
.sys-row:last-child{border-bottom:none}
.sys-row .key{color:var(--on-surface-v);font-weight:500}
.sys-row .val{font-weight:600;color:var(--on-surface)}
.status-dot{width:10px;height:10px;border-radius:var(--r-full);display:inline-block;margin-right:8px}
.status-dot.ok{background:var(--success)}
.status-dot.err{background:var(--error)}

/* ── Empty ── */
.empty{text-align:center;padding:60px 20px;color:var(--outline)}
.empty p{font-size:16px}

/* ── Spinner ── */
.spinner{display:inline-block;width:28px;height:28px;border:3px solid var(--surface-cht);border-top-color:var(--primary);border-radius:var(--r-full);animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.loading{display:flex;align-items:center;justify-content:center;padding:60px}

/* ── Responsive ── */
@media(max-width:960px){
  .sidebar{display:none}
  .main{margin-left:0;padding:var(--sp-gutter)}
  .charts-row{grid-template-columns:1fr}
  .detail-grid{grid-template-columns:1fr}
  .stats-grid{grid-template-columns:1fr 1fr}
  .sys-grid{grid-template-columns:1fr}
}
@media(max-width:480px){
  .stats-grid{grid-template-columns:1fr}
}
</style>
</head>
<body>

<!-- ════ LOGIN (mirrors login.tsx) ════ -->
<div id="login-view" class="login-wrap">
  <div class="login-box">
    <div class="brand">
      <div class="leaf">
        <svg viewBox="0 0 24 24"><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z"/></svg>
      </div>
      <h1>Serene</h1>
    </div>
    <p class="welcome" id="login-title">Bienvenue</p>
    <p class="subtitle" id="login-sub">Connectez-vous au backoffice</p>
    <form id="login-form">
      <div class="form-group">
        <input type="email" id="email" placeholder="Email" required>
      </div>
      <div class="form-group">
        <input type="password" id="password" placeholder="Mot de passe" required>
      </div>
      <button type="submit" class="pill pill-primary" style="margin-top:8px">Se connecter</button>
      <p id="login-error" class="login-error"></p>
    </form>
  </div>
</div>

<!-- ════ APP ════ -->
<div id="app" class="app">
  <aside class="sidebar">
    <div class="brand">
      <div class="leaf">
        <svg viewBox="0 0 24 24"><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z"/></svg>
      </div>
      <h1>Serene</h1>
    </div>
    <nav>
      <a href="#" class="active" data-tab="dashboard">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
        Dashboard
      </a>
      <a href="#" data-tab="users">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        Utilisateurs
      </a>
      <a href="#" data-tab="system">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
        Syst&egrave;me
      </a>
    </nav>
    <div class="foot">
      <button class="btn btn-outline" style="width:100%" onclick="logout()">D&eacute;connexion</button>
    </div>
  </aside>

  <div class="main">
    <!-- DASHBOARD -->
    <div id="page-dashboard">
      <h2>Dashboard</h2>
      <p class="subtitle">Vue d'ensemble de votre application wellness</p>
      <div id="stats-cards" class="stats-grid"></div>
      <div class="charts-row">
        <div class="chart-card">
          <h3>Tendance d'humeur (7 jours)</h3>
          <canvas id="chart-mood"></canvas>
        </div>
        <div class="chart-card">
          <h3>Techniques utilis&eacute;es (7 jours)</h3>
          <canvas id="chart-tech"></canvas>
        </div>
      </div>
    </div>

    <!-- USERS -->
    <div id="page-users" style="display:none">
      <h2>Utilisateurs</h2>
      <p class="subtitle">G&eacute;rer les comptes et le support</p>
      <div class="table-wrap">
        <div class="table-toolbar">
          <input type="text" id="user-search" placeholder="Rechercher par nom ou email...">
        </div>
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Sessions</th>
              <th>Statut</th>
              <th>Actif 7j</th>
              <th>Inscrit</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="users-tbody"></tbody>
        </table>
        <div class="pagination" id="users-pagination"></div>
      </div>
    </div>

    <!-- SYSTEM -->
    <div id="page-system" style="display:none">
      <h2>Syst&egrave;me</h2>
      <p class="subtitle">&Eacute;tat de l'infrastructure et configuration</p>
      <div id="system-content"></div>
    </div>
  </div>
</div>

<!-- USER DETAIL MODAL -->
<div class="modal-overlay" id="user-modal">
  <div class="modal">
    <div class="modal-header">
      <h3 id="modal-title">D&eacute;tails utilisateur</h3>
      <button class="modal-close" onclick="closeModal()">&times;</button>
    </div>
    <div class="modal-body" id="modal-body"></div>
  </div>
</div>

<script>
const API = window.location.origin;
let token = localStorage.getItem('admin_token');
let charts = {};
let currentPage = 1;
let searchTimeout = null;

/* ── Serene color constants for charts ── */
const C = {
  primary:'#0f5238', primaryFixed:'#b1f0ce', secondary:'#4e653f',
  secondaryContainer:'#d0ebbb', outline:'#707973', surface:'#e8fff1',
  onSurface:'#0c1f17', onSurfaceV:'#404943', success:'#16a34a',
  warning:'#b45309', error:'#ba1a1a'
};

function authHeaders(){return{'Authorization':'Bearer '+token,'Content-Type':'application/json'}}
async function apiFetch(path,opts={}){
  const r = await fetch(API+path,{...opts,headers:{...authHeaders(),...(opts.headers||{})}});
  if(r.status===401){logout();throw new Error('Unauthorized')}
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.detail||'Erreur')}
  return r.json();
}

/* ── Login ── */
document.getElementById('login-form').onsubmit = async e => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errEl = document.getElementById('login-error');
  try {
    const r = await fetch(API+'/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const d = await r.json();
    if(!r.ok){errEl.textContent=d.detail||'Erreur';return}
    token=d.access_token;localStorage.setItem('admin_token',token);showApp();
  } catch(err){errEl.textContent='Erreur de connexion'}
};

function logout(){localStorage.removeItem('admin_token');token=null;document.getElementById('app').style.display='none';document.getElementById('login-view').style.display='flex'}

async function showApp(){
  document.getElementById('login-view').style.display='none';
  document.getElementById('app').style.display='block';
  switchTab('dashboard');
}

/* ── Navigation ── */
document.querySelectorAll('.sidebar nav a').forEach(a=>{
  a.addEventListener('click',e=>{
    e.preventDefault();
    switchTab(a.dataset.tab);
  });
});

function switchTab(name){
  document.querySelectorAll('.sidebar nav a').forEach(a=>a.classList.toggle('active',a.dataset.tab===name));
  ['dashboard','users','system'].forEach(p=>{
    document.getElementById('page-'+p).style.display=p===name?'block':'none';
  });
  if(name==='dashboard')loadDashboard();
  if(name==='users'){currentPage=1;loadUsers()}
  if(name==='system')loadSystem();
}

/* ── Dashboard ── */
async function loadDashboard(){
  const cards=document.getElementById('stats-cards');
  cards.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  try{
    const s=await apiFetch('/admin/stats');
    const t=s.totals,w=s.week;
    cards.innerHTML=`
      <div class="stat-card"><div class="icon-bubble" style="background:${C.primaryFixed}"><svg viewBox="0 0 24 24" fill="${C.primary}"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg></div><div class="info"><div class="value">${t.users}</div><div class="label">Utilisateurs</div><div class="sub">+${w.new_users} cette semaine</div></div></div>
      <div class="stat-card"><div class="icon-bubble" style="background:${C.success};opacity:.12"><svg viewBox="0 0 24 24" fill="${C.success}"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></div><div class="info"><div class="value">${w.active_users}</div><div class="label">Actifs (7j)</div><div class="sub">${w.conversion_rate}% conversion</div></div></div>
      <div class="stat-card"><div class="icon-bubble" style="background:${C.warning};opacity:.12"><svg viewBox="0 0 24 24" fill="${C.warning}"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></div><div class="info"><div class="value">${t.premium_users}</div><div class="label">Premium</div><div class="sub">sur ${t.users} utilisateurs</div></div></div>
      <div class="stat-card"><div class="icon-bubble" style="background:${C.primaryFixed}"><svg viewBox="0 0 24 24" fill="${C.primary}"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg></div><div class="info"><div class="value">${w.sessions}</div><div class="label">Sessions (7j)</div><div class="sub">${t.sessions} total</div></div></div>
      <div class="stat-card"><div class="icon-bubble" style="background:${C.secondaryContainer}"><svg viewBox="0 0 24 24" fill="${C.secondary}"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg></div><div class="info"><div class="value">${w.messages}</div><div class="label">Messages (7j)</div><div class="sub">${t.messages} total</div></div></div>
      <div class="stat-card"><div class="icon-bubble" style="background:${C.primaryFixed}"><svg viewBox="0 0 24 24" fill="${C.primary}"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div><div class="info"><div class="value">${w.mood_logs}</div><div class="label">Humeurs (7j)</div><div class="sub">${t.mood_logs} total</div></div></div>
    `;
    renderMoodChart(s.mood_trend);
    renderTechChart(s.techniques);
  }catch(e){cards.innerHTML='<p class="empty">Erreur de chargement</p>'}
}

function renderMoodChart(data){
  if(charts.mood)charts.mood.destroy();
  const ctx=document.getElementById('chart-mood');
  if(!data.length){ctx.parentElement.innerHTML='<h3>Tendance d\'humeur (7 jours)</h3><div class="empty"><p>Aucune donn&eacute;e</p></div>';return}
  charts.mood=new Chart(ctx,{
    type:'line',
    data:{labels:data.map(d=>d.date),datasets:[
      {label:'Humeur moy.',data:data.map(d=>d.avg),borderColor:C.primary,backgroundColor:C.primaryFixed+'33',fill:true,tension:.4,pointRadius:5,pointBackgroundColor:C.primary,pointBorderColor:'#fff',pointBorderWidth:2},
      {label:'Entries',data:data.map(d=>d.count),borderColor:C.secondary,backgroundColor:'transparent',tension:.4,pointRadius:3,borderDash:[6,4],yAxisID:'y1',pointBackgroundColor:C.secondary}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:C.onSurfaceV,font:{family:'Plus Jakarta Sans',size:12}}}},scales:{x:{ticks:{color:C.outline,font:{size:11}},grid:{color:C.surface}},y:{min:0,max:10,ticks:{color:C.outline,font:{size:11}},grid:{color:C.surface}},y1:{position:'right',min:0,ticks:{color:C.outline,font:{size:11}},grid:{display:false}}}}
  });
}

function renderTechChart(data){
  if(charts.tech)charts.tech.destroy();
  const ctx=document.getElementById('chart-tech');
  const labels=Object.keys(data);
  if(!labels.length){ctx.parentElement.innerHTML='<h3>Techniques utilis&eacute;es (7 jours)</h3><div class="empty"><p>Aucune donn&eacute;e</p></div>';return}
  const palette=[C.primary,C.secondary,'#16a34a','#b45309','#0369a1'];
  charts.tech=new Chart(ctx,{
    type:'doughnut',
    data:{labels,datasets:[{data:labels.map(l=>data[l]),backgroundColor:palette.slice(0,labels.length),borderWidth:0,hoverOffset:6}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'right',labels:{color:C.onSurfaceV,font:{family:'Plus Jakarta Sans',size:12},padding:14}}}}
  });
}

/* ── Users ── */
document.getElementById('user-search').addEventListener('input',e=>{
  clearTimeout(searchTimeout);
  searchTimeout=setTimeout(()=>{currentPage=1;loadUsers()},300);
});

async function loadUsers(page){
  if(page)currentPage=page;
  const tbody=document.getElementById('users-tbody');
  tbody.innerHTML='<tr><td colspan="7" class="loading"><div class="spinner"></div></td></tr>';
  try{
    const q=document.getElementById('user-search').value;
    const d=await apiFetch('/admin/users?page='+currentPage+'&per_page=20&q='+encodeURIComponent(q));
    if(!d.users.length){tbody.innerHTML='<tr><td colspan="7" class="empty"><p>Aucun utilisateur trouv&eacute;</p></td></tr>';return}
    tbody.innerHTML=d.users.map(u=>'<tr>'+
      '<td style="font-weight:600">'+esc(u.name)+'</td>'+
      '<td style="color:var(--on-surface-v)">'+esc(u.email)+'</td>'+
      '<td>'+u.session_count+'</td>'+
      '<td>'+(u.is_premium?'<span class="badge badge-premium">Premium</span>':'<span class="badge badge-free">Gratuit</span>')+(u.is_admin?' <span class="badge badge-admin">Admin</span>':'')+'</td>'+
      '<td>'+(u.is_active_7d?'<span class="badge badge-active">Actif</span>':'<span class="badge badge-inactive">Inactif</span>')+'</td>'+
      '<td style="color:var(--outline);font-size:13px">'+(u.created_at?new Date(u.created_at).toLocaleDateString('fr-FR'):'-')+'</td>'+
      '<td><button class="btn btn-outline btn-sm" onclick="openUser('+u.id+')">Voir</button></td>'+
    '</tr>').join('');
    renderPagination(d.page,d.pages,d.total);
  }catch(e){tbody.innerHTML='<tr><td colspan="7" class="empty">Erreur de chargement</td></tr>'}
}

function renderPagination(page,pages,total){
  document.getElementById('users-pagination').innerHTML=
    '<button '+(page<=1?'disabled':'')+' onclick="loadUsers('+(page-1)+')">&larr;</button>'+
    '<span class="page-info">Page '+page+' / '+pages+' ('+total+' utilisateurs)</span>'+
    '<button '+(page>=pages?'disabled':'')+' onclick="loadUsers('+(page+1)+')">&rarr;</button>';
}

/* ── User Detail Modal ── */
async function openUser(id){
  const modal=document.getElementById('user-modal');
  const body=document.getElementById('modal-body');
  modal.classList.add('open');
  body.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  try{
    const d=await apiFetch('/admin/users/'+id);
    const u=d.user,m=d.metrics;
    document.getElementById('modal-title').textContent=u.name||u.email;

    let techHtml='';
    if(m.techniques&&Object.keys(m.techniques).length){
      techHtml='<div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--surface-v)"><label style="font-size:12px;color:var(--outline);text-transform:uppercase;display:block;margin-bottom:8px;font-weight:600;letter-spacing:.65px">Techniques utilis&eacute;es</label><div style="display:flex;gap:8px;flex-wrap:wrap">'+Object.entries(m.techniques).map(([k,v])=>'<span class="badge badge-premium">'+k+': '+v+'</span>').join('')+'</div></div>';
    }

    let moodHtml='';
    if(d.mood_logs.length){
      moodHtml='<div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--surface-v)"><label style="font-size:12px;color:var(--outline);text-transform:uppercase;display:block;margin-bottom:8px;font-weight:600;letter-spacing:.65px">Humeurs r&eacute;centes</label><div style="display:flex;gap:6px;flex-wrap:wrap">'+d.mood_logs.slice(0,20).map(mo=>{
        const bg=mo.score>=7?'background:var(--success-bg);color:var(--success)':mo.score>=4?'background:var(--warning-bg);color:var(--warning)':'background:var(--error-container);color:var(--on-error-container)';
        return '<span style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:var(--r-full);font-size:12px;font-weight:700;'+bg+'" title="'+mo.label+'">'+mo.score+'</span>';
      }).join('')+'</div></div>';
    }

    let sessionsHtml='';
    if(d.sessions.length){
      sessionsHtml='<div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--surface-v)"><label style="font-size:12px;color:var(--outline);text-transform:uppercase;display:block;margin-bottom:8px;font-weight:600;letter-spacing:.65px">Sessions ('+d.sessions.length+')</label><div style="max-height:200px;overflow-y:auto">'+d.sessions.slice(0,10).map(s=>'<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--surface-ch);font-size:14px"><span style="font-weight:500">'+esc(s.title)+'</span><span style="color:var(--outline)">'+(s.created_at?new Date(s.created_at).toLocaleDateString('fr-FR'):'-')+'</span></div>').join('')+'</div></div>';
    }

    body.innerHTML=
      '<div class="detail-grid">'+
        '<div class="detail-item"><label>Email</label><div class="val">'+esc(u.email)+'</div></div>'+
        '<div class="detail-item"><label>Inscrit le</label><div class="val">'+(u.created_at?new Date(u.created_at).toLocaleDateString('fr-FR'):'-')+'</div></div>'+
        '<div class="detail-item"><label>Sessions totales</label><div class="val">'+m.total_sessions+'</div></div>'+
        '<div class="detail-item"><label>Sessions (7j)</label><div class="val">'+m.sessions_7d+'</div></div>'+
        '<div class="detail-item"><label>Messages totaux</label><div class="val">'+m.total_messages+'</div></div>'+
        '<div class="detail-item"><label>Messages (7j)</label><div class="val">'+m.messages_7d+'</div></div>'+
        '<div class="detail-item"><label>Humeurs</label><div class="val">'+m.total_mood_logs+'</div></div>'+
        '<div class="detail-item"><label>Exercices</label><div class="val">'+m.total_exercises+'</div></div>'+
        '<div class="detail-item"><label>Humeur moy.</label><div class="val">'+(m.avg_mood?m.avg_mood+'/10':'-')+'</div></div>'+
        '<div class="detail-item"><label>Humeur moy. (7j)</label><div class="val">'+(m.avg_mood_7d?m.avg_mood_7d+'/10':'-')+'</div></div>'+
        '<div class="detail-item"><label>Statut</label><div class="val">'+(u.is_premium?'<span class="badge badge-premium">Premium</span>':'<span class="badge badge-free">Gratuit</span>')+'</div></div>'+
        '<div class="detail-item"><label>Email v&eacute;rifi&eacute;</label><div class="val">'+(u.email_verified?'<span class="badge badge-verified">Oui</span>':'<span class="badge badge-unverified">Non</span>')+'</div></div>'+
      '</div>'+
      '<div class="detail-actions">'+
        '<button class="btn btn-success btn-sm" onclick="togglePremium('+u.id+')">'+(u.is_premium?'Retirer Premium':'Accorder Premium')+'</button>'+
        '<button class="btn btn-outline btn-sm" onclick="toggleAdmin('+u.id+')">'+(u.is_admin?'Retirer Admin':'Accorder Admin')+'</button>'+
      '</div>'+
      techHtml+moodHtml+sessionsHtml;
  }catch(e){body.innerHTML='<p class="empty">Erreur de chargement</p>'}
}

function closeModal(){document.getElementById('user-modal').classList.remove('open')}
document.getElementById('user-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});

async function togglePremium(id){await apiFetch('/admin/users/'+id+'/toggle-premium',{method:'PUT'});openUser(id)}
async function toggleAdmin(id){await apiFetch('/admin/users/'+id+'/toggle-admin',{method:'PUT'});openUser(id)}

/* ── System ── */
async function loadSystem(){
  const el=document.getElementById('system-content');
  el.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  try{
    const s=await apiFetch('/admin/system');
    const c=s.config;
    el.innerHTML=
      '<div class="sys-grid">'+
        '<div class="sys-card">'+
          '<h3><span class="status-dot '+(s.database.ok?'ok':'err')+'"></span>Base de donn&eacute;es</h3>'+
          '<div class="sys-row"><span class="key">Statut</span><span class="val">'+(s.database.ok?'Connect&eacute;e':'Erreur')+'</span></div>'+
          (s.database.error?'<div class="sys-row"><span class="key">Erreur</span><span class="val" style="color:var(--error);font-size:12px">'+esc(s.database.error)+'</span></div>':'')+
        '</div>'+
        '<div class="sys-card">'+
          '<h3>Configuration</h3>'+
          '<div class="sys-row"><span class="key">Environnement</span><span class="val">'+esc(c.environment)+'</span></div>'+
          '<div class="sys-row"><span class="key">LLM</span><span class="val">'+esc(c.llm_primary)+'</span></div>'+
          '<div class="sys-row"><span class="key">Mon&eacute;tisation</span><span class="val">'+esc(c.monetization_mode)+'</span></div>'+
          '<div class="sys-row"><span class="key">Sessions gratuites</span><span class="val">'+c.free_sessions_per_week+'/sem</span></div>'+
          '<div class="sys-row"><span class="key">Rate limiting</span><span class="val">'+(c.rate_limit_enabled?'Activ&eacute;':'D&eacute;sactiv&eacute;')+'</span></div>'+
          '<div class="sys-row"><span class="key">Chiffrement PII</span><span class="val">'+(c.field_encryption_enabled?'Activ&eacute;':'D&eacute;sactiv&eacute;')+'</span></div>'+
        '</div>'+
      '</div>';
  }catch(e){el.innerHTML='<p class="empty">Erreur de chargement</p>'}
}

/* ── Helpers ── */
function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML}

if(token)showApp();
</script>
</body>
</html>"""


@router.get("/", response_class=RedirectResponse)
async def admin_index():
    return RedirectResponse(url="/admin/panel")


@router.get("/panel", response_class=HTMLResponse)
async def admin_panel():
    return ADMIN_HTML
