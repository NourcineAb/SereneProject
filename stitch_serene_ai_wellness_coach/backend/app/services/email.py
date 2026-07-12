"""Outbound email delivery.

Sends via SMTP when ``SMTP_HOST`` is configured; otherwise logs the message
(development fallback). Uses only the Python standard library, so no extra
dependency is required. SMTP I/O runs in a worker thread so it never blocks
the event loop.
"""
from __future__ import annotations

import asyncio
import logging
import re
import smtplib
import ssl
from email.message import EmailMessage

from ..config import settings

logger = logging.getLogger("serene.email")

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(html: str) -> str:
    return _TAG_RE.sub(" ", html).replace("  ", " ").strip()


def _send_smtp(to: str, subject: str, html: str) -> bool:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.email_from
    msg["To"] = to
    msg.set_content(_strip_html(html) or "See the HTML version of this message.")
    msg.add_alternative(html, subtype="html")

    try:
        if settings.smtp_port == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context, timeout=15) as s:
                if settings.smtp_user:
                    s.login(settings.smtp_user, settings.smtp_pass)
                s.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
                s.ehlo()
                if settings.smtp_port not in (25, 0):
                    s.starttls(context=ssl.create_default_context())
                if settings.smtp_user:
                    s.login(settings.smtp_user, settings.smtp_pass)
                s.send_message(msg)
        return True
    except Exception as exc:  # noqa: BLE001 - delivery is best-effort
        logger.warning("Email delivery to %s failed: %s", to, exc)
        return False


async def send_email(to: str, subject: str, html: str) -> None:
    """Send an HTML email. No-op-safe: errors are logged, never raised."""
    if not settings.smtp_host:
        logger.info("[email:dev] To=%s | Subject=%s\n%s", to, subject, _strip_html(html))
        return
    ok = await asyncio.to_thread(_send_smtp, to, subject, html)
    if not ok:
        logger.warning("Email to %s was not delivered (dev fallback).", to)
