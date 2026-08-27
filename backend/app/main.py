from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, OperationalError

from app.api.v1 import api_router
from app.core.config import settings
from app.core.constants import DISCLAIMER
from app.db.session import Base, engine, ensure_database_exists

logging.basicConfig(
    level=logging.INFO if settings.DEBUG else logging.WARNING,
    format="%(asctime)s  %(levelname)-8s %(name)s  %(message)s",
)
logger = logging.getLogger("finance-track")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Import the model package so every table is registered on Base before
    # create_all runs.
    import app.models  # noqa: F401

    logger.info("Connecting to %s at %s:%s", settings.DB_ENGINE, settings.DB_HOST, settings.DB_PORT)
    ensure_database_exists()
    Base.metadata.create_all(bind=engine)
    logger.info("Database ready (%s tables).", len(Base.metadata.tables))
    logger.info("AI coach: %s", "OpenAI" if settings.ai_enabled else "built-in rule engine")
    logger.info(
        "Market data: %s", settings.MARKET_DATA_PROVIDER if settings.market_data_enabled else "disabled"
    )
    yield
    engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description=(
        "Backend for Finance Track - salary planning, budgeting, savings, investments, debt "
        f"and an AI financial coach.\n\n**{DISCLAIMER}**"
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,  # required for the httpOnly session cookie
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# ---------------------------------------------------------------------------
# Error handling - the client always receives a predictable JSON shape and
# never a database error string.
# ---------------------------------------------------------------------------

@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        field = ".".join(str(p) for p in err.get("loc", []) if p not in ("body", "query"))
        errors.append({"field": field or "request", "message": err.get("msg", "Invalid value")})
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": errors[0]["message"] if errors else "Invalid request", "errors": errors},
    )


@app.exception_handler(IntegrityError)
async def integrity_handler(request: Request, exc: IntegrityError):
    logger.warning("Integrity error on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": "That record already exists or conflicts with an existing one."},
    )


@app.exception_handler(OperationalError)
async def operational_handler(request: Request, exc: OperationalError):
    logger.error("Database error on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": "The database is unavailable. Check that MySQL is running."},
    )


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": str(exc)
            if settings.DEBUG
            else "Something went wrong. Please try again."
        },
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/", tags=["health"])
def root():
    return {
        "name": settings.APP_NAME,
        "version": "1.0.0",
        "docs": "/docs",
        "api": settings.API_V1_PREFIX,
        "disclaimer": DISCLAIMER,
    }


@app.get("/health", tags=["health"])
def health():
    from sqlalchemy import text

    db_ok = True
    db_error = None
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        db_ok = False
        db_error = str(exc)

    return {
        "status": "ok" if db_ok else "degraded",
        "database": {
            "connected": db_ok,
            "engine": settings.DB_ENGINE,
            "name": settings.DB_NAME,
            "error": db_error,
        },
        "ai_enabled": settings.ai_enabled,
        "market_data_enabled": settings.market_data_enabled,
    }
