"""LLM provider abstraction — OpenRouter (single provider).

All chat completions go through OpenRouter's OpenAI-compatible API.
Automatic fallback across curated free models ensures the wellness flow
never breaks due to upstream rate limits or outages.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass

import httpx

from ..config import settings
from .demo_coach import _demo_generate, _detect_language  # noqa: F401  (re-exported for tests)

logger = logging.getLogger("serene.llm")


# ── Reasoning-pattern cleanup (safety net) ──────────────────────────────────
# Some free models leak internal reasoning despite prompt instructions.
# We strip common reasoning phrases (English + French) that appear at the
# START of a reply, plus any markdown-style <thinking>/<reasoning> blocks.

_REASONING_MARKERS = (
    # English: third-person reasoning about "the user"
    "the user just said",
    "the user just wrote",
    "the user just asked",
    "the user mentioned",
    "the user is asking",
    "the user is saying",
    "the user is expressing",
    "the user said",
    "the user wrote",
    "the user needs",
    "the user wants",
    "the user is",
    "the user",
    "i need to respond",
    "i need to address",
    "i should respond",
    "i should address",
    "i think the user",
    "let me check",
    "let me think",
    "let me consider",
    "let me analyze",
    "let me address",
    "let's help",
    "here's a thinking",
    "here's my reasoning",
    "first, i need",
    "first, let me",
    "since the user",
    "since they",
    "maybe the user",
    "okay, so",
    "okay, the user",
    "so, the user",
    "according to the guidelines",
    "according to the instructions",
    "according to the prompt",
    "based on the guidelines",
    # French: third-person reasoning about "l'utilisateur"
    "l'utilisateur vient de dire",
    "l'utilisateur vient d'écrire",
    "l'utilisateur a dit",
    "l'utilisateur demande",
    "l'utilisateur a besoin",
    "l'utilisateur veut",
    "l'utilisateur est",
    "l'utilisateur",
    "je dois d'abord",
    "je dois maintenant",
    "je dois répondre",
    "je dois utiliser",
    "je vais répondre",
    "je vais utiliser",
    "il faut que je",
    "voyons",
    "réfléchissons",
    "d'abord, je dois",
    "selon les règles",
    "selon les directives",
    "selon les consignes",
    "attendez,",
)

_THINKING_BLOCK = re.compile(r"<(thinking|reasoning|scratchpad)[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)

# Split lines at sentence boundaries so we can cut reasoning fragments while
# keeping the actual reply, even when both share a single line.
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+|\u2014\s+|\u2013\s+")

_LEADING_NOISE = " \t\r\n\"'*_•-–—«»()[]"


def _starts_with_reasoning(text: str) -> bool:
    low = text.lower().lstrip(_LEADING_NOISE)
    return any(low.startswith(m) for m in _REASONING_MARKERS)


def _trim_reasoning_line(line: str) -> str:
    """Cut leading reasoning sentences from ``line``, keep the rest."""
    fragments = [f.strip() for f in _SENTENCE_SPLIT.split(line.strip()) if f.strip()]
    kept: list[str] = []
    for frag in fragments:
        if not kept and _starts_with_reasoning(frag):
            continue
        kept.append(frag)
    return " ".join(kept)


def _strip_leaked_reasoning(text: str) -> str:
    """Remove reasoning prefixes that some models prepend to their output."""
    cleaned = _THINKING_BLOCK.sub("", text)
    out_lines: list[str] = []
    skipped_leading = True
    for line in cleaned.splitlines():
        stripped = line.strip()
        if not stripped:
            out_lines.append(line)
            continue
        if skipped_leading and _starts_with_reasoning(stripped):
            trimmed = _trim_reasoning_line(stripped)
            if trimmed and not _starts_with_reasoning(trimmed):
                out_lines.append(trimmed)
                skipped_leading = False
            continue
        skipped_leading = False
        out_lines.append(line)
    cleaned = "\n".join(out_lines).strip()
    return cleaned

# Keys containing these substrings are treated as unfilled placeholders, not
# real credentials. This lets the app detect "no real key configured" and fall
# back to offline demo mode instead of emitting a confusing 503.
_PLACEHOLDER_MARKERS = (
    "your-", "change-me", "example", "placeholder", "xxx", "<",
    "your_api", "sk-or-v1-your",
)


def _is_real_key(value: str) -> bool:
    if not value:
        return False
    return not any(m in value.strip().lower() for m in _PLACEHOLDER_MARKERS)


TIMEOUT = httpx.Timeout(8.0, connect=4.0)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class LLMError(RuntimeError):
    pass


def _to_openai_messages(system: str, history: list[dict]) -> list[dict]:
    return [{"role": "system", "content": system}, *history]


# Ordered list of free OpenRouter models, fastest & cleanest first. The primary
# model is always tried first; on failure the next models in this list are tried
# in order. All are :free tier — no credits required.
#
# All selected models return their final answer in ``message.content`` and keep
# any chain-of-thought in the separate ``message.reasoning`` field (never
# concatenated). Models that leak reasoning INTO ``content`` or answer slowly
# (e.g. the long-gone nemotron-3-ultra at 14-29s) are deliberately excluded:
# failing over to the offline demo is faster and cleaner than serving a slow,
# reasoning-leaked reply to the mobile client (12s timeout).
_OPENROUTER_FREE_MODELS = (
    "inclusionai/ling-3.0-flash-sante:free",
    "poolside/laguna-xs-2.1:free",
    "poolside/laguna-s-2.1:free",
    "google/gemma-4-26b-a4b-it:free",
    "google/gemma-4-31b-it:free",
)


@dataclass
class LLMResult:
    content: str
    model: str | None = None
    usage: dict | None = None


async def _call_openrouter(system: str, history: list[dict]) -> LLMResult:
    if not settings.openrouter_api_key:
        raise LLMError("OPENROUTER_API_KEY not set")
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "HTTP-Referer": "https://serene.app",
        "X-Title": "Serene Wellness Coach",
    }
    messages = _to_openai_messages(system, history)
    candidates = [settings.openrouter_model] + [
        m for m in _OPENROUTER_FREE_MODELS if m != settings.openrouter_model
    ]
    last_err = None
    models_tried = []
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for model in candidates:
            models_tried.append(model)
            payload = {
                "model": model,
                "messages": messages,
                "max_tokens": 512,
                "temperature": 0.7,
                # Ask the provider to skip the chain-of-thought step entirely.
                # Reasoning tokens used to starve ``max_tokens`` so ``content``
                # came back empty and the request failed over — and reasoning
                # that lands in ``content`` leaks the model's internal analysis
                # to the user. Supported by all providers in our chain.
                "reasoning": {"effort": "none"},
            }
            # One attempt per model — no in-model retries, no sleeps. Fail over
            # immediately so a stuck/rate-limited model never delays the reply.
            try:
                r = await client.post(OPENROUTER_URL, headers=headers, json=payload)
            except httpx.TimeoutException:
                last_err = f"Timeout on {model}"
                logger.warning("LLM timeout on %s, failing over", model)
                continue
            except httpx.ConnectError as e:
                last_err = f"Connection error on {model}: {e}"
                logger.warning("LLM connection error on %s, failing over", model)
                continue
            except httpx.HTTPError as e:
                last_err = f"HTTP error on {model}: {e}"
                logger.warning("LLM HTTP error on %s, failing over", model)
                continue

            if r.status_code == 401:
                raise LLMError("OpenRouter 401: invalid API key")
            if r.status_code >= 400:
                last_err = f"Error ({r.status_code}) on {model}: {r.text[:200]}"
                logger.warning("LLM %d on %s, failing over", r.status_code, model)
                # 429 "free-models-per-day" = account-wide daily free quota
                # exhausted. All :free models share this quota, so the remaining
                # candidates would also 429. Break immediately so the request
                # finishes with the offline demo in time for the 12s mobile
                # timeout rather than burning seconds on guaranteed-to-fail
                # calls.
                if r.status_code == 429 and "free-models-per-day" in r.text:
                    logger.warning("Free-models-per-day quota exhausted; stopping chain")
                    break
                continue
            data = r.json()
            try:
                content = (data["choices"][0]["message"].get("content") or "").strip()
                if not content:
                    last_err = f"Empty content from {model}"
                    logger.warning("LLM empty content on %s, failing over", model)
                    continue
                usage = data.get("usage") or {}
                logger.info("LLM success on model=%s", model)
                return LLMResult(content=content, model=model, usage=usage)
            except (KeyError, IndexError, AttributeError) as e:
                last_err = f"Unexpected response from {model}: {data}"
                raise LLMError(last_err) from e
    raise LLMError(
        f"{last_err or 'OpenRouter: all models exhausted'} | tried: {', '.join(models_tried)}"
    )


async def generate(system: str, history: list[dict], *, report: dict | None = None) -> str:
    """Call OpenRouter with automatic model fallback.

    If no real key is configured, fall back to offline demo mode so
    the chat flow keeps working in development.

    This function NEVER raises — if all OpenRouter models fail, it falls
    back to the offline demo coach so the chat flow still works.

    ``report`` is an optional mutable dict that gets populated with the real
    metrics of the call (model, latency_ms, tokens, status, error) so the
    backoffice AI monitoring page can record real usage data.
    """
    started = time.perf_counter()

    def _finish(status: str, model: str | None = None, error: str | None = None, usage: dict | None = None) -> None:
        if report is None:
            return
        report["status"] = status
        report["model"] = model
        report["latency_ms"] = int((time.perf_counter() - started) * 1000)
        if usage:
            report["prompt_tokens"] = usage.get("prompt_tokens")
            report["completion_tokens"] = usage.get("completion_tokens")
            report["total_tokens"] = usage.get("total_tokens")
        if error:
            report["error"] = error

    if not _is_real_key(settings.openrouter_api_key):
        logger.warning("No real OpenRouter key configured; using offline demo mode.")
        _finish("success", model="offline-demo")
        return await _demo_generate(system, history)
    try:
        result = await _call_openrouter(system, history)
        _finish("success", model=result.model, usage=result.usage)
        cleaned = _strip_leaked_reasoning(result.content)
        if not cleaned:
            # The reply was entirely leaked reasoning — never surface it. Fall
            # back to a clean offline coaching reply instead.
            logger.warning("LLM reply was all reasoning; using offline demo reply")
            return await _demo_generate(system, history)
        return cleaned
    except Exception as e:  # noqa: BLE001
        # OpenRouter completely failed — fall back to offline demo coach so
        # the chat flow still works instead of returning a hard 503 to the
        # client.
        logger.error("OpenRouter failed (%s); using offline demo mode.", e)
        _finish("error", error=str(e))
        return await _demo_generate(system, history)
