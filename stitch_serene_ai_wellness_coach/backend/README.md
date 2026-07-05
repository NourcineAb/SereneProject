# Serene — Backend (FastAPI)

AI stress & anxiety coach API. Implements the **Serene** CBT agent, freemium gate,
auth, mood logging, streaks and dashboard stats.

> **LLM providers: Gemini + OpenRouter (free models) only.** No Claude/OpenAI direct.

## Stack
- FastAPI + Uvicorn
- PostgreSQL 16 (async SQLAlchemy 2.0 + asyncpg)
- JWT auth (python-jose) + bcrypt
- LLM via `httpx` → Gemini (`generativeLanguage`) or OpenRouter (`:free` models), with fallback

## Run with Docker (recommended)
```bash
cd backend
cp .env.example .env          # then fill GEMINI_API_KEY and/or OPENROUTER_API_KEY
docker compose up --build
```
API: http://localhost:8000 · Docs: http://localhost:8000/docs · Health: `/health`

## Run locally (no Docker)
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# point DATABASE_URL at a local Postgres, or use sqlite+aiosqlite for quick tests
uvicorn app.main:app --reload
```

## Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | – | Create account → JWT |
| POST | `/auth/login` | – | Login → JWT |
| GET  | `/auth/me` | ✓ | Current user |
| POST | `/chat` | ✓ | Talk to Serene (omit `session_id` to start a new session) |
| GET  | `/chat/sessions` | ✓ | List sessions |
| GET  | `/chat/sessions/{id}/messages` | ✓ | Session transcript |
| POST | `/mood` | ✓ | Log a mood (`score` 1–10, `label`) |
| GET  | `/mood` | ✓ | Mood history |
| GET  | `/progress` | ✓ | Streak, weekly sessions, avg mood, 7-day trend, anxiety Δ% |
| POST | `/billing/premium` | ✓ | Toggle premium (RevenueCat webhook in prod) |

## How the agent works
- `app/prompts.py` — the verbatim Serene system prompt + crisis keywords + technique tag parser.
- `app/services/coach.py` — injects live profile (name/streak/last mood/sessions), enforces the
  **crisis safety rule** (always refers to professional help, never blocked by paywall) and the
  **freemium gate** (`FREE_SESSIONS_PER_WEEK`, default 3 — blocks only *starting* a new session,
  never a mid-conversation message).
- `app/services/llm.py` — provider abstraction, primary set by `LLM_PRIMARY`, auto-fallback.

The model is told to append `[TECHNIQUE: box_breathing]` etc. on the last line; the backend
strips it and returns `technique` so the app can deep-link to the matching exercise screen.

## Safety
Crisis detection is keyword-based and intentionally conservative — it short-circuits the LLM and
returns emergency resources (FR 3114 / US 988). This is **not** a medical device; see disclaimers
in the app.
