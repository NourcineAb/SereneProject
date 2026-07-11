"""Basic content moderation for user messages.

Checks for potentially harmful content before it is sent to the LLM.
This is a lightweight keyword-based filter — for production use, consider
integrating a dedicated moderation API (OpenAI Moderations, Google Perspective, etc.).
"""
from __future__ import annotations

import re

# Patterns that indicate potential misuse (not crisis — those are handled by the crisis system).
_MODERATION_PATTERNS = [
    # Prompt injection attempts
    (r"ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|rules?|prompts?)", "prompt_injection"),
    (r"you\s+are\s+now\s+(a|an|the)", "prompt_injection"),
    (r"system\s*prompt", "prompt_injection"),
    (r"jailbreak", "prompt_injection"),
    # Spam / self-promotion
    (r"https?://\S+", "external_link"),
    (r"(buy|sell|discount|offer|promo|free\s+money)", "spam"),
    # Hate speech indicators (basic)
    (r"(kill|murder|harm)\s+(all|every)\s+(people|humans|men|women)", "hate_speech"),
]

# Maximum message length to prevent abuse.
MAX_MESSAGE_LENGTH = 2000


class ModerationResult:
    def __init__(self, allowed: bool, reason: str | None = None):
        self.allowed = allowed
        self.reason = reason

    def __bool__(self) -> bool:
        return self.allowed


def moderate_message(text: str) -> ModerationResult:
    """Check a user message for policy violations.

    Returns a ModerationResult with allowed=True if the message is OK,
    or allowed=False with a reason if it should be blocked.
    """
    if not text or not text.strip():
        return ModerationResult(allowed=False, reason="empty_message")

    if len(text) > MAX_MESSAGE_LENGTH:
        return ModerationResult(allowed=False, reason="message_too_long")

    # Check for prompt injection patterns.
    text_lower = text.lower()
    for pattern, reason in _MODERATION_PATTERNS:
        if re.search(pattern, text_lower):
            # Allow external links (they're common in casual conversation)
            # but flag them for logging.
            if reason == "external_link":
                continue
            return ModerationResult(allowed=False, reason=reason)

    return ModerationResult(allowed=True)
