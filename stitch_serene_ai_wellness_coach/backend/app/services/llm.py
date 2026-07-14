"""LLM provider abstraction — Gemini + OpenRouter + NVIDIA NIM.

Primary provider is configurable. On any error, it falls back to another
configured provider so a missing key never kills the wellness flow.
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

TIMEOUT = httpx.Timeout(60.0, connect=10.0)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class LLMError(RuntimeError):
    pass


def _to_openai_messages(system: str, history: list[dict]) -> list[dict]:
    return [{"role": "system", "content": system}, *history]


# Curated list of *free* OpenRouter models (no credits required), ordered by
# chat quality. OpenRouter's free tier is often *transiently* rate-limited
# upstream per-model, so we fail over across this list. These are general
# instruction-tuned chat models (no chain-of-thought leakage). The configured
# model is always tried first.
_OPENROUTER_FREE_MODELS = (
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3-nano-30b-a3b:free",
    "openrouter/free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "nvidia/nemotron-nano-9b-v2:free",
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


async def _call_gemini(system: str, history: list[dict]) -> str:
    if not settings.gemini_api_key:
        raise LLMError("GEMINI_API_KEY not set")
    contents = []
    for m in history:
        role = "model" if m["role"] == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": m["content"]}]})
    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 512},
    }
    url = GEMINI_URL.format(model=settings.gemini_model)
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.post(url, params={"key": settings.gemini_api_key}, json=payload)
        if r.status_code >= 400:
            raise LLMError(f"Gemini {r.status_code}: {r.text[:500]}")
        data = r.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError) as e:
        raise LLMError(f"Gemini unexpected response: {data}") from e


async def _call_nvidia(system: str, history: list[dict]) -> str:
    if not settings.nvidia_api_key:
        raise LLMError("NVIDIA_API_KEY not set")
    headers = {
        "Authorization": f"Bearer {settings.nvidia_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.nvidia_model,
        "messages": _to_openai_messages(system, history),
        "max_tokens": 512,
        "temperature": 0.7,
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.post(settings.nvidia_base_url, headers=headers, json=payload)
        if r.status_code == 401:
            raise LLMError("NVIDIA 401: invalid API key")
        if r.status_code == 429:
            raise LLMError("NVIDIA 429: rate limit")
        if r.status_code >= 400:
            raise LLMError(f"NVIDIA {r.status_code}: {r.text[:500]}")
        data = r.json()
    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError) as e:
        raise LLMError(f"NVIDIA unexpected response: {data}") from e


_PROVIDERS = {
    "gemini": _call_gemini,
    "openrouter": _call_openrouter,
    "nvidia": _call_nvidia,
}


async def generate(system: str, history: list[dict]) -> str:
    """Try the configured primary provider, then all fallbacks.

    If no real provider key is configured, fall back to offline demo mode so
    the chat flow keeps working in development.
    """
    order = [settings.llm_primary] + [p for p in _PROVIDERS if p != settings.llm_primary]
    last_err: Exception | None = None
    # Only fall back over providers that have a *real* key configured (skip
    # placeholder/template values that would otherwise fail with 401/400).
    configured = [name for name in order if _is_real_key(getattr(settings, f"{name}_api_key"))]
    if not configured:
        logger.warning("No real LLM key configured; using offline demo mode.")
        return await _demo_generate(system, history)
    for name in configured:
        try:
            return await _PROVIDERS[name](system, history)
        except Exception as e:  # noqa: BLE001
            last_err = e
            continue
    # Every configured provider failed (invalid key, quota, or free-tier busy).
    # Fall back to the offline demo coach so the chat flow still works instead
    # of returning a hard 503 to the client.
    logger.error(
        "All LLM providers failed (last error: %s); using offline demo mode.",
        last_err,
    )
    return await _demo_generate(system, history)
