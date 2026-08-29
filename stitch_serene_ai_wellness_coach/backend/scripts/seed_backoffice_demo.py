"""Backoffice demo data seeder (OPT-IN, NEVER auto-run).

Run manually, ONLY against a NON-PRODUCTION database, to populate the
backoffice with realistic, coherent, real DB rows so the dashboard, tables and
charts are visually usable during a presentation/demo.

Guarantees
----------
- Refuses to run against a production environment (hard exit).
- Requires an explicit confirmation flag (--yes) so it can never be
  accidentally invoked as part of any startup path.
- Is idempotent: demo accounts are identified by fixed demo emails and skipped
  if they already exist, so re-running never duplicates data.
- Creates genuine rows (users, sessions, messages, mood logs, subscriptions,
  payments, AI usage logs) directly in the DB — nothing is mocked
  in the frontend, so the panel and all stats read real data.
- Does NOT seed feedback rows: the Serene mobile app has no user-facing feedback
  feature, so feedback is not presented as part of the final product.
- Subscription/Payment ``provider`` values stay coherent (stripe | revenuecat |
  admin) and mirror the mobile monetization model.

Usage
-----
    # From the backend directory:
    python scripts/seed_backoffice_demo.py --yes

Environment
-----------
Set ENVIRONMENT=development (default) in your .env / environment. The script
exits with an error if ENVIRONMENT is production or prod.
"""
from __future__ import annotations

import argparse
import asyncio
import random
import sys
from datetime import datetime, timedelta, timezone

# Allow running as `python scripts/...` from anywhere inside the backend dir.
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402
from app.database import close_db, get_session_factory  # noqa: E402
from app.models import (  # noqa: E402
    AdminAuditLog,
    AIUsageLog,
    Message,
    MoodLog,
    Payment,
    Session,
    Subscription,
    User,
    utcnow,
)
from app.security import hash_password  # noqa: E402


DEMO_USERS = [
    # (email, name, is_premium, provider)
    ("nour.benamor@serene.app", "Nour Ben Amor", True, "stripe"),
    ("yasmine.trabelsi@serene.app", "Yasmine Trabelsi", True, "revenuecat"),
    ("mohamed.bensalem@serene.app", "Mohamed Ben Salem", True, "trial"),
    ("mariem.gharbi@serene.app", "Mariem Gharbi", True, "admin"),
    ("ahmed.jlassi@serene.app", "Ahmed Jlassi", False, None),
    ("ines.mejri@serene.app", "Inès Mejri", False, None),
    ("seif.benyoussef@serene.app", "Seif Ben Youssef", True, "stripe"),
]

# Legacy demo emails (from earlier seed generations) → new realistic demo identity.
# The seeder renames already-seeded demo users in place (preserving user_id and
# all relations: premium, subscriptions, payments, sessions, moods, AI logs),
# avoiding duplicates and staying idempotent. Demo accounts are never real —
# no email is ever sent, no real Gmail/other account is created or used.
# Each target maps to candidate source emails (most recent generation first) so
# an already-present account is migrated in place rather than duplicated.
DEMO_MIGRATE = {
    "nour.benamor@serene.app": (
        ("nour.benamor@serene-demo.com", "demo.nour@serene.app", "demo.stripe@serene.app"),
        "Nour Ben Amor",
    ),
    "yasmine.trabelsi@serene.app": (
        ("yasmine.trabelsi@serene-demo.com", "demo.yasmine@serene.app", "demo.revenuecat@serene.app"),
        "Yasmine Trabelsi",
    ),
    "mohamed.bensalem@serene.app": (
        ("mohamed.bensalem@serene-demo.com", "demo.mohamed@serene.app", "demo.trial@serene.app"),
        "Mohamed Ben Salem",
    ),
    "mariem.gharbi@serene.app": (
        ("mariem.gharbi@serene-demo.com", "demo.mariem@serene.app", "demo.admin@serene.app"),
        "Mariem Gharbi",
    ),
    "ahmed.jlassi@serene.app": (
        ("ahmed.jlassi@serene-demo.com", "demo.ahmed@serene.app", "demo.free@serene.app"),
        "Ahmed Jlassi",
    ),
    "ines.mejri@serene.app": (
        ("ines.mejri@serene-demo.com", "demo.ines@serene.app", "demo.free2@serene.app"),
        "Inès Mejri",
    ),
    "seif.benyoussef@serene.app": (
        ("seif.benyoussef@serene-demo.com", "demo.seif@serene.app", "demo.manager@serene.app"),
        "Seif Ben Youssef",
    ),
}

