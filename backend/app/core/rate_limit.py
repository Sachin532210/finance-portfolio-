from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import HTTPException, status


class SlidingWindowLimiter:
    """
    In-process sliding-window limiter for the AI endpoints.

    Deliberately simple: it protects a single-instance deployment from runaway
    cost and abuse. Behind multiple workers, swap the backing store for Redis -
    the interface stays the same.
    """

    def __init__(self) -> None:
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: int) -> None:
        now = time.time()
        with self._lock:
            bucket = self._hits[key]
            while bucket and now - bucket[0] > window_seconds:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = int(window_seconds - (now - bucket[0])) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=(
                        f"Rate limit reached ({limit} requests per "
                        f"{window_seconds // 60 or 1} minute(s)). Try again in {retry_after}s."
                    ),
                    headers={"Retry-After": str(retry_after)},
                )
            bucket.append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)


limiter = SlidingWindowLimiter()


def enforce_ai_limits(user_id: str, per_minute: int, per_day: int) -> None:
    limiter.check(f"ai:min:{user_id}", per_minute, 60)
    limiter.check(f"ai:day:{user_id}", per_day, 86_400)
