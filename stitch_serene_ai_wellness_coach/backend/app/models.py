from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base
from .encryption import EncryptedText


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="Friend")
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_premium: Mapped[bool] = mapped_column(default=False)
    is_admin: Mapped[bool] = mapped_column(default=False)
    email_verified: Mapped[bool] = mapped_column(default=False)
    expo_push_token: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Incremented on logout to invalidate all issued tokens (token revocation).
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    # Backoffice-only flags (do not affect the mobile UI itself; enforced server-side).
    is_suspended: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)

    sessions: Mapped[list["Session"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    mood_logs: Mapped[list["MoodLog"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    journal_entries: Mapped[list["JournalEntry"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    password_resets: Mapped[list["PasswordReset"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    email_verifications: Mapped[list["EmailVerification"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    exercise_completions: Mapped[list["ExerciseCompletion"]] = relationship(
        cascade="all, delete-orphan"
    )
    subscriptions: Mapped[list["Subscription"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    feedback_items: Mapped[list["Feedback"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Session(Base):
    """A coaching conversation (one 'session' for the freemium gate)."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(160), default="Session de calme")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="sessions")
    messages: Mapped[list["Message"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="Message.id"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # "user" | "assistant"
    content: Mapped[str] = mapped_column(EncryptedText)  # PII: encrypted at rest
    technique: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    session: Mapped["Session"] = relationship(back_populates="messages")


class MoodLog(Base):
    __tablename__ = "mood_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    score: Mapped[int] = mapped_column(Integer)        # 1..10
    label: Mapped[str] = mapped_column(String(40))     # Calme, Joyeux, Neutre, Anxieux, Fatigué
    note: Mapped[str | None] = mapped_column(EncryptedText, nullable=True)  # PII: encrypted at rest
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="mood_logs")


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    mood_score: Mapped[int] = mapped_column(Integer)  # 1..10
    content: Mapped[str] = mapped_column(EncryptedText)  # PII: encrypted at rest
    technique: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="journal_entries")


class PasswordReset(Base):
    """Password reset token — single-use, expires after 1 hour."""

    __tablename__ = "password_resets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    used: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="password_resets")


class EmailVerification(Base):
    """Email verification token — single-use, expires after 24 hours."""

    __tablename__ = "email_verifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    used: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="email_verifications")


class Challenge(Base):
    """A community challenge that users can join and complete."""

    __tablename__ = "challenges"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    duration_days: Mapped[int] = mapped_column(Integer)
    target_sessions: Mapped[int] = mapped_column(Integer, default=0)
    target_streak: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user_challenges: Mapped[list["UserChallenge"]] = relationship(
        back_populates="challenge", cascade="all, delete-orphan"
    )


class UserChallenge(Base):
    """Tracks a user's participation in a challenge."""

    __tablename__ = "user_challenges"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    challenge_id: Mapped[int] = mapped_column(ForeignKey("challenges.id"), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed: Mapped[bool] = mapped_column(default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    current_sessions: Mapped[int] = mapped_column(Integer, default=0)
    current_streak: Mapped[int] = mapped_column(Integer, default=0)

    user: Mapped["User"] = relationship()
    challenge: Mapped["Challenge"] = relationship(back_populates="user_challenges")


class ExerciseCompletion(Base):
    """Records each time a user completes an exercise (breathing, grounding, etc.)."""

    __tablename__ = "exercise_completions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    exercise_id: Mapped[str] = mapped_column(String(64), index=True)  # e.g. "square-breathing"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ═══════════════════════════════════════════════════════════════════════════════
# Backoffice-only models. These tables exist solely to power the admin panel.
# They are never read by the mobile app; the mobile app is only affected when an
# admin action (e.g. suspend, grant premium) changes a user's core fields.
# ═══════════════════════════════════════════════════════════════════════════════


class Subscription(Base):
    """A real premium subscription record (started via Stripe webhook,
    RevenueCat webhook, the admin panel, or the dev mock billing endpoint)."""

    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    plan: Mapped[str] = mapped_column(String(32), default="monthly")  # "monthly" | "yearly"
    status: Mapped[str] = mapped_column(String(16), default="active")  # active | trial | canceled | expired | past_due | unpaid | incomplete | paused
    price: Mapped[float] = mapped_column(Float, default=0.0)  # amount in USD
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    is_trial: Mapped[bool] = mapped_column(Boolean, default=False)
    provider: Mapped[str] = mapped_column(String(32), default="stripe")  # stripe | revenuecat | admin
    # Unique per provider so webhook re-deliveries can't create duplicate rows
    # (Stripe subscription.id is unique; NULL allowed for RevenueCat/admin rows).
    provider_subscription_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True, default=None
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    current_period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    user: Mapped["User"] = relationship(back_populates="subscriptions")
    payments: Mapped[list["Payment"]] = relationship(back_populates="subscription")


class Payment(Base):
    """A real payment record. Revenue is summed from these rows — never mocked."""

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    subscription_id: Mapped[int | None] = mapped_column(
        ForeignKey("subscriptions.id"), nullable=True
    )
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    status: Mapped[str] = mapped_column(String(16), default="succeeded")  # pending | succeeded | failed | refunded | canceled
    source: Mapped[str] = mapped_column(String(16), default="stripe")  # stripe | revenuecat | admin | mock
    provider: Mapped[str] = mapped_column(String(32), default="stripe")  # stripe | revenuecat | apple | google
    # Unique per provider so webhook re-deliveries can't create duplicate rows
    # (Stripe invoice.id is unique; NULL allowed for RevenueCat/admin rows).
    provider_payment_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True, default=None
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    user: Mapped["User"] = relationship(back_populates="payments")
    subscription: Mapped["Subscription | None"] = relationship(back_populates="payments")


class AdminNotification(Base):
    """A notification sent from the backoffice (persisted for history)."""

    __tablename__ = "admin_notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    target_type: Mapped[str] = mapped_column(String(16), default="all")  # all | premium | free | specific
    target_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, default=None
    )
    status: Mapped[str] = mapped_column(String(16), default="sent")  # sent | partial | failed
    total_targets: Mapped[int] = mapped_column(Integer, default=0)
    sent_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, default=None
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Feedback(Base):
    """User feedback, suggestions and bug reports visible in the backoffice."""

    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    category: Mapped[str] = mapped_column(String(16), default="feedback")  # feedback | suggestion | bug
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="open")  # open | in_progress | resolved
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    user: Mapped["User"] = relationship(back_populates="feedback_items")


class AdminAuditLog(Base):
    """Immutable trail of every admin action performed in the backoffice."""

    __tablename__ = "admin_audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    admin_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, default=None
    )
    action: Mapped[str] = mapped_column(String(64), index=True)
    target_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, default=None
    )
    details: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    result: Mapped[str] = mapped_column(String(16), default="success")  # success | error
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    admin: Mapped["User | None"] = relationship(foreign_keys=[admin_user_id])
    target: Mapped["User | None"] = relationship(foreign_keys=[target_user_id])


class AIUsageLog(Base):
    """One row per LLM request: model, latency, tokens, errors (AI monitoring)."""

    __tablename__ = "ai_usage_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, default=None, index=True
    )
    session_id: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    model: Mapped[str | None] = mapped_column(String(96), nullable=True, default=None)
    status: Mapped[str] = mapped_column(String(16), default="success")  # success | error
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    error: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class ErrorLog(Base):
    """Server-side error log surfaced in the backoffice System page."""

    __tablename__ = "error_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(32), default="api")
    method: Mapped[str | None] = mapped_column(String(8), nullable=True, default=None)
    path: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    message: Mapped[str] = mapped_column(Text)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
