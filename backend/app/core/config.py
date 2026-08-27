from __future__ import annotations

from functools import lru_cache
from typing import List
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration, loaded from environment / backend/.env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- App ---------------------------------------------------------------
    APP_NAME: str = "Finance Track API"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # --- Database ----------------------------------------------------------
    # Components are assembled into a URL so special characters in the
    # password (e.g. "@") are escaped correctly.
    DB_ENGINE: str = "mysql"
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "root"
    DB_PASSWORD: str = ""
    DB_NAME: str = "finance_track"
    # Set this to override the assembled URL entirely (e.g. for PostgreSQL).
    DATABASE_URL: str | None = None
    # TLS for the database connection. Managed hosts (TiDB Cloud, Aiven,
    # PlanetScale) require it on their public endpoints; a local MySQL usually
    # has no certificate. Leave unset to decide from the host - see `db_use_ssl`.
    DB_SSL: bool | None = None
    # Optional path to a CA bundle. Empty means "use certifi", which is what
    # every major managed host is signed against.
    DB_SSL_CA: str = ""

    # --- Auth --------------------------------------------------------------
    SECRET_KEY: str = "change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days

    # --- CORS --------------------------------------------------------------
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- AI ----------------------------------------------------------------
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    AI_RATE_LIMIT_PER_MINUTE: int = 10
    AI_RATE_LIMIT_PER_DAY: int = 200

    # --- Market data -------------------------------------------------------
    MARKET_DATA_PROVIDER: str = "finnhub"
    MARKET_DATA_API_KEY: str = ""

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def sqlalchemy_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        password = quote_plus(self.DB_PASSWORD)
        user = quote_plus(self.DB_USER)
        if self.DB_ENGINE.lower() in {"mysql", "mariadb"}:
            return (
                f"mysql+pymysql://{user}:{password}@{self.DB_HOST}:{self.DB_PORT}/"
                f"{self.DB_NAME}?charset=utf8mb4"
            )
        if self.DB_ENGINE.lower() in {"postgres", "postgresql"}:
            return f"postgresql+psycopg://{user}:{password}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        if self.DB_ENGINE.lower() == "sqlite":
            return f"sqlite:///./{self.DB_NAME}.db"
        raise ValueError(f"Unsupported DB_ENGINE: {self.DB_ENGINE}")

    @property
    def server_url(self) -> str:
        """Same server, no database selected - used to CREATE DATABASE."""
        password = quote_plus(self.DB_PASSWORD)
        user = quote_plus(self.DB_USER)
        if self.DB_ENGINE.lower() in {"mysql", "mariadb"}:
            return f"mysql+pymysql://{user}:{password}@{self.DB_HOST}:{self.DB_PORT}/?charset=utf8mb4"
        if self.DB_ENGINE.lower() in {"postgres", "postgresql"}:
            return f"postgresql+psycopg://{user}:{password}@{self.DB_HOST}:{self.DB_PORT}/postgres"
        return self.sqlalchemy_url

    @property
    def db_use_ssl(self) -> bool:
        """
        Whether to open the database connection over TLS.

        Explicit DB_SSL always wins. Otherwise: anything that is not a local
        server is assumed to be a managed host that requires TLS, which is the
        safe default - an unencrypted connection over the internet would put
        the password and every row on the wire in clear text.
        """
        if self.DB_SSL is not None:
            return self.DB_SSL
        if self.DB_ENGINE.lower() == "sqlite":
            return False
        return self.DB_HOST.lower() not in {"localhost", "127.0.0.1", "::1", ""}

    @property
    def db_ssl_ca_path(self) -> str:
        if self.DB_SSL_CA:
            return self.DB_SSL_CA
        import certifi

        return certifi.where()

    @property
    def ai_enabled(self) -> bool:
        return bool(self.OPENAI_API_KEY.strip())

    @property
    def market_data_enabled(self) -> bool:
        return bool(self.MARKET_DATA_API_KEY.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
