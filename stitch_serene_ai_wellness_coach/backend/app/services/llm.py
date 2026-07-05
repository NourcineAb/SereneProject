"""LLM provider abstraction — Gemini + OpenRouter + NVIDIA NIM.

Primary provider is configurable. On any error, it falls back to another
configured provider so a missing key never kills the wellness flow.
"""

from __future__ import annotations

import httpx

from ..config import settings

TIMEOUT = httpx.Timeout(60.0, connect=10.0)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class LLMError(RuntimeError):
    pass


def _to_openai_messages(system: str, history: list[dict]) -> list[dict]:
    return [{"role": "system", "content": system}, *history]


async def _call_openrouter(system: str, history: list[dict]) -> str:
    if not settings.openrouter_api_key:
        raise LLMError("OPENROUTER_API_KEY not set")
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "HTTP-Referer": "https://serene.app",
        "X-Title": "Serene Wellness Coach",
    }
    payload = {
        "model": settings.openrouter_model,
        "messages": _to_openai_messages(system, history),
        "max_tokens": 512,
        "temperature": 0.7,
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.post(OPENROUTER_URL, headers=headers, json=payload)
        if r.status_code == 401:
            raise LLMError("OpenRouter 401: invalid API key")
        if r.status_code == 429:
            raise LLMError("OpenRouter 429: rate limit / free tier busy")
        if r.status_code >= 400:
            raise LLMError(f"OpenRouter {r.status_code}: {r.text[:500]}")
        data = r.json()
    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError) as e:
        raise LLMError(f"OpenRouter unexpected response: {data}") from e


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
    """Try the configured primary provider, then all fallbacks."""
    order = [settings.llm_primary] + [p for p in _PROVIDERS if p != settings.llm_primary]
    last_err: Exception | None = None
    # Only fall back over providers that actually have a key configured.
    configured = [name for name in order if settings.model_dump().get(f"{name}_api_key")]
    if not configured:
        raise LLMError("No LLM provider configured: please set an API key for at least one provider.")
    for name in configured:
        try:
            return await _PROVIDERS[name](system, history)
        except Exception as e:  # noqa: BLE001
            last_err = e
            continue
    raise LLMError(f"All LLM providers failed; last error: {last_err}")
