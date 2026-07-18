"""Vercel serverless entry point for the Serene FastAPI app.

The ``app`` object is the ASGI application that @vercel/python wraps.
A CORS ASGI wrapper is applied *before* FastAPI so that CORS headers are
always returned — even when the app crashes with a 500.
"""
import sys
import os
import logging
import json

logger = logging.getLogger("serene.vercel")

# Ensure ``app`` package is importable when Vercel runs from /var/task.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from app.main import app  # noqa: E402
except Exception:
    logger.exception("Failed to import FastAPI app — check env vars and database config.")
    app = None

# ── CORS ASGI wrapper ────────────────────────────────────────────────────────
# This ensures CORS headers are returned on *every* response, including 500s
# when the FastAPI app crashes before its own CORSMiddleware can run.
_ALLOWED_ORIGINS = {
    "https://nourcineabsereneproject.vercel.app",
    "https://serene-backend-mu.vercel.app",
}
_CORS_HEADERS = {
    "Access-Control-Allow-Methods": "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
}


def _get_cors_origin(origin: str | None) -> str | None:
    if not origin:
        return None
    if origin in _ALLOWED_ORIGINS:
        return origin
    # Allow any *.vercel.app origin in dev/staging
    if origin.endswith(".vercel.app"):
        return origin
    return None


class CORSWrapper:
    """Minimal ASGI CORS wrapper that survives inner app crashes."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            # Parse request headers
            headers = dict(scope.get("headers", []))
            origin = headers.get(b"origin", b"").decode("utf-8") if b"origin" in headers else None
            method = scope.get("method", "")

            # Handle preflight
            if method == "OPTIONS":
                cors_origin = _get_cors_origin(origin)
                if cors_origin:
                    resp_headers = [
                        [b"access-control-allow-origin", cors_origin.encode()],
                        [b"access-control-allow-methods", b"GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS"],
                        [b"access-control-allow-headers", b"Content-Type,Authorization"],
                        [b"access-control-max-age", b"86400"],
                        [b"content-length", b"0"],
                    ]
                    await send({
                        "type": "http.response.start",
                        "status": 204,
                        "headers": resp_headers,
                    })
                    await send({"type": "http.response.body", "body": b""})
                    return

            # Wrap send to inject CORS headers on every response
            cors_origin = _get_cors_origin(origin)

            async def send_with_cors(message):
                if message["type"] == "http.response.start" and cors_origin:
                    existing = dict(message.get("headers", []))
                    if b"access-control-allow-origin" not in existing:
                        extra = [
                            [b"access-control-allow-origin", cors_origin.encode()],
                        ]
                        message["headers"] = list(message.get("headers", [])) + extra
                await send(message)

            try:
                if self.inner is not None:
                    await self.inner(scope, receive, send_with_cors)
                else:
                    # App failed to import — return a JSON 500 with CORS headers
                    body = json.dumps({
                        "detail": "Backend is starting up. Please retry in a moment."
                    }).encode()
                    await send_with_cors({
                        "type": "http.response.start",
                        "status": 500,
                        "headers": [
                            [b"content-type", b"application/json"],
                            [b"content-length", str(len(body)).encode()],
                        ],
                    })
                    await send({"type": "http.response.body", "body": body})
            except Exception:
                logger.exception("Unhandled error in ASGI handler")
                # Last-resort error response with CORS
                body = b'{"detail":"Internal server error"}'
                try:
                    await send_with_cors({
                        "type": "http.response.start",
                        "status": 500,
                        "headers": [
                            [b"content-type", b"application/json"],
                            [b"content-length", b"31"],
                        ],
                    })
                    await send({"type": "http.response.body", "body": body})
                except Exception:
                    pass
        else:
            if self.inner is not None:
                await self.inner(scope, receive, send)


__all__ = ["app"]

# Wrap the app with CORS — this is the actual ASGI entry point Vercel uses.
app = CORSWrapper(app)