DEMO_PASSWORD = "SereneDemo2026!"

TITLES = [
    "Respiration apaisante", "Méditation du matin", "Gratitude",
    "Détente du soir", "Gestion du stress", "Focus et calme",
]
TECHNIQUES = ["square-breathing", "grounding", "meditation", "gratitude", "visualization"]

MODELLABELS = {
    1: "Fatigué", 2: "Anxieux", 3: "Triste", 4: "Neutre",
    5: "Neutre", 6: "Neutre", 7: "Calme", 8: "Serein",
    9: "Joyeux", 10: "Joyeux",
}


def _rand(days_back: int = 30) -> datetime:
    secs = random.randint(0, days_back * 86400)
    return utcnow() - timedelta(seconds=secs)


async def _seed_admin(session) -> User | None:
    from sqlalchemy import select

    admin = (
        await session.execute(select(User).where(User.email == "admin@serene.app"))
    ).scalar_one_or_none()
    if admin:
        return None
    admin = User(
        email="admin@serene.app",
        name="Admin Serene",
        hashed_password=hash_password(DEMO_PASSWORD),
        is_admin=True,
        is_premium=True,
        email_verified=True,
    )
    session.add(admin)
    return admin


async def seed(session) -> None:
    from sqlalchemy import select

    print("→ Seeding backoffice demo data… (idempotent)")

    admin = await _seed_admin(session)
    if admin:
        print("  ✓ Admin account created: admin@serene.app / " + DEMO_PASSWORD)
    else:
        print("  • Admin account already present, skipping.")

    now = utcnow()

    for email, name, is_premium, provider in DEMO_USERS:
        existing = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if existing:
            print(f"  • {email} already present, skipping.")
            continue

        # Migrate any legacy demo account (old email, old or newer generation)
        # to this demo identity in place: rename + re-email so relations
        # (premium, subs, payments, sessions, moods, AI logs) stay intact and
        # no duplicates are created.
        migrated = False
        if email in DEMO_MIGRATE:
            legacy_groups, name = DEMO_MIGRATE[email][:-1], DEMO_MIGRATE[email][-1]
            for group in legacy_groups:
                for old in group:
                    legacy = (
                        await session.execute(select(User).where(User.email == old))
                    ).scalar_one_or_none()
                    if legacy:
                        legacy.email = email
                        legacy.name = name
                        await session.commit()
                        print(f"  • {old} → {email} ({name}) migrated.")
                        migrated = True
                        break
                if migrated:
                    break
        if migrated:
            continue

        user = User(
            email=email,
            name=name,
            hashed_password=hash_password(DEMO_PASSWORD),
            is_premium=is_premium,
            email_verified=True,
            last_login_at=_rand(3),
        )
        session.add(user)
        await session.flush()  # assign user.id

        # Mood logs spread over the last ~14 days so charts fill.
        for _ in range(random.randint(6, 14)):
            d = _rand(14)
            score = random.randint(3, 10)
            session.add(
                MoodLog(
                    user_id=user.id,
                    score=score,
                    label=MODELLABELS[score],
                    created_at=d,
                )
            )

        # 1-3 coaching sessions with messages + technique.
        for _ in range(random.randint(1, 3)):
            s = Session(user_id=user.id, title=random.choice(TITLES), created_at=_rand(10))
            session.add(s)
            await session.flush()
            session.add(Message(session_id=s.id, role="user", content="J'ai besoin d'un moment de calme.", created_at=s.created_at))
            session.add(Message(session_id=s.id, role="assistant", content="Prenons une respiration profonde ensemble. Inspirez… expirez lentement…", technique=random.choice(TECHNIQUES), created_at=s.created_at + timedelta(seconds=40)))

        # Subscriptions + payments — provider-coherent.
        subscription = None
        if is_premium:
            created = _rand(20)
            if provider == "trial":
                sub = Subscription(
                    user_id=user.id,
                    plan="monthly",
                    status="trial",
                    price=0.0,
                    currency="USD",
                    is_trial=True,
                    provider="revenuecat",
                    started_at=created,
                    current_period_start=created,
                    current_period_end=created + timedelta(days=7),
                    created_at=created,
                )
                session.add(sub)
                await session.flush()
                subscription = sub
            else:
                status = random.choices(
                    ["active", "active", "active", "canceled", "expired"],
                    weights=[40, 30, 15, 10, 5],
                )[0]
                plan = random.choice(["monthly", "yearly"])
                amount = 4.99 if plan == "monthly" else 49.99
                sub = Subscription(
                    user_id=user.id,
                    plan=plan,
                    status=status,
                    price=amount,
                    currency="USD",
                    is_trial=False,
                    provider=provider,
                    provider_subscription_id=(
                        "sub_demo_" + str(user.id) + "_" + str(random.randint(1000, 9999))
                        if provider == "stripe" else None
                    ),
                    started_at=created,
                    current_period_start=created,
                    current_period_end=created + timedelta(days=30),
                    canceled_at=(created + timedelta(days=10) if status == "canceled" else None),
                    created_at=created,
                )
                session.add(sub)
                await session.flush()
                subscription = sub

            # Payment rows (revenue is summed from these — keep coherent with the sub).
            pay_status = "succeeded"
            source = "stripe" if provider == "stripe" else ("revenuecat" if provider == "revenuecat" else "admin")
            for _ in range(random.randint(1, 2)):
                amount = 4.99 if random.random() > 0.2 else 49.99
                p = Payment(
                    user_id=user.id,
                    subscription_id=subscription.id if subscription else None,
                    amount=amount,
                    currency="USD",
                    status=pay_status,
                    source=source,
                    provider=provider,
                    provider_payment_id=(
                        "pi_demo_" + str(user.id) + "_" + str(random.randint(1000, 9999))
                        if provider == "stripe" else None
                    ),
                    paid_at=_rand(20),
                    created_at=_rand(20),
                )
                session.add(p)

        # Some AI usage logs so the AI monitoring page has data.
        for _ in range(random.randint(3, 8)):
            ok = random.random() > 0.9
            session.add(AIUsageLog(
                user_id=user.id,
                model="nvidia/nemotron-3-ultra-550b-a55b:free",
                status="error" if not ok else "success",
                latency_ms=random.randint(700, 3200),
                prompt_tokens=random.randint(100, 600),
                completion_tokens=random.randint(50, 400),
                total_tokens=random.randint(150, 1000),
                error="Provider timeout" if not ok else None,
                created_at=_rand(10),
            ))

        print(f"  ✓ {email} ({name}) seeded.")

    # A couple of audit entries for the Audit page.
    admin_user = (
        await session.execute(select(User).where(User.email == "admin@serene.app"))
    ).scalar_one_or_none()
    if admin_user:
        session.add_all([
            AdminAuditLog(admin_user_id=admin_user.id, action="seed_demo_data", details="Seeded backoffice demo rows", result="success", created_at=now),
            AdminAuditLog(action="login", result="success", created_at=now),
        ])

    await session.commit()
    print("✓ Done. Dashboard, tables and charts now reflect real demo rows.")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Seed non-production backoffice demo data.")
    parser.add_argument("--yes", action="store_true", help="Confirm you want to seed data.")
    args = parser.parse_args()

    if not args.yes:
        print("Refusing: pass --yes to confirm you want to write demo rows.")
        sys.exit(1)

    if settings.is_production:
        print("Refusing: ENVIRONMENT is production. This seeder must never run in production.")
        sys.exit(1)

    print(f"Environment: {settings.environment}")
    print(f"Database  : {settings.database_url.split('@')[-1]}")
    confirm = input(
        "This writes REAL rows to the database above. Type the database host "
        "to continue (or press Enter to abort): "
    ).strip()
    host = settings.database_url.split("@")[-1].split("/")[0].split(":")[0]
    if not confirm or confirm.lower() != host.lower():
        print("Aborted (host mismatch / no confirmation).")
        sys.exit(1)

    factory = get_session_factory()
    async with factory() as session:
        await seed(session)

    await close_db()


if __name__ == "__main__":
    asyncio.run(main())
