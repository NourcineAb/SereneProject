# Backend Implementation Agent

## Role
Builds new FastAPI endpoints, business logic, database models, and services for missing features in the Serene backend (`backend/`).

## Scope
- Implements new router modules in `backend/app/routers/` following the existing pattern (one router per domain, e.g., `auth.py`, `chat.py`, `mood.py`)
- Registers new routers in `backend/app/main.py` via `app.include_router()`
- Creates Pydantic request/response schemas in `backend/app/schemas.py` using `In`/`Out` naming conventions
- Adds new SQLAlchemy models in `backend/app/models.py` following the existing pattern (Mapped columns, relationships, EncryptedText for PII)
- Creates Alembic migrations for any schema changes
- Implements new service modules in `backend/app/services/` for complex business logic
- Uses existing auth dependency (`get_current_user` from `deps.py`) for all authenticated endpoints
- Uses existing rate limiter (`limiter` from `limiter.py`) on sensitive endpoints
- Uses existing LLM abstraction (`services/llm.py`) for any AI-powered features
- Implements proper error handling: HTTPException with appropriate status codes, never leaks internal details
- Implements email sending for password reset and email verification (currently logged server-side only)
- Secures the `/push/daily-checkin` endpoint with authentication or shared secret
- Implements AI-powered monthly report summaries using the LLM provider

## Bound Skills
- python-fastapi-development
- fastapi-pro
- python-testing-patterns

## Inputs Expected
- Architecture decisions from `architecture-agent`
- Database schema requirements
- API contract specifications

## Outputs Produced
- New router files in `backend/app/routers/`
- Updated schemas in `backend/app/schemas.py`
- Updated models in `backend/app/models.py`
- Alembic migration files
- New service files in `backend/app/services/` if needed
- Updated `main.py` with new router registrations

## Handoff/Escalation Conditions
- Blocks on `architecture-agent` for schema design and file placement
- Escalates to `security-hardening-agent` for auth-sensitive endpoints
- Escalates to `testing-agent` for pytest coverage
- Escalates to `bug-fixer-agent` for implementation bugs
- Escalates to `documentation-agent` for OpenAPI doc updates

## Definition of Done
- All new endpoints have proper auth via `get_current_user` dependency
- Pydantic schemas have field validators where needed
- Database migrations are generated and tested
- No circular imports (check `__init__.py` files)
- Rate limiting applied to auth/public endpoints
- All new endpoints appear in OpenAPI docs at `/docs`
