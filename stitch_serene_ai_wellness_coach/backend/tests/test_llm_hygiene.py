"""Unit tests for the LLM hygiene layer: reasoning stripping, language-aware
demo fallback and the OpenRouter fail-fast chain. No network calls are made."""
from __future__ import annotations

import json

import httpx
import pytest
import pytest_asyncio

import app.services.llm as llm
from app.services.llm import _strip_leaked_reasoning


# ─── _strip_leaked_reasoning ─────────────────────────────────────────────────

class TestStripLeakedReasoning:
    def test_returns_clean_reply_untouched(self):
        out = llm._strip_leaked_reasoning("Inspire 4 secondes, retiens 4. Comment te sens-tu ?")
        assert out == "Inspire 4 secondes, retiens 4. Comment te sens-tu ?"

    def test_leading_reasoning_prefix_is_removed(self):
        leaked = (
            "The user says they're feeling anxious. I need to respond in French. "
            "Inspire 4 secondes, retiens 4. Comment te sens-tu ?"
        )
        out = llm._strip_leaked_reasoning(leaked)
        assert out.startswith("Inspire 4 secondes")
        assert "user" not in out.lower()

    def test_french_reasoning_block_is_removed(self):
        leaked = (
            "L'utilisateur demande de l'aide. Je dois utiliser une technique. "
            "Inspire doucement pendant 4 secondes."
        )
        out = llm._strip_leaked_reasoning(leaked)
        assert "utilisateur" not in out
        assert out.startswith("Inspire doucement")

    def test_thinking_tag_block_is_removed(self):
        leaked = (
            "<thinking>The user is anxious, apply box breathing.</thinking>\n"
            "Respire avec moi : inspire 4 secondes."
        )
        out = llm._strip_leaked_reasoning(leaked)
        assert "thinking" not in out
        assert out.startswith("Respire avec moi")

    def test_fully_reasoning_output_returns_empty(self):
        leaked = "Okay, the user just said they're anxious. Let me analyze this and craft a reply."
        out = llm._strip_leaked_reasoning(leaked)
        assert out == ""


# ─── Language detection ──────────────────────────────────────────────────────

class TestDetectLanguage:
    @pytest.mark.parametrize(
        ("msg", "expected"),
        [
            ("je suis anxieuse", "fr"),
            ("Je n'arrive pas à dormir", "fr"),
            ("I'm feeling stressed today", "en"),
            ("I can't sleep", "en"),
            ("أنا أشعر بالقلق", "ar"),
        ],
    )
    def test_detect(self, msg, expected):
        assert llm._detect_language(msg) == expected


# ─── _demo_generate (offline fallback) ───────────────────────────────────────

_GENERIC_PHRASES = (
    "Je t'écoute. Peux-tu m'en dire un peu plus",
    "I'm listening. Could you tell me a bit more",
    "أنا أستمع إليك. هل يمكنك إخباري المزيد",
)


def _assert_not_generic(out: str) -> None:
    for p in _GENERIC_PHRASES:
        assert p not in out, f"Generic filler response returned: {out!r}"


