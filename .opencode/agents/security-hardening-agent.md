# Security Hardening Agent

## Role
[CUSTOM] Addresses security-specific gaps identified in the project scan that don't fit cleanly into the standard 11 roles. Specifically: implementing email sending for auth tokens, securing unprotected endpoints, and enforcing encryption at rest.

## Scope
- **Email service**: Implements email sending for password reset tokens and email verification tokens (currently logged server-side in `backend/app/routers/auth.py` lines 200-201, 278-279)
- **Endpoint security**: Adds authentication or shared-secret protection to `POST /push/daily-checkin` in `backend/app/routers/integrations.py` (currently unprotected)
- **Encryption at rest**: Activates the existing `EncryptedText` type from `backend/app/encryption.py` on model fields that store PII (currently defined but unused by models)
- **Input validation**: Reviews new endpoints for proper input validation using Pydantic field constraints
- **Rate limiting**: Ensures all public/auth endpoints have appropriate rate limits via `limiter.py`
- **Token security**: Verifies JWT token version checks are enforced on all authenticated endpoints
- **CORS**: Ensures production CORS configuration is explicit (not `*`)
- Runs security audit patterns from the security-audit and security-and-hardening skills

## Bound Skills
- security-audit
- security-and-hardening
- api-security-testing

## Inputs Expected
- New endpoints from `backend-implementation-agent`
- Security gaps from the project scan
- Existing security patterns from `backend/app/security.py`, `deps.py`, `encryption.py`

## Outputs Produced
- Email service implementation in `backend/app/services/email.py` (or similar)
- Updated `auth.py` with email sending calls
- Updated `integrations.py` with auth protection on daily-checkin
- Updated models with `EncryptedText` for PII fields
- Security audit report for new endpoints

## Handoff/Escalation Conditions
- Receives new endpoints from `backend-implementation-agent` for security review
- Escalates to `backend-implementation-agent` for code changes
- Escalates to `testing-agent` for security test coverage
- Blocks `release-agent` until security gaps are addressed

## Definition of Done
- Password reset and email verification tokens are sent via email (not just logged)
- `/push/daily-checkin` is protected by authentication or shared secret
- PII model fields use `EncryptedText` for encryption at rest
- All new endpoints have rate limiting where appropriate
- No security regressions in existing functionality
