"""Bildirim saklama politikasi (Sprint 7 MVP).

Kural: OKUNMUS ve verilen gunden eski bildirimler silinir.
Okunmamis bildirimler ASLA silinmez (kullanici gormeden kaybolmasin).

Calistirma:
    python -m app.maintenance.cleanup_notifications --days 90 [--dry-run]
"""

import argparse
import asyncio
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionLocal
from app.models import Notification


async def cleanup_notifications(
    db: AsyncSession, *, days: int = 90, dry_run: bool = False
) -> int:
    """Silinen (veya dry-run'da silinecek) kayit sayisini dondurur."""
    cutoff = datetime.now(UTC) - timedelta(days=days)
    conditions = (
        Notification.read_at.is_not(None),  # yalnizca OKUNMUS
        Notification.created_at < cutoff,
    )
    count = int(
        (
            await db.execute(select(func.count(Notification.id)).where(*conditions))
        ).scalar_one()
    )
    if dry_run or count == 0:
        return count
    await db.execute(delete(Notification).where(*conditions))
    await db.commit()
    return count


async def main() -> None:
    parser = argparse.ArgumentParser(description="Okunmus eski bildirimleri temizler")
    parser.add_argument("--days", type=int, default=90, help="Saklama suresi (gun)")
    parser.add_argument("--dry-run", action="store_true", help="Silmeden say")
    args = parser.parse_args()

    async with SessionLocal() as db:
        count = await cleanup_notifications(db, days=args.days, dry_run=args.dry_run)
    action = "silinecek (dry-run)" if args.dry_run else "silindi"
    print(f"{count} okunmus bildirim {action} (>{args.days} gun).")


if __name__ == "__main__":
    asyncio.run(main())
