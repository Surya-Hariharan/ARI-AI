from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "ARI Control Plane"
    API_V1_STR: str = "/api/v1"
    
    # ─── Security ───────────────────────────────────────────
    SECRET_KEY: str = "YOUR_SECRET_KEY"  # TODO: Change in production
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Auth provider: "local" (JWT) or "keycloak" (OIDC)
    AUTH_PROVIDER: str = "local"
    
    # Secret key rotation — tracks when the key was last rotated
    SECRET_KEY_ROTATION_INTERVAL_HOURS: int = 720  # 30 days
    
    # ─── Keycloak (OIDC) ───────────────────────────────────
    KEYCLOAK_SERVER_URL: str = ""   # e.g. https://auth.example.com
    KEYCLOAK_REALM: str = ""        # e.g. ari
    KEYCLOAK_CLIENT_ID: str = ""    # e.g. ari-control-plane
    
    # ─── Database ──────────────────────────────────────────
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "password"
    POSTGRES_DB: str = "ari"
    SQLALCHEMY_DATABASE_URI: Optional[str] = None

    # ─── Redis ─────────────────────────────────────────────
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    
    # ─── Groq Intelligence ─────────────────────────────────
    GROQ_API_KEY: str = ""  # Set in .env
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    
    # ─── Execution Agent Signing ───────────────────────────
    AGENT_SIGNING_KEY: str = "change-this-to-a-strong-random-key"  # Global fallback
    
    # ─── CORS ──────────────────────────────────────────────
    # Comma-separated list of allowed origins. Use "*" for dev only.
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    
    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.SQLALCHEMY_DATABASE_URI:
            self.SQLALCHEMY_DATABASE_URI = f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}/{self.POSTGRES_DB}"

    @property
    def cors_origin_list(self) -> list[str]:
        """Parses CORS_ORIGINS string into a list."""
        if self.CORS_ORIGINS == "*":
            return ["*"]
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

settings = Settings()
