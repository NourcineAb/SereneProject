"""Unit tests for the LLM hygiene layer: reasoning stripping, language-aware
demo fallback and the OpenRouter fail-fast chain. No network calls are made."""
from __future__ import annotations

import json

import httpx
import pytest
import pytest_asyncio

import app.services.llm as llm


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

class TestDemoGenerate:
    @pytest.mark.asyncio
    async def test_replies_in_french_for_french_input(self):
        out = await llm._demo_generate("", [{"role": "user", "content": "je suis anxieuse"}])
        assert "respiration" in out or "Respire" in out
        assert "[TECHNIQUE: box_breathing]" in out

    @pytest.mark.asyncio
    async def test_replies_in_english_for_english_input(self):
        out = await llm._demo_generate("", [{"role": "user", "content": "I'm feeling stressed today"}])
        assert "[TECHNIQUE: box_breathing]" in out
        assert any(w in out for w in ["inhale", "breath", "breathe"])

    @pytest.mark.asyncio
    async def test_replies_in_arabic_for_arabic_input(self):
        out = await llm._demo_generate("", [{"role": "user", "content": "أنا أشعر بالقلق"}])
        assert "[TECHNIQUE: box_breathing]" in out
        assert "\u062a\u0646\u0641\u0633" in out  # التنفس (breath) present

    @pytest.mark.asyncio
    async def test_anxious_knows_feminine_form(self):
        # Regression: "anxieuse" was not matched before, so it fell back to the
        # generic greeting instead of the breathing exercise.
        out = await llm._demo_generate("", [{"role": "user", "content": "je suis anxieuse"}])
        assert "[TECHNIQUE: box_breathing]" in out


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