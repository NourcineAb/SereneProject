"""add unique indexes for provider ids (webhook idempotence)

Revision ID: 007_add_unique_provider_ids
Revises: 006_add_stripe_customer_id
Create Date: 2026-08-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "007_add_unique_provider_ids"
down_revision: Union[str, None] = "006_add_stripe_customer_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _normalize_duplicates(table: str, column: str) -> None:
    """Collapse existing duplicate provider ids so the unique index can be built.

    Keeps the oldest row (the first webhook delivery) and blanks the duplicates
    so idempotence never breaks existing deployments.
    """
    bind = op.get_bind()
    table_obj = sa.table(
        table,
        sa.column("id", sa.Integer),
        sa.column(column, sa.String),
    )

    dup_rows = bind.execute(
        sa.select(
            table_obj.c[column],
            sa.func.min(table_obj.c.id).label("keep_id"),
        )
        .where(table_obj.c[column].is_not(None))
        .group_by(table_obj.c[column])
        .having(sa.func.count(table_obj.c.id) > 1)
    ).fetchall()

    for value, keep_id in dup_rows:
        bind.execute(
            table_obj.update()
            .where(
                (table_obj.c[column] == value) & (table_obj.c.id != keep_id)
            )
            .values({column: None})
        )


def upgrade() -> None:
    bind = op.get_bind()

    sub_pk = {c["name"] for c in sa.inspect(bind).get_columns("subscriptions")}
    if "provider_subscription_id" in sub_pk:
        _normalize_duplicates("subscriptions", "provider_subscription_id")
        op.create_index(
            "uq_subscriptions_provider_subscription_id",
            "subscriptions",
            ["provider_subscription_id"],
            unique=True,
        )

    pay_pk = {c["name"] for c in sa.inspect(bind).get_columns("payments")}
    if "provider_payment_id" in pay_pk:
        _normalize_duplicates("payments", "provider_payment_id")
        op.create_index(
            "uq_payments_provider_payment_id",
            "payments",
            ["provider_payment_id"],
            unique=True,
        )


def downgrade() -> None:
    try:
        op.drop_index("uq_subscriptions_provider_subscription_id", table_name="subscriptions")
    except Exception:
        pass
    try:
        op.drop_index("uq_payments_provider_payment_id", table_name="payments")
    except Exception:
        pass