"""Zamani gelmis failed e-postalari yeniden dener (Sprint 10).

Backoff: 1. deneme +5 dk, 2. +30 dk, 3. +2 saat; max_attempts (varsayilan 3)
asilinca kayit birakilir ve yalnizca UI'dan manuel resend edilebilir... o da
max_attempts'e tabidir. Lifecycle TEKRAR CALISTIRILMAZ; yalnizca e-posta
yeniden gonderilir.

Calistirma (cron onerisi: 5 dakikada bir):
    python -m app.maintenance.process_email_retries --limit 50
"""

import argparse
import asyncio

from app.core.db import SessionLocal
from app.core.enums import ActorType
from app.services.audit import record_audit
from app.services.email import process_due_retries


async def main() -> None:
    parser = argparse.ArgumentParser(description="Bekleyen e-posta retry'larini isle")
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()

    async with SessionLocal() as db:
        summary = await process_due_retries(db, limit=args.limit)
        if summary["processed"]:
            record_audit(
                db,
                actor_type=ActorType.system,
                actor_id=None,
                action="email.retry_process",
                metadata=summary,
            )
        await db.commit()
        print(
            f"Islenen: {summary['processed']}, gonderilen: {summary['sent']}, "
            f"yine basarisiz: {summary['failed']}"
        )


if __name__ == "__main__":
    asyncio.run(main())
