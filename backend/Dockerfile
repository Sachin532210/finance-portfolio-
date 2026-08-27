# ---------------------------------------------------------------------------
# Container image for the Finance Track API.
#
# Render can build from this repo without Docker, so this exists for the hosts
# that require an image: Koyeb, Fly.io, Railway, Google Cloud Run.
#
#   docker build -t finance-track-api ./backend
#   docker run -p 8000:8000 --env-file backend/.env finance-track-api
# ---------------------------------------------------------------------------

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first, so a code change does not invalidate the pip layer.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run as a non-root user.
RUN useradd --create-home --uid 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Most platforms inject PORT; 8000 is the fallback for a plain docker run.
ENV PORT=8000
EXPOSE 8000

# Shell form so $PORT is expanded at runtime.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