class TestDemoGenerate:
    @pytest.mark.parametrize(
        ("msg", "tag", "needle"),
        [
            ("je suis anxieuse", "box_breathing", "inspire"),
            ("je ne peux pas me concentrer", "box_breathing", "pause"),
            ("mal à l'aise", "grounding_54321", "5-4-3-2-1"),
            ("je suis fatiguée", "box_breathing", "micro-pause"),
            ("I'm stressed", "box_breathing", "breathe"),
            ("أنا أشعر بالقلق", "box_breathing", "استنشق"),
        ],
    )
    @pytest.mark.asyncio
    async def test_mandatory_messages_are_concrete_and_earmarked(self, msg, tag, needle):
        """The offline coach must react to the actual message, propose a real
        action, keep the technique tag, use the right language, and never fall
        back to the generic filler."""
        out = await llm._demo_generate("", [{"role": "user", "content": msg}])
        assert f"[TECHNIQUE: {tag}]" in out, f"{msg!r} -> {out!r}"
        assert needle in out.lower(), f"{msg!r} expected {needle!r} in {out!r}"
        assert llm._detect_language(out) == llm._detect_language(msg)
        _assert_not_generic(out)
        assert _strip_leaked_reasoning(out) == out  # no reasoning leaks

    @pytest.mark.parametrize(
        ("msg", "needle"),
        [
            ("je ne peux pas concentrer comme il faut", "pause"),
            ("mal a l'aise", "5-4-3-2-1"),
            ("ça va pas", "inspire"),
            ("stress", "inspire"),
            ("je veux m'amuser", "danse"),
            ("avance", ""),
        ],
    )
    @pytest.mark.asyncio
    async def test_loosely_typed_messages_still_get_a_useful_reply(self, msg, needle):
        """Short or fuzzy messages must not systematically produce the generic
        'm'en dire plus' reply."""
        out = await llm._demo_generate("", [{"role": "user", "content": msg}])
        _assert_not_generic(out)
        assert "[TECHNIQUE:" not in out or len(out) > 40  # still a full reply
        if needle:
            assert needle in out.lower(), f"{msg!r} expected {needle!r} in {out!r}"

    @pytest.mark.asyncio
    async def test_replies_in_french_for_french_input(self):
        out = await llm._demo_generate("", [{"role": "user", "content": "je suis anxieuse"}])
        assert "inspire" in out
        assert "[TECHNIQUE: box_breathing]" in out

    @pytest.mark.asyncio
    async def test_replies_in_english_for_english_input(self):
        out = await llm._demo_generate("", [{"role": "user", "content": "I'm feeling stressed today"}])
        assert "[TECHNIQUE: box_breathing]" in out
        assert "breathe" in out

    @pytest.mark.asyncio
    async def test_replies_in_arabic_for_arabic_input(self):
        out = await llm._demo_generate("", [{"role": "user", "content": "أنا أشعر بالقلق"}])
        assert "[TECHNIQUE: box_breathing]" in out
        assert "استنشق" in out  # 'inhale' present

    @pytest.mark.asyncio
    async def test_anxious_knows_feminine_form(self):
        # Regression: "anxieuse" was not matched before, so it fell back to the
        # generic greeting instead of the breathing exercise.
        out = await llm._demo_generate("", [{"role": "user", "content": "je suis anxieuse"}])
        assert "[TECHNIQUE: box_breathing]" in out

    @pytest.mark.asyncio
    async def test_fallback_rotates_and_is_not_a_single_repeat(self):
        replies = {
            await llm._demo_generate("", [{"role": "user", "content": m}])
            for m in ("bon", "ok", "ensuite", "voilà", "hum", "rien")
        }
        assert len(replies) >= 2, f"fallback is always the same reply: {replies}"
        for out in replies:
            _assert_not_generic(out)

    @pytest.mark.asyncio
    async def test_short_reply_reuses_conversation_context(self):
        # "avance" alone is meaningless; the coach must look at the earlier
        # message ("stress") and keep proposing the breathing exercise.
        history = [
            {"role": "user", "content": "j'ai beaucoup de stress au travail"},
            {"role": "assistant", "content": "Respire avec moi."},
            {"role": "user", "content": "avance"},
        ]
        out = await llm._demo_generate("", history)
        assert "[TECHNIQUE: box_breathing]" in out
        _assert_not_generic(out)

    @pytest.mark.asyncio
    async def test_fun_intent_is_light_and_not_context_leaked(self):
        # A clear playful message must get its own light reply, NOT inherit the
        # previous (focus/anxiety) topic from the conversation context.
        history = [
            {"role": "user", "content": "je ne peux pas concentrer comme il faut"},
            {"role": "assistant", "content": "Pause deux minutes."},
            {"role": "user", "content": "je veux m'amuser"},
        ]
        out = await llm._demo_generate("", history)
        assert "[TECHNIQUE:" not in out  # no wellness technique for fun
        assert "danse" in out.lower() or "chanson" in out.lower()
        _assert_not_generic(out)


# ─── _call_openrouter payload construction ───────────────────────────────────

class TestCallOpenRouterPayload:
    @pytest.mark.asyncio
    async def test_reasoning_disabled_and_max_tokens_raised(self, monkeypatch):
        """The request must ask the provider to skip CoT (reasoning off) and no
        longer starve ``content`` with a tiny 256-token budget."""

        captured: list[dict] = []

        def _handler(request):
            payload = json.loads(request.content)
            captured.append(payload)
            return httpx.Response(
                200,
                json={
                    "choices": [{"message": {"content": "Inspire 4 secondes."}}],
                    "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
                },
            )

        transport = httpx.MockTransport(_handler)
        _RealClient = llm.httpx.AsyncClient

        def _fake_client(*a, **k):
            timeout = k.pop("timeout", None)
            return _RealClient(transport=transport, timeout=timeout)

        monkeypatch.setattr(llm.httpx, "AsyncClient", _fake_client)
        monkeypatch.setattr(llm.settings, "openrouter_api_key", "sk-or-v1-not-a-real-key-1234567890abcdef")

        result = await llm._call_openrouter("sys", [{"role": "user", "content": "salut"}])
        assert result.content == "Inspire 4 secondes."
        assert len(captured) == 1
        assert captured[0]["reasoning"] == {"effort": "none"}
        assert captured[0]["max_tokens"] == 512


# ─── generate() fail-fast on quota exhaustion ────────────────────────────────

class TestGenerateQuotaFailFast:
    @pytest.mark.asyncio
    async def test_429_quota_breaks_chain_and_uses_demo(self, monkeypatch):
        """On account-wide 'free-models-per-day' 429, stop probing remaining
        free models immediately and return the clean offline demo reply."""

        calls: list[str] = []

        async def _fake_call(system, history):
            calls.append("openrouter")

            raise llm.LLMError(
                "Error (429) on inclusionai/ling-3.0-flash-sante:free: "
                '{"message":"Rate limit exceeded: free-models-per-day"} '
                "| tried: inclusionai/ling-3.0-flash-sante:free"
            )

        monkeypatch.setattr(llm, "_call_openrouter", _fake_call)
        monkeypatch.setattr(llm.settings, "openrouter_api_key", "sk-or-v1-not-a-real-key-1234567890abcdef")
        monkeypatch.setattr(llm, "_is_real_key", lambda key: True)

        report: dict = {}
        out = await llm.generate("sys", [{"role": "user", "content": "je suis anxieuse"}], report=report)
        assert "[TECHNIQUE: box_breathing]" in out
        assert report["status"] == "error"
        assert "free-models-per-day" in str(report.get("error", ""))
        assert len(calls) == 1  # single attempt, then demo — never churns the chain