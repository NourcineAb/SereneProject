from functools import lru_cache

from pydantic import ValidationError, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_WEAK_SECRETS = {
    "",
    "change-me",
    "change-me-to-a-long-random-string",
    "dev-only-not-secret-change-me",
}

_VALID_LLM_PRIMARY = {"gemini", "openrouter", "nvidia"}


def _env_bool(value, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # "development" | "production". In production a weak JWT secret refuses to boot.
    environment: str = "development"

    # Database
    database_url: str = "postgresql+asyncpg://serene:serene@db:5432/serene"

    # Auth
    jwt_secret: str = "change-me"
    jwt_expire_minutes: int = 30          # access token lifetime (minutes)
    refresh_token_expire_days: int = 30   # refresh token lifetime (days)
    access_token_algo: str = "HS256"

    # LLM backend
    llm_primary: str = "gemini"  # "gemini" | "openrouter" | "nvidia"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    openrouter_api_key: str = ""
    openrouter_model: str = "meta-llama/llama-3.3-70b-instruct:free"
    nvidia_api_key: str = ""
    nvidia_model: str = "stepfun-ai/step-3.7-flash"
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1/chat/completions"

    # Freemium / monetization. "iap" | "ads" | "both".
    monetization_mode: str = "iap"
    free_sessions_per_week: int = 3
    premium_price_label: str = "$4.99/month"

    # RevenueCat webhook
    revenuecat_webhook_secret: str = ""

    # Dev-only: allow the client-callable /billing/premium mock. MUST be false in prod.
    allow_mock_billing: bool = True

    # CORS
    cors_origins: str = "*"

    # Rate limiting — requests per window. Set high or disable in test env.
    rate_limit_login: str = "5/minute"
    rate_limit_register: str = "3/minute"
    rate_limit_chat: str = "20/minute"
    # Set RATE_LIMIT_ENABLED=false to bypass all rate limits (used in tests).
    rate_limit_enabled: bool = True

    # Field-level encryption (Fernet base64 key). Required in production.
    # Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    field_encryption_key: str = ""

    # Email / SMTP delivery. Left empty in development — emails are logged instead
    # of sent. Set these (e.g. via Mailgun/SendGrid SMTP or a local relay) so
    # password-reset and email-verification links are actually delivered.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    email_from: str = "Serene <no-reply@serene.app>"
    app_base_url: str = "http://localhost:8081"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}

    @model_validator(mode="after")
    def _harden_production(self) -> "Settings":
        if self.is_production:
            if self.jwt_secret in _WEAK_SECRETS or len(self.jwt_secret) < 32:
                raise ValueError(
                    "ENVIRONMENT=production requires a strong JWT_SECRET "
                    "(>=32 chars, not a default). Generate one: "
                    "python -c 'import secrets; print(secrets.token_urlsafe(48))'"
                )
            if _env_bool(self.allow_mock_billing, False):
                raise ValueError("ALLOW_MOCK_BILLING must be false in production.")
            if "*" in self.cors_list:
                raise ValueError("CORS_ORIGINS must be an explicit allow-list in production.")
            primary_key = getattr(self, f"{self.llm_primary}_api_key")
            if not primary_key:
                raise ValueError(
                    f"ENVIRONMENT=production requires {self.llm_primary.upper()}_API_KEY to be set."
                )
            if not self.field_encryption_key:
                raise ValueError(
                    "ENVIRONMENT=production requires FIELD_ENCRYPTION_KEY to be set. "
                    "Generate: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
                )
        if self.llm_primary not in _VALID_LLM_PRIMARY:
            raise ValueError(
                f"LLM_PRIMARY must be one of {sorted(_VALID_LLM_PRIMARY)}, got {self.llm_primary!r}"
            )
        return self


@lru_cache
def get_settings() -> "Settings":
    try:
        return Settings()
    except ValidationError as exc:
        missing = [
            err.get("loc", [""])[0]
            for err in exc.errors()
            if err.get("type") == "value_error.missing"
        ]
        if missing:
            raise RuntimeError(
                "Missing required backend env vars: " + ", ".join(missing)
            ) from exc
        raise


settings = get_settings()
