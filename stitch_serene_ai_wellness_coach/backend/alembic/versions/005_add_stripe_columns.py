"""add stripe columns to payments and subscriptions

Revision ID: 005_add_stripe_columns
Revises: 004_ensure_backoffice_tables
Create Date: 2026-08-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "005_add_stripe_columns"
down_revision: Union[str, None] = "004_ensure_backoffice_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table: str) -> set[str]:
    bind = op.get_bind()
    return {col["name"] for col in sa.inspect(bind).get_columns(table)}


def upgrade() -> None:
    # payments table
    pay_cols = _existing_columns("payments")
    if "provider" not in pay_cols:
        op.add_column("payments", sa.Column("provider", sa.String(32), server_default="stripe", nullable=False))
    if "provider_payment_id" not in pay_cols:
        op.add_column("payments", sa.Column("provider_payment_id", sa.String(255), nullable=True, default=None))
    if "paid_at" not in pay_cols:
        op.add_column("payments", sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True, default=None))

    # subscriptions table
    sub_cols = _existing_columns("subscriptions")
    if "provider" not in sub_cols:
        op.add_column("subscriptions", sa.Column("provider", sa.String(32), server_default="stripe", nullable=False))
    if "provider_subscription_id" not in sub_cols:
        op.add_column("subscriptions", sa.Column("provider_subscription_id", sa.String(255), nullable=True, default=None))
    if "updated_at" not in sub_cols:
        op.add_column("subscriptions", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True, default=None))


def downgrade() -> None:
    for col in ("paid_at", "provider_payment_id", "provider"):
        try:
            op.drop_column("payments", col)
        except Exception:
            pass
    for col in ("updated_at", "provider_subscription_id", "provider"):
        try:
            op.drop_column("subscriptions", col)
        except Exception:
            pass
