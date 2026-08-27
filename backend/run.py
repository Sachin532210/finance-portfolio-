"""
Development entry point.

    python run.py

Equivalent to:

    uvicorn app.main:app --reload --host 127.0.0.1 --port 8010

Port 8010 rather than 8000, because another application on this machine
already listens on 8000. Override with the PORT environment variable.
"""

from __future__ import annotations

import os

import uvicorn

from app.core.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=int(os.getenv("PORT", "8011")),
        reload=settings.DEBUG,
        log_level="info" if settings.DEBUG else "warning",
    )
