"""Vercel serverless entry point for the Serene FastAPI app.

The ``app`` object is the ASGI application that @vercel/python wraps.
All routing is handled by FastAPI internally — this file just exposes it.
"""
import sys
import os

# Ensure ``app`` package is importable when Vercel runs from /var/task.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app  # noqa: E402

__all__ = ["app"]
