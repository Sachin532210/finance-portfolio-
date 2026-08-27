from __future__ import annotations

import logging
from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Declarative base shared by every model."""


def _engine_kwargs() -> dict:
    if settings.DB_ENGINE.lower() == "sqlite":
        return {"connect_args": {"check_same_thread": False}}

    kwargs: dict = {
        "pool_pre_ping": True,
        "pool_recycle": 3600,
        "pool_size": 10,
        "max_overflow": 20,
    }

    if settings.db_use_ssl:
        ca = settings.db_ssl_ca_path
        if settings.DB_ENGINE.lower() in {"mysql", "mariadb"}:
            # PyMySQL enables TLS as soon as an `ssl` mapping is present, and
            # supplying a CA turns on certificate verification with it.
            kwargs["connect_args"] = {"ssl": {"ca": ca}}
        else:
            kwargs["connect_args"] = {"sslmode": "require"}
        logger.info("Database TLS enabled (CA: %s).", ca)

    return kwargs


engine: Engine = create_engine(settings.sqlalchemy_url, echo=False, future=True, **_engine_kwargs())

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


def ensure_database_exists() -> None:
    """
    Creates the database if it is missing.

    Keeps first-run setup to a single command instead of asking the user to
    open a SQL shell before the app will start.

    On managed hosts (TiDB Cloud, Aiven, Neon) the database already exists and
    the account usually cannot issue CREATE DATABASE. That is not an error, so
    a reachable target database wins over a failed create.
    """
    if settings.DB_ENGINE.lower() == "sqlite":
        return
    try:
        # Same TLS settings as the main engine - a managed host rejects the
        # plaintext handshake here too.
        server_engine = create_engine(
            settings.server_url,
            future=True,
            isolation_level="AUTOCOMMIT",
            connect_args=_engine_kwargs().get("connect_args", {}),
        )
        with server_engine.connect() as conn:
            if settings.DB_ENGINE.lower() in {"mysql", "mariadb"}:
                conn.execute(
                    text(
                        f"CREATE DATABASE IF NOT EXISTS `{settings.DB_NAME}` "
                        "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                    )
                )
            else:
                exists = conn.execute(
                    text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": settings.DB_NAME}
                ).scalar()
                if not exists:
                    conn.execute(text(f'CREATE DATABASE "{settings.DB_NAME}"'))
        server_engine.dispose()
        logger.info("Database '%s' is ready.", settings.DB_NAME)
    except Exception as exc:  # pragma: no cover - surfaced to the operator
        # Fall back to checking whether the database is simply already there.
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info(
                "Database '%s' already exists (CREATE DATABASE was not permitted, which is "
                "normal on a managed host).",
                settings.DB_NAME,
            )
            return
        except Exception:
            logger.error("Could not reach or create database '%s': %s", settings.DB_NAME, exc)
            raise


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: one session per request, always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
