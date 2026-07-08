"""Basit in-memory rate limiter (MVP).

Redis'e gecis, ayni arayuzu uygulayan bir sinifla yapilir; cagiran kod
degismez. `LOGISLOT_RATE_LIMIT_ENABLED=false` ile tamamen kapatilabilir
(test ortaminda varsayilan olarak kapalidir — deterministiklik icin).
"""

import time
from collections import defaultdict, deque

from fastapi import Request

from app.core.config import get_settings
from app.core.errors import ApiError


class RateLimitedError(ApiError):
    def __init__(self) -> None:
        super().__init__(
            "RATE_LIMITED",
            "Cok fazla deneme yapildi; lutfen biraz bekleyip tekrar deneyin.",
            429,
        )


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, times: int, per_seconds: int) -> bool:
        """True = izinli. Sliding window sayaci."""
        now = time.monotonic()
        window = self._hits[key]
        while window and now - window[0] > per_seconds:
            window.popleft()
        if len(window) >= times:
            return False
        window.append(now)
        return True

    def reset(self) -> None:
        self._hits.clear()


limiter = InMemoryRateLimiter()


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(
    request: Request, scope: str, key: str, *, times: int, per_seconds: int = 60
) -> None:
    """Limit asilirsa 429 RATE_LIMITED firlatir; kapaliysa no-op."""
    settings = get_settings()
    if not settings.rate_limit_enabled:
        return
    full_key = f"{scope}:{client_ip(request)}:{key}"
    if not limiter.check(full_key, times, per_seconds):
        raise RateLimitedError()
