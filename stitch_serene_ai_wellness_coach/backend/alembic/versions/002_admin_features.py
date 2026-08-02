"""backoffice admin features

Revision ID: 002_admin_features
Revises: 001_initial
Create Date: 2026-08-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "002_admin_features"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create_backoffice_tables() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), index=True, nullable=False),
        sa.Column("plan", sa.String(32), server_default="monthly", nullable=False),
        sa.Column("status", sa.String(16), server_default="active", nullable=False),
        sa.Column("price", sa.Float(), server_default="0", nullable=False),
        sa.Column("currency", sa.String(8), server_default="USD", nullable=False),
        sa.Column("is_trial", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("current_period_start", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True, default=None),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True, default=None),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, index=True),
    )

    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), index=True, nullable=False),
        sa.Column("subscription_id", sa.Integer(), sa.ForeignKey("subscriptions.id"), nullable=True, default=None),
        sa.Column("amount", sa.Float(), server_default="0", nullable=False),
        sa.Column("currency", sa.String(8), server_default="USD", nullable=False),
        sa.Column("status", sa.String(16), server_default="succeeded", nullable=False),
        sa.Column("source", sa.String(16), server_default="revenuecat", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, index=True),
    )

    op.create_table(
        "admin_notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("target_type", sa.String(16), server_default="all", nullable=False),
        sa.Column("target_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True, default=None),
        sa.Column("status", sa.String(16), server_default="sent", nullable=False),
        sa.Column("total_targets", sa.Integer(), server_default="0", nullable=False),
        sa.Column("sent_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("failed_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True, default=None),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, index=True),
    )

    op.create_table(
        "feedback",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), index=True, nullable=False),
        sa.Column("category", sa.String(16), server_default="feedback", nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), server_default="open", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, index=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True, default=None),
    )

    op.create_table(
        "admin_audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("admin_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True, default=None),
        sa.Column("action", sa.String(64), index=True, nullable=False),
        sa.Column("target_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True, default=None),
        sa.Column("details", sa.Text(), nullable=True, default=None),
        sa.Column("result", sa.String(16), server_default="success", nullable=False),
        sa.Column("ip", sa.String(45), nullable=True, default=None),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, index=True),
    )

    op.create_table(
        "ai_usage_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True, default=None, index=True),
        sa.Column("session_id", sa.Integer(), nullable=True, default=None),
        sa.Column("model", sa.String(96), nullable=True, default=None),
        sa.Column("status", sa.String(16), server_default="success", nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=True, default=None),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True, default=None),
        sa.Column("completion_tokens", sa.Integer(), nullable=True, default=None),
        sa.Column("total_tokens", sa.Integer(), nullable=True, default=None),
        sa.Column("error", sa.Text(), nullable=True, default=None),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, index=True),
    )

    op.create_table(
        "error_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(32), server_default="api", nullable=False),
        sa.Column("method", sa.String(8), nullable=True, default=None),
        sa.Column("path", sa.String(255), nullable=True, default=None),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True, default=None),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, index=True),
    )

    op.create_table(
        "exercise_completions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), index=True, nullable=False),
        sa.Column("exercise_id", sa.String(64), index=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def upgrade() -> None:
    op.add_column("users", sa.Column("is_suspended", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True, default=None))
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    _create_backoffice_tables()


def downgrade() -> None:
    op.drop_table("exercise_completions")
    op.drop_table("error_logs")
    op.drop_table("ai_usage_logs")
    op.drop_table("admin_audit_logs")
    op.drop_table("feedback")
    op.drop_table("admin_notifications")
    op.drop_table("payments")
    op.drop_table("subscriptions")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "is_suspended")
    op.drop_column("users", "is_admin")
