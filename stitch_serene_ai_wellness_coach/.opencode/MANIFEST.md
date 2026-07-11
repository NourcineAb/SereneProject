# Serene Agent System — Manifest

## Entry Point
**orchestrator** — `.opencode/agents/orchestrator.md`

All feature work flows through the orchestrator. It receives tasks, builds dependency graphs, dispatches subagents, and validates results.

---

## Active Agents

| Agent | File | Type | Scope |
|-------|------|------|-------|
| orchestrator | `agents/orchestrator.md` | Entry Point | Routes tasks, builds graphs, validates, summarizes |
| architecture-agent | `agents/architecture-agent.md` | [STANDARD] | Structural decisions across frontend/backend |
| design-agent | `agents/design-agent.md` | [STANDARD] | UI/UX for React/Expo screens, theming, dark mode |
| frontend-implementation-agent | `agents/frontend-implementation-agent.md` | [STANDARD] | New Expo screens, components, navigation |
| backend-implementation-agent | `agents/backend-implementation-agent.md` | [STANDARD] | New FastAPI endpoints, models, services |
| api-integration-agent | `agents/api-integration-agent.md` | [STANDARD] | Frontend-backend contract, API client, typing |
| state-management-agent | `agents/state-management-agent.md` | [STANDARD] | React Context wiring, AsyncStorage, state patterns |
| localization-agent | `agents/localization-agent.md` | [STANDARD] | i18n string externalization, fr/en/ar translations |
| testing-agent | `agents/testing-agent.md` | [STANDARD] | pytest (backend), Jest/RNTL (frontend), coverage |
| bug-fixer-agent | `agents/bug-fixer-agent.md` | [STANDARD] | Issue fixes during implementation (not legacy bugs) |
| documentation-agent | `agents/documentation-agent.md` | [STANDARD] | Docstrings, OpenAPI docs, user/dev docs (FR primary) |
| release-agent | `agents/release-agent.md` | [STANDARD] | Versioning, changelog, build config, EAS/Docker |
| security-hardening-agent | `agents/security-hardening-agent.md` | [CUSTOM] | Email service, endpoint auth, encryption at rest |

---

## Bound Skills → Agent Mapping

| Skill | Agent | Classification |
|-------|-------|---------------|
| python-fastapi-development | backend-implementation-agent, architecture-agent, bug-fixer-agent | KEEP |
| fastapi-pro | backend-implementation-agent, architecture-agent | KEEP |
| python-testing-patterns | testing-agent, backend-implementation-agent | KEEP |
| react-best-practices | design-agent, frontend-implementation-agent, state-management-agent, localization-agent | KEEP |
| react-native-skills | frontend-implementation-agent, design-agent, localization-agent, state-management-agent, bug-fixer-agent | KEEP |
| typescript-expert | architecture-agent, api-integration-agent, release-agent, bug-fixer-agent | KEEP |
| expo-deployment | release-agent | KEEP |
| postgresql-optimization | backend-implementation-agent | KEEP |
| postgres-best-practices | backend-implementation-agent | KEEP |
| tdd-workflow | testing-agent | KEEP |
| test-driven-development | testing-agent | KEEP |
| test-automator | testing-agent | KEEP |
| security-audit | security-hardening-agent | KEEP |
| security-and-hardening | security-hardening-agent | KEEP |
| api-security-testing | security-hardening-agent, api-integration-agent | KEEP |
| performance-optimization | (available for future use) | KEEP |
| web-performance-optimization | (available for future use) | KEEP |
| llm-application-dev-langchain-agent | (available for future use) | KEEP |
| prisma-expert | — | ARCHIVED (project uses SQLAlchemy, not Prisma) |

---

## Archived Skills

| Skill | Reason |
|-------|--------|
| prisma-expert | Project uses SQLAlchemy async ORM with Alembic, not Prisma |

---

## Custom Agent Justification

**security-hardening-agent**: The project scan identified three concrete security gaps not covered by the standard 11 roles:
1. Password reset and email verification tokens are logged server-side instead of being emailed (backend auth.py)
2. `/push/daily-checkin` endpoint has no authentication (backend integrations.py)
3. `EncryptedText` type is defined but unused by any model (backend encryption.py)

These are security-specific implementation tasks that would overload the `backend-implementation-agent` if folded into its scope, and they require specialized knowledge of the security patterns in `security.py`, `encryption.py`, and `deps.py`.

---

## Orchestration Flow

```
User Task
    ↓
[orchestrator] — classify task type
    ↓
[orchestrator] — build dependency graph
    ↓
[orchestrator] — dispatch agents in order
    ↓
┌─ architecture-agent → defines structure
├─ backend-implementation-agent → builds endpoints
├─ api-integration-agent → syncs contracts
├─ frontend-implementation-agent → builds screens
├─ design-agent → designs layouts (parallel with api-integration)
├─ state-management-agent → wires state
├─ localization-agent → externalizes strings
├─ security-hardening-agent → hardens security
├─ testing-agent → writes tests
├─ bug-fixer-agent → fixes issues (on demand)
├─ documentation-agent → writes docs
└─ release-agent → prepares release
    ↓
[orchestrator] — final validation (pytest + tsc)
    ↓
[orchestrator] — consolidated summary → user
```

---

## File Structure

```
.opencode/
├── agents/
│   ├── orchestrator.md              ← ENTRY POINT
│   ├── architecture-agent.md
│   ├── design-agent.md
│   ├── frontend-implementation-agent.md
│   ├── backend-implementation-agent.md
│   ├── api-integration-agent.md
│   ├── state-management-agent.md
│   ├── localization-agent.md
│   ├── testing-agent.md
│   ├── bug-fixer-agent.md
│   ├── documentation-agent.md
│   ├── release-agent.md
│   └── security-hardening-agent.md   ← CUSTOM
├── archived/
│   └── skills/
│       └── prisma-expert.md
├── skills/
│   ├── fastapi-backend/              (empty — see .claude/skills for antigravity)
│   ├── react-native-expo/
│   ├── security-audit/
│   └── tdd-workflow/
└── MANIFEST.md                       ← THIS FILE
```
