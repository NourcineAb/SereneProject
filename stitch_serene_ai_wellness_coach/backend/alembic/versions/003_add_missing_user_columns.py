"""add missing backoffice user columns

Production database was created before the backoffice feature landed, so the
``users`` table is missing some columns the ORM expects. This migration adds
them (idempotently) without recreating the table or touching existing data.

Revision ID: 003_add_missing_user_columns
Revises: 002_admin_features
Create Date: 2026-08-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "003_add_missing_user_columns"
down_revision: Union[str, None] = "002_admin_features"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_user_columns() -> set[str]:
    bind = op.get_bind()
    return {col["name"] for col in sa.inspect(bind).get_columns("users")}


def upgrade() -> None:
    existing = _existing_user_columns()

    if "is_suspended" not in existing:
        op.add_column(
            "users",
            sa.Column("is_suspended", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        )

    if "last_login_at" not in existing:
        op.add_column(
            "users",
            sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True, default=None),
        )

    if "is_admin" not in existing:
        op.add_column(
            "users",
            sa.Column("is_admin", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        )

    if "email_verified" not in existing:
        op.add_column(
            "users",
            sa.Column("email_verified", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        )


def downgrade() -> None:
    existing = _existing_user_columns()
    for column in ("last_login_at", "is_suspended", "is_admin", "email_verified"):
        if column in existing:
            op.drop_column("users", column)
