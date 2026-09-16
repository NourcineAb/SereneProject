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
    if not cleaned:
        return text.strip()
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


async def _demo_generate(system: str, history: list[dict]) -> str:
    """Offline coaching reply used when no real LLM key is configured.

    Keeps the full chat flow working in development (sessions, techniques,
    UI) without an external API. Replace with a real key to use a live model.
    """
    last_user = ""
    user_turns = 0
    for m in history:
        if m["role"] == "user":
            user_turns += 1
            last_user = m["content"]
    low = last_user.lower()

    technique = None
    if any(w in low for w in ["anxieux", "anxiety", "stress", "panique", "panic",
                              "angoisse", "nerveux", "tension"]):
        technique = "box_breathing"
        reply = (
            "Je t'entends. Quand le stress monte, on peut le calmer en quelques minutes. "
            "On essaie la respiration carrée ? Inspire 4 secondes, bloque 4, expire 4, "
            "bloque 4, et on répète 4 fois. Dis-moi comment tu te sens après."
        )
    elif any(w in low for w in ["triste", "sad", "seul", "lonely", "déprimé",
                                "deprime", "vide", "seule"]):
        technique = "journaling"
        reply = (
            "Merci de partager ça avec moi. Parfois, mettre les mots à l'extérieur aide. "
            "Si tu veux, écris trois phrases sur ce que tu ressens en ce moment, sans filtre. "
            "Je suis là pour t'écouter."
        )
    elif any(w in low for w in ["colère", "anger", "énervé", "enerve", "frustré",
                                "frustre", "agacé", "agace"]):
        technique = "pmr"
        reply = (
            "La frustration crée souvent beaucoup de tension dans le corps. Essayons un "
            "relâchement musculaire progressif : contracte fort les épaules 5 secondes, "
            "puis lâche d'un coup. Répète sur chaque partie du corps. Qu'en penses-tu ?"
        )
    elif any(w in low for w in ["pensées", "thoughts", "négatif", "negative",
                                "culpabilité", "guilt", "doute"]):
        technique = "cognitive_reframing"
        reply = (
            "Ces pensées ont l'air tenaces. Si on les regardait de plus près : quelle preuve "
            "as-tu qu'elles sont vraies ? Et si un ami te disait la même chose, que lui "
            "répondrais-tu ?"
        )
    else:
        if user_turns <= 1:
            reply = (
                "Bonjour, je suis Serene. Je suis ravie d'être là avec toi. Comment tu te "
                "sens en ce moment, et qu'est-ce qui occupe ton esprit aujourd'hui ?"
            )
        else:
            reply = (
                "Je t'écoute. Peux-tu m'en dire un peu plus sur ce que tu ressens ? On avance "
                "à ton rythme."
            )

    if technique:
        reply += f"\n[TECHNIQUE: {technique}]"
    return reply


TIMEOUT = httpx.Timeout(10.0, connect=5.0)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class LLMError(RuntimeError):
    pass


def _to_openai_messages(system: str, history: list[dict]) -> list[dict]:
    return [{"role": "system", "content": system}, *history]


# Ordered list of free OpenRouter models, fastest & cleanest first. The primary
# model is always tried first; on failure the next models in this list are tried
# in order. All are :free tier — no credits required.
#
# Order chosen from live latency probes (Sept 2026): the first two respond in
# ~6-9s with direct, reasoning-free replies. The last model (nemotron ultra) is
# a slow emergency fallback only.
_OPENROUTER_FREE_MODELS = (
    "inclusionai/ling-3.0-flash-sante:free",
    "poolside/laguna-xs-2.1:free",
    "poolside/laguna-s-2.1:free",
    "google/gemma-4-26b-a4b-it:free",
    "google/gemma-4-31b-it:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
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
                "max_tokens": 256,
                "temperature": 0.7,
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
        return _strip_leaked_reasoning(result.content)
    except Exception as e:  # noqa: BLE001
        # OpenRouter completely failed — fall back to offline demo coach so
        # the chat flow still works instead of returning a hard 503 to the
        # client.
        logger.error("OpenRouter failed (%s); using offline demo mode.", e)
        _finish("error", error=str(e))
        return await _demo_generate(system, history)
