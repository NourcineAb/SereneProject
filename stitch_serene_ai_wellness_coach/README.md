# Serene — AI Wellness Coach 🌿

A mobile mental-health companion: the user describes how they feel, and **Serene**
(an AI coach grounded in CBT + mindfulness) listens, identifies the stressor, and
guides them through ONE technique — box breathing, 5-4-3-2-1 grounding, cognitive
reframing, PMR, or journaling. Built from the Stitch _Serene_ design.

```
┌────────────┐  chat / état  ┌──────────────┐  API   ┌──────────────┐  prompt  ┌──────────────────────┐
│ Utilisateur│ ─────────────▶ │  App mobile  │ ─────▶ │   Backend    │ ───────▶ │ LLM: Gemini /        │
│ iOS/Android│                │ Expo / RN    │        │ FastAPI      │          │ OpenRouter (free)    │
└────────────┘                │ Chat·Exos·   │        │ Auth·Rate    │          └──────────────────────┘
                              │ Session timer │        │ Paywall gate │
                              └──────┬───────┘        └──────┬───────┘
                          RevenueCat │                       │  Postgres (profil · sessions · mood · streak)
                          Expo Push  │                       ▼
                                     ▼                 ┌──────────────┐
                                                       │  PostgreSQL  │
                                                       └──────────────┘
```

> **LLM policy:** Gemini + OpenRouter **free** models only — no Claude/OpenAI direct.

## Repository layout

| Folder                                                  | What                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `backend/`                                              | FastAPI + Postgres + Docker. Serene agent, auth, mood, streaks, freemium gate. |
| `app-mobile/`                                           | Expo / React Native app — the 5 Serene screens + Serene design system.         |
| `serene_design_system/`, `*_/code.html`                 | Original Stitch design source (reference).                                     |
| `.claude/`, `.claude-flow/`, `.mcp.json`, `ruvector.db` | **ruflo** agent environment (see below).                                       |

## Quickstart

```bash
# 1) Backend + DB
cd backend && cp .env.example .env      # add GEMINI_API_KEY and/or OPENROUTER_API_KEY
docker compose up --build               # → http://localhost:8081/docs

# 2) Mobile app (separate terminal)
cd ../app-mobile && npm install && cp .env.example .env
npx expo start                          # i / a / w
```

Or run everything at once from the repo root: `docker compose up --build`
(Postgres + API + Expo web preview on :19006).

## The Serene agent

- Full system prompt lives in `backend/app/prompts.py` (verbatim product spec).
- Dynamic profile (name, streak, last mood, weekly sessions) is injected per request.
- **Crisis safety rule** always overrides — self-harm keywords short-circuit the LLM and
  return professional resources (FR 3114 / US 988), never blocked by the paywall.
- **Freemium gate**: `FREE_SESSIONS_PER_WEEK` (default 3). Blocks only _starting_ a new
  session past the limit, never a mid-conversation reply.

## ruflo agent environment

Prepared with [ruvnet/ruflo](https://github.com/ruvnet/ruflo) (`claude-flow` V3):
`npx @claude-flow/cli@latest init --preset standard` created `.claude/` (agents,
skills, commands, hooks), `.mcp.json` (the `claude-flow` MCP server), `.claude-flow/`
(config/data/logs) and the `ruvector.db` RuVector memory store. Requires Node ≥ 20.

## Status / next

- [x] ruflo agent environment (`.mcp.json`, 17 agents, RuVector memory)
- [x] Backend (FastAPI, Serene agent, freemium gate, crisis safety, Docker) — **verified booting**
- [x] Mobile app (5 screens, Serene design system) — `tsc --noEmit` clean
- [x] Backend test suite — **21 passing** (`backend/tests/`, sqlite + mocked LLM)
- [x] RevenueCat wiring (flagged client + verified `/webhooks/revenuecat`; mock fallback for Expo Go)
- [x] Expo push notifications (token registration → `/push/register`)
- [x] Chat-history hydration on the Chat screen
- [x] Security audit + top fixes (C1 JWT secret, C2 paywall bypass, H2 error leak, L1 non-root) — see `backend/SECURITY.md`
- [x] Monetization: ads (AdMob) **or** IAP (RevenueCat) **or** both, switchable in `.env`
- [x] **Deploy-ready & build-verified**: backend prod compose, mobile web nginx image (built + served), EAS native config — see `DEPLOY.md`
- [ ] Before launch: rate limiting, refresh tokens, account deletion/RGPD, PII encryption, clinician review of crisis detection (`backend/SECURITY.md`)
- [ ] CI pipeline

**Disclaimer:** Serene is not a medical device and does not replace professional care.
In crisis: **3114** (France) · **988** (US).
