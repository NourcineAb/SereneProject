"""Backoffice panel — login + self-contained HTML/CSS/JS assets.

The panel is a single-page vanilla-JS app split into three static assets
served from FastAPI (the Vercel rewrite ``/(.*)`` routes every request to the
API, so static files must be served here).
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...models import User
from ...security import create_access_token, verify_password

router = APIRouter(tags=["admin-panel"])

_PANEL_DIR = Path(__file__).resolve().parents[2]  # app/

_HTML_CACHE: str | None = None
_CSS_CACHE: str | None = None
_JS_CACHE: str | None = None


def _read_panel(rel: str) -> str:
    return (_PANEL_DIR / rel).read_text(encoding="utf-8")


class AdminLoginIn(BaseModel):
    email: EmailStr
    password: str


@router.get("/admin", response_class=RedirectResponse)
async def admin_index():
    return RedirectResponse(url="/admin/panel")


@router.get("/admin/panel", response_class=HTMLResponse)
async def admin_panel():
    global _HTML_CACHE
    if _HTML_CACHE is None:
        _HTML_CACHE = _read_panel("admin_panel.html")
    return HTMLResponse(_HTML_CACHE)


@router.get("/admin/assets/style.css")
async def admin_style():
    global _CSS_CACHE
    if _CSS_CACHE is None:
        _CSS_CACHE = _read_panel("admin_style.css")
    return Response(content=_CSS_CACHE, media_type="text/css; charset=utf-8")


@router.get("/admin/assets/app.js")
async def admin_app():
    global _JS_CACHE
    if _JS_CACHE is None:
        _JS_CACHE = _read_panel("admin_app.js")
    return Response(content=_JS_CACHE, media_type="application/javascript; charset=utf-8")


@router.post("/admin/login")
async def admin_login(body: AdminLoginIn, db: AsyncSession = Depends(get_db)):
    user = (
        await db.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(401, "Invalid credentials")
    if not user.is_admin:
        raise HTTPException(403, "Admin access required")
    if user.is_suspended:
        raise HTTPException(403, "This admin account is suspended")
    token = create_access_token(user.email, user.token_version)
    return {"access_token": token, "token_type": "bearer"}
