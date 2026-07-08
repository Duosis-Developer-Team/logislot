"""Zaman yardimcilari.

Kural: DB'ye yazilan her datetime UTC'ye normalize edilir. Gosterim
donusumleri facility timezone'una gore uygulama katmaninda yapilir.
"""

from datetime import UTC, datetime


def to_utc(dt: datetime) -> datetime:
    """Aware datetime'i UTC'ye cevirir; naive geleni UTC varsayar."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)
