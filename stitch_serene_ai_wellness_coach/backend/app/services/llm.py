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


async def _demo_generate(system: str, history: list[dict]) -> str:
    """Offline coaching reply used when no real LLM key is configured or
    OpenRouter is unavailable / quota exhausted.

    Keeps the full chat flow working (sessions, techniques, UI) without an
    external API. Replies in the language of the user's last message.
    """
    last_user = ""
    user_turns = 0
    for m in history:
        if m["role"] == "user":
            user_turns += 1
            last_user = m["content"]
    low = last_user.lower()
    lang = _detect_language(last_user)

    technique = None
    if any(w in low for w in ["anxieux", "anxieuse", "anxiety", "stress", "panique", "panic",
                              "angoisse", "nerveux", "nerveuse", "tension", "dormir",
                              "sleep", "insomnia", "le sommeil", "قلق", "القلق", "توتر", "أرق"]):
        technique = "box_breathing"
        reply = _LANG_REPLIES[lang]["box_breathing"]
    elif any(w in low for w in ["triste", "sad", "seul", "lonely", "déprimé",
                                "deprime", "depressed", "vide", "seule", "حزين", "وحيد", "اكتئاب"]):
        technique = "journaling"
        reply = _LANG_REPLIES[lang]["journaling"]
    elif any(w in low for w in ["colère", "anger", "énervé", "enerve", "frustré",
                                "frustre", "frustrated", "agacé", "agace", "غاضب", "إحباط"]):
        technique = "pmr"
        reply = _LANG_REPLIES[lang]["pmr"]
    elif any(w in low for w in ["pensées", "thoughts", "négatif", "negative",
                                "culpabilité", "guilt", "doute", "confused", "أفكار", "ذنب"]):
        technique = "cognitive_reframing"
        reply = _LANG_REPLIES[lang]["cognitive_reframing"]
    else:
        if user_turns <= 1:
            reply = _LANG_REPLIES[lang]["greeting"]
        else:
            reply = _LANG_REPLIES[lang]["followup"]

    if technique:
        reply += f"\n[TECHNIQUE: {technique}]"
    return reply


_ARP = "\u0600-\u06FF"

_ENG_HINTS = (
    " i ", " i'm ", " i am ", "the ", "feeling ", "can't ", "dont ", "sleep",
    "help ", "me ", "you ", "and ", "please ",
)

_FR_HINTS = (
    " je ", " je suis ", " j'ai ", " ne ", " pas ", " dans ", " avec ",
    " dormir ", " s'il ", " aidez ",
)


def _detect_language(text: str) -> str:
    """Return 'fr', 'en' or 'ar' for the user's message (fr = default)."""
    if re.search(f"[{_ARP}]", text):
        return "ar"
    low = " " + text.lower() + " "
    fr = sum(1 for h in _FR_HINTS if h in low)
    en = sum(1 for h in _ENG_HINTS if h in low)
    if en > fr:
        return "en"
    return "fr"


_LANG_REPLIES: dict[str, dict[str, str]] = {
    "fr": {
        "box_breathing": (
            "Je t'entends. Quand le stress monte, on peut le calmer en quelques minutes. "
            "On essaie la respiration carrée ? Inspire 4 secondes, bloque 4, expire 4, "
            "bloque 4, et on répète 4 fois. Dis-moi comment tu te sens après."
        ),
        "journaling": (
            "Merci de partager ça avec moi. Parfois, mettre les mots à l'extérieur aide. "
            "Si tu veux, écris trois phrases sur ce que tu ressens en ce moment, sans filtre. "
            "Je suis là pour t'écouter."
        ),
        "pmr": (
            "La frustration crée souvent beaucoup de tension dans le corps. Essayons un "
            "relâchement musculaire progressif : contracte fort les épaules 5 secondes, "
            "puis lâche d'un coup. Répète sur chaque partie du corps. Qu'en penses-tu ?"
        ),
        "cognitive_reframing": (
            "Ces pensées ont l'air tenaces. Si on les regardait de plus près : quelle preuve "
            "as-tu qu'elles sont vraies ? Et si un ami te disait la même chose, que lui "
            "répondrais-tu ?"
        ),
        "greeting": (
            "Bonjour, je suis Serene. Je suis ravie d'être là avec toi. Comment tu te sens "
            "en ce moment, et qu'est-ce qui occupe ton esprit aujourd'hui ?"
        ),
        "followup": (
            "Je t'écoute. Peux-tu m'en dire un peu plus sur ce que tu ressens ? On avance "
            "à ton rythme."
        ),
    },
    "en": {
        "box_breathing": (
            "I hear you. When stress builds up, we can ease it in a few minutes. "
            "Want to try square breathing? Inhale for 4 seconds, hold for 4, exhale for 4, "
            "hold for 4 — repeat four times. Tell me how you feel after."
        ),
        "journaling": (
            "Thank you for sharing that with me. Sometimes putting words outside helps. "
            "If you'd like, write three sentences about what you're feeling right now, "
            "with no filter. I'm here to listen."
        ),
        "pmr": (
            "Frustration often builds a lot of tension in the body. Let's try progressive "
            "muscle relaxation: clench your shoulders hard for 5 seconds, then let go all "
            "at once. Repeat over each body part. What do you think?"
        ),
        "cognitive_reframing": (
            "Those thoughts feel stubborn. Let's look closer: what evidence do you have "
            "they're true? And if a friend told you the same thing, what would you tell them?"
        ),
        "greeting": (
            "Hi, I'm Serene. I'm glad to be here with you. How are you feeling right now, "
            "and what's on your mind today?"
        ),
        "followup": (
            "I'm listening. Could you tell me a bit more about what you're feeling? "
            "We'll go at your own pace."
        ),
    },
    "ar": {
        "box_breathing": (
            "أستمع إليك. عندما يتراكم التوتر، يمكننا تهدئته في دقائق. نجرب التنفس المربع؟ "
            "استنشق لمدة 4 ثوانٍ، احبس النفس 4 ثوانٍ، أخرج الهواء 4 ثوانٍ، ثم احبس 4 ثوانٍ — "
            "وكرر أربع مرات. أخبرني كيف تشعر بعدها."
        ),
        "journaling": (
            "شكرًا لمشاركة هذا معي. أحيانًا يساعد إخراج الكلمات إلى الخارج. إذا أردت، "
            "اكتب ثلاث جمل عن ما تشعر به الآن دون أي تصفية. أنا هنا لأستمع إليك."
        ),
        "pmr": (
            "الإحباط غالبًا ما يبني توترًا كبيرًا في الجسم. لنجرب استرخاء العضلات التدريجي: "
            "شدّ كتفيك بقوة لمدة 5 ثوانٍ، ثم أرخِهما دفعة واحدة. كرر ذلك مع كل جزء من الجسم. "
            "ما رأيك؟"
        ),
        "cognitive_reframing": (
            "تلك الأفكار تبدو عنيدة. لننظر إليها عن قرب: ما الدليل الذي تملكه على صحتها؟ "
            "ولو قال لك صديق نفس الشيء، ماذا كنت ستجيب عليه؟"
        ),
        "greeting": (
            "مرحبًا، أنا سيرين. سعيدة بأن أكون معك. كيف تشعر الآن، وما الذي يشغل بالك اليوم؟"
        ),
        "followup": (
            "أنا أستمع إليك. هل يمكنك إخباري المزيد عما تشعر به؟ نتقدم على إيقاعك الخاص."
        ),
    },
}


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
