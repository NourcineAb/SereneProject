#!/usr/bin/env python3
"""Convenience wrapper for common Alembic operations."""
import subprocess
import sys
from pathlib import Path

ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def run(cmd: list[str]) -> None:
    print(f"Running: {' '.join(cmd)}")
    subprocess.run(cmd, check=True)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python manage_migrations.py [upgrade|make_migration|history|current]")
        print("  upgrade         — Apply all pending migrations")
        print("  make_migration  — Auto-generate a new migration from model changes")
        print("  history         — Show migration history")
        print("  current         — Show current revision")
        sys.exit(1)

    action = sys.argv[1]

    if action == "upgrade":
        run(["alembic", "-c", str(ALEMBIC_INI), "upgrade", "head"])
    elif action == "make_migration":
        msg = sys.argv[2] if len(sys.argv) > 2 else "auto"
        run(["alembic", "-c", str(ALEMBIC_INI), "revision", "--autogenerate", "-m", msg])
    elif action == "history":
        run(["alembic", "-c", str(ALEMBIC_INI), "history"])
    elif action == "current":
        run(["alembic", "-c", str(ALEMBIC_INI), "current"])
    else:
        print(f"Unknown action: {action}")
        sys.exit(1)


if __name__ == "__main__":
    main()
