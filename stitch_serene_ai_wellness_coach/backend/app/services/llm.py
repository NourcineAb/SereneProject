"""LLM provider abstraction — OpenRouter (single provider).

All chat completions go through OpenRouter's OpenAI-compatible API.
Automatic fallback across curated free models ensures the wellness flow
never breaks due to upstream rate limits or outages.
"""

from __future__ import annotations

import asyncio
import logging

import httpx

from ..config import settings

logger = logging.getLogger("serene.llm")

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


TIMEOUT = httpx.Timeout(20.0, connect=8.0)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class LLMError(RuntimeError):
    pass


def _to_openai_messages(system: str, history: list[dict]) -> list[dict]:
    return [{"role": "system", "content": system}, *history]


# Ordered list of free OpenRouter models. The primary model is always tried
# first; on failure the next models in this list are tried in order.
# All three are :free tier — no credits required.
_OPENROUTER_FREE_MODELS = (
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "poolside/laguna-m.1:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
)


async def _call_openrouter(system: str, history: list[dict]) -> str:
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
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for model in candidates:
            payload = {
                "model": model,
                "messages": messages,
                "max_tokens": 512,
                "temperature": 0.7,
            }
            # One immediate try + a single short retry on a transient 429, then
            # fail over to the next free model (faster than retrying one model).
            for attempt in range(2):
                r = await client.post(OPENROUTER_URL, headers=headers, json=payload)
                if r.status_code == 401:
                    raise LLMError("OpenRouter 401: invalid API key")
                if r.status_code == 429 and attempt == 0:
                    await asyncio.sleep(1.5)
                    continue
                if r.status_code == 429:
                    last_err = f"OpenRouter 429 on {model}"
                    break
                if r.status_code >= 400:
                    last_err = f"OpenRouter {r.status_code} on {model}: {r.text[:200]}"
                    break
                data = r.json()
                try:
                    return data["choices"][0]["message"]["content"].strip()
                except (KeyError, IndexError) as e:
                    raise LLMError(f"OpenRouter unexpected response: {data}") from e
    raise LLMError(last_err or "OpenRouter: all free models rate-limited")


async def generate(system: str, history: list[dict]) -> str:
    """Call OpenRouter with automatic model fallback.

    If no real key is configured, fall back to offline demo mode so
    the chat flow keeps working in development.
    """
    if not _is_real_key(settings.openrouter_api_key):
        logger.warning("No real OpenRouter key configured; using offline demo mode.")
        return await _demo_generate(system, history)
    try:
        return await _call_openrouter(system, history)
    except Exception as e:  # noqa: BLE001
        # OpenRouter completely failed — fall back to offline demo coach so
        # the chat flow still works instead of returning a hard 503 to the
        # client.
        logger.error("OpenRouter failed (%s); using offline demo mode.", e)
        return await _demo_generate(system, history)
