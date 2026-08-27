from __future__ import annotations

import logging
from typing import List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = None


def get_client():
    """Lazily constructs the OpenAI client; returns None when no key is set."""
    global _client
    if not settings.ai_enabled:
        return None
    if _client is None:
        try:
            from openai import OpenAI

            _client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=30.0, max_retries=1)
        except Exception as exc:  # pragma: no cover
            logger.error("Could not initialise OpenAI client: %s", exc)
            return None
    return _client


def chat_completion(
    system_prompt: str,
    messages: List[dict],
    *,
    temperature: float = 0.3,
    max_tokens: int = 700,
) -> Optional[str]:
    """
    Calls the model. Returns None on any failure so the caller can fall back to
    the deterministic coach rather than showing the user an error.
    """
    client = get_client()
    if client is None:
        return None
    try:
        response = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[{"role": "system", "content": system_prompt}, *messages],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        content = response.choices[0].message.content
        return content.strip() if content else None
    except Exception as exc:
        logger.warning("AI request failed, falling back to rule-based coach: %s", exc)
        return None
