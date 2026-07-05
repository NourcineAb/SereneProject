# Serene Backend — Security Notes

Findings from the internal audit, and their status. **Serene handles sensitive
mental-health PII** (mood, free-text chat) — treat the "remaining" items as blockers
before any production / live gate.

## Fixed
| ID | Severity | Issue | Fix |
|---|---|---|---|
| C1 | Critical | Forgeable JWTs from a default secret | `config.py` refuses to boot when `ENVIRONMENT=production` and `JWT_SECRET` is weak/default/<32 chars |
| C2 | Critical | `POST /billing/premium` let any user self-grant premium (paywall bypass) | Gated behind `ALLOW_MOCK_BILLING` (forced `false` in prod); real entitlements come only from the verified `/webhooks/revenuecat` |
| H1 | High | 7-day non-revocable tokens, no logout | Short-lived access tokens (30 min) + long-lived refresh tokens (30 days); `token_version` column on User; `POST /auth/refresh` and `POST /auth/logout` (bumps token_version, invalidates all outstanding tokens immediately) |
| H2 | High | LLM provider error strings leaked to clients in 503 | Provider detail is now logged server-side; client gets a generic message |
| H3 | High | No rate limiting on `/auth/*` and `/chat` | SlowAPI per-IP limits: login 5/min, register 3/min, chat 20/min; configurable via `RATE_LIMIT_*` env vars; disabled in tests via `RATE_LIMIT_ENABLED=false` |
| H4 | High | `CORS=*` + credentials | Production validator rejects `CORS_ORIGINS=*` |
| M2 | Medium | No account deletion / export / retention (RGPD Art. 15/17/20) | `DELETE /auth/me` (cascade-deletes user + sessions + messages + mood logs), `GET /auth/me/export` (full JSON export); User→Session and User→MoodLog relationships configured with `cascade="all, delete-orphan"` |
| M3 | Medium | Chat/mood stored plaintext | App-layer Fernet encryption via SQLAlchemy `TypeDecorator` on `Message.content` and `MoodLog.note`; key from `FIELD_ENCRYPTION_KEY` env var; required in production; ephemeral dev key generated when unset |

## Remaining (recommended before launch)
| ID | Severity | Issue | Suggested fix |
|---|---|---|---|
| M1 | Medium | **Keyword-only crisis detection** | High-recall floor only; add a classifier; always surface resources on any risk signal; **clinician review** of the keyword list & `CRISIS_REPLY` |
| M4 | Medium | Email enumeration on register (409) | Neutral response / rate-limit |
| L1 | Low | Dockerfile runs as root | Add a non-root `USER` |
| L2 | Low | `--reload` + bind-mount in compose | Separate `docker-compose.prod.yml`, immutable image |
| L4 | Low | Prompt injection can neutralize the in-prompt crisis RULE | Crisis enforcement already lives in code (`coach.py`), not just the prompt — keep it there; validate the technique tag against the enum |

## Verified safe
- IDOR: cross-user session/message access returns 404 (ownership checks in `coach.py` + `chat.py`); covered by a regression test.
- Mass assignment: `is_premium` cannot be set via `register` or any input schema (only mock/webhook paths).
- SQL injection: all queries use parameterized SQLAlchemy expressions.
- Crisis safety bypasses the freemium gate (a user in crisis is never paywalled).
- Token revocation: `token_version` on User is checked on every authenticated request; logout increments it.
- Field encryption: `Message.content` and `MoodLog.note` are Fernet-encrypted at rest; encryption is transparent to all callers.
