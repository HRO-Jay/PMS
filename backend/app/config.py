"""
Payroll Management System — Application Configuration
Reads settings from environment variables / .env file.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "case_sensitive": True}

    # ---------- App ----------
    APP_NAME: str = "Payroll Management System"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    # ---------- Supabase ----------
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    DATABASE_URL: str = ""

    # ---------- Redis (Upstash) ----------
    REDIS_URL: str = "redis://localhost:6379"

    # ---------- JWT ----------
    JWT_SECRET: str = "replace-with-a-32-byte-random-hex-string"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 60

    # ---------- AES Encryption ----------
    AES_KEY: str = "replace-with-a-32-byte-random-hex-string"

    # ---------- CORS ----------
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
