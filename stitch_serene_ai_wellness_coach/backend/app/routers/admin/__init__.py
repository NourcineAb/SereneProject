"""Backoffice admin package — dashboard, users, subscriptions, AI, notifications,
feedback, audit and system modules. All routes are protected by the admin
dependency and read/write only real database rows (never mocked data).
"""
from . import (
    ai_monitoring,
    audit,
    feedback,
    notifications,
    panel,
    stats,
    subscriptions,
    system,
    users,
)

__all__ = [
    "ai_monitoring",
    "audit",
    "feedback",
    "notifications",
    "panel",
    "stats",
    "subscriptions",
    "system",
    "users",
]
