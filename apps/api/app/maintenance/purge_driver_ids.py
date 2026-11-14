"""Surucu kimlik numarasi saklama politikasi (KVKK: veri minimizasyonu).

Randevu BITISINDEN tesisin saklama suresi (gun; randevu formu ayari, varsayilan
30) kadar sonra sifreli kimlik, arama ozeti ve son haneler silinir; randevuda
yalnizca `driver_id_purged_at` isareti kalir. Silinen deger geri getirilemez.

Calistirma (scheduler disinda elle):
    python -m app.maintenance.purge_driver_ids [--dry-run]
"""

import argparse
import asyncio
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionLocal
from app.models import Appointment, Facility
from app.services.driver_id import resolve_retention_days


async def purge_driver_ids(db: AsyncSession, *, dry_run: bool = False) -> int:
    now = datetime.now(UTC)
    total = 0
    for facility in (await db.execute(select(Facility))).scalars():
        cutoff = now - timedelta(days=resolve_retention_days(facility))
        conditions = (
            Appointment.facility_id == facility.id,
            Appointment.driver_id_ciphertext.is_not(None),
            Appointment.scheduled_end_at < cutoff,
        )
        count = int(
            (await db.execute(select(func.count(Appointment.id)).where(*conditions))).scalar_one()
        )
        total += count
        if count and not dry_run:
            await db.execute(
                update(Appointment)
                .where(*conditions)
                .values(
                    driver_id_ciphertext=None,
                    driver_id_hash=None,
                    driver_id_last4=None,
                    driver_id_purged_at=now,
                )
                .execution_options(synchronize_session=False)
            )
    if total and not dry_run:
        await db.commit()
    return total


async def main() -> None:
    parser = argparse.ArgumentParser(description="Saklama suresi dolan surucu kimliklerini siler")
    parser.add_argument("--dry-run", action="store_true", help="Silmeden say")
    args = parser.parse_args()
    async with SessionLocal() as db:
        count = await purge_driver_ids(db, dry_run=args.dry_run)
    print(f"{count} surucu kimligi {'silinecek (dry-run)' if args.dry_run else 'silindi'}.")


if __name__ == "__main__":
    asyncio.run(main())
