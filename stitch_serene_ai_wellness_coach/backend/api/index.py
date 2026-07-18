"""Vercel serverless entry point for the Serene FastAPI app.

The ``app`` object is the ASGI application that @vercel/python wraps.
All routing is handled by FastAPI internally — this file just exposes it.
"""
import sys
import os
import logging

logger = logging.getLogger("serene.vercel")

# Ensure ``app`` package is importable when Vercel runs from /var/task.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from app.main import app  # noqa: E402
except Exception:
    logger.exception("Failed to import FastAPI app — check env vars and database config.")
    raise

__all__ = ["app"]
