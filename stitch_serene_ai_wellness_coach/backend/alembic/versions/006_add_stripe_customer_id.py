"""add stripe_customer_id to users

Revision ID: 006_add_stripe_customer_id
Revises: 005_add_stripe_columns
Create Date: 2026-08-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "006_add_stripe_customer_id"
down_revision: Union[str, None] = "005_add_stripe_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    user_cols = {col["name"] for col in sa.inspect(bind).get_columns("users")}
    if "stripe_customer_id" not in user_cols:
        op.add_column("users", sa.Column("stripe_customer_id", sa.String(255), nullable=True, default=None))


def downgrade() -> None:
    try:
        op.drop_column("users", "stripe_customer_id")
    except Exception:
        pass
