from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


# ─── Auth ──────────────────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = "Friend"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"


class RefreshIn(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    name: str
    is_premium: bool

    class Config:
        from_attributes = True


class UserExportOut(BaseModel):
    profile: dict[str, Any]
    sessions: list[dict[str, Any]]
    mood_logs: list[dict[str, Any]]


# ─── Chat ──────────────────────────────────────────────────────────────────
class ChatIn(BaseModel):
    message: str
    session_id: int | None = None  # omit to start a new session


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    technique: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatOut(BaseModel):
    session_id: int
    reply: str
    technique: str | None = None
    paywall: bool = False
    sessions_used: int
    sessions_limit: int


# ─── Mood ──────────────────────────────────────────────────────────────────
class MoodIn(BaseModel):
    score: int = Field(ge=1, le=10)
    label: str
    note: str | None = None


class MoodOut(BaseModel):
    id: int
    score: int
    label: str
    note: str | None
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Journal ──────────────────────────────────────────────────────────────
class JournalEntryIn(BaseModel):
    mood_score: int = Field(ge=1, le=10)
    content: str
    technique: str | None = None


class JournalEntryOut(BaseModel):
    id: int
    mood_score: int
    content: str
    technique: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class WeeklySummaryOut(BaseModel):
    total_entries: int
    average_mood: float
    most_used_technique: str | None = None
    entries_by_day: dict[str, int]


# ─── Progress / Dashboard ────────────────────────────────────────────────────
class ProgressOut(BaseModel):
    streak_days: int
    sessions_this_week: int
    sessions_limit: int
    avg_mood: float
    mood_trend: list[int]          # last 7 daily mood scores (0 = no entry)
    anxiety_change_pct: int        # negative = improvement
    is_premium: bool


class SessionOut(BaseModel):
    id: int
    title: str
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Password reset ────────────────────────────────────────────────────────
class RequestPasswordResetIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(min_length=6)


# ─── Community / Challenges ──────────────────────────────────────────────
class ChallengeOut(BaseModel):
    id: int
    title: str
    description: str
    duration_days: int
    target_sessions: int
    target_streak: int
    created_at: datetime
    participant_count: int = 0

    class Config:
        from_attributes = True


class UserChallengeOut(BaseModel):
    id: int
    challenge_id: int
    started_at: datetime
    completed: bool
    completed_at: datetime | None = None
    current_sessions: int = 0
    current_streak: int = 0
    challenge: ChallengeOut | None = None

    class Config:
        from_attributes = True
