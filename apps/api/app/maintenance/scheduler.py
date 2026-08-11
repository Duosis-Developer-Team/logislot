"""Maintenance scheduler dongusu (Sprint 11; Sprint 12: kilit + kosum kaydi).

- Her is PG advisory lock ile korunur: COKLU INSTANCE'ta ayni is iki kez
  KOSMAZ — kilidi alamayan instance isi `skipped_locked` olarak kaydeder
  (hata degildir). SQLite/dev ortaminda kilit no-op'tur.
- Her kosum `maintenance_runs` tablosuna yazilir (support panelinde "son
  kosum" gorunur; kayit yoksa 'henuz kosmadi').
- Is hata alirsa dongu OLMEZ: kosum `failed` kaydedilir, sonraki turda
  tekrar denenir.

Calistirma:
    python -m app.maintenance.scheduler
"""

import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import session_scope
from app.core.enums import ActorType
from app.core.tenancy_runtime import CONTROL_LOCATION, TenantLocation
from app.maintenance.cleanup_notifications import cleanup_notifications
from app.models import MaintenanceRun
from app.services.audit import record_audit
from app.services.email import process_due_retries

logger = logging.getLogger("logislot.scheduler")

JOB_EMAIL_RETRY = "email_retry"
JOB_NOTIFICATION_CLEANUP = "notification_cleanup"


async def try_job_lock(db: AsyncSession, job_name: str, scope: str = "") -> bool:
    """Transaction-scoped advisory lock; alinamazsa False (is atlanir).

    Kilit anahtari TENANT BAZLIDIR: bir tenant'in isi kosarken baska bir
    tenant'in ayni isi beklemez, ama ayni tenant+is cifti coklu instance'ta
    yine tek kez kosar.
    """
    if db.bind.dialect.name != "postgresql":
        return True
    result = await db.execute(
        text("SELECT pg_try_advisory_xact_lock(hashtext(:key))"),
        {"key": f"logislot:scheduler:{job_name}:{scope}"},
    )
    return bool(result.scalar_one())


async def _email_retry_worker(db: AsyncSession) -> dict:
    summary = await process_due_retries(db, limit=50)
    if summary["processed"]:
        record_audit(
            db,
            actor_type=ActorType.system,
            actor_id=None,
            action="email.retry_process",
            metadata=summary,
        )
    return {"processed": summary["processed"], "metadata": summary}


async def _notification_cleanup_worker(db: AsyncSession) -> dict:
    settings = get_settings()
    deleted = await cleanup_notifications(
        db, days=settings.notification_retention_days, dry_run=False
    )
    return {"processed": deleted, "metadata": {"deleted": deleted}}


WORKERS = {
    JOB_EMAIL_RETRY: _email_retry_worker,
    JOB_NOTIFICATION_CLEANUP: _notification_cleanup_worker,
}


async def execute_job(
    db: AsyncSession, job_name: str, scope: str = ""
) -> MaintenanceRun:
    """Isi kilit altinda kosar ve sonucu maintenance_runs'a yazar."""
    started = datetime.now(UTC)
    if not await try_job_lock(db, job_name, scope):
        run = MaintenanceRun(
            job_name=job_name,
            started_at=started,
            finished_at=datetime.now(UTC),
            status="skipped_locked",
            processed_count=0,
        )
        db.add(run)
        await db.commit()
        logger.info("job '%s' atlandi (baska instance kilidi tutuyor)", job_name)
        return run

    try:
        result = await WORKERS[job_name](db)
        run = MaintenanceRun(
            job_name=job_name,
            started_at=started,
            finished_at=datetime.now(UTC),
            status="success",
            processed_count=int(result.get("processed", 0)),
            metadata_json=result.get("metadata"),
        )
        if run.processed_count:
            logger.info("job '%s': %s kayit islendi", job_name, run.processed_count)
    except Exception as exc:  # dongu olmemeli; kosum failed kaydedilir
        logger.exception("job '%s' hata aldi", job_name)
        await db.rollback()
        run = MaintenanceRun(
            job_name=job_name,
            started_at=started,
            finished_at=datetime.now(UTC),
            status="failed",
            processed_count=0,
            error_message=str(exc)[:2000],
        )
    db.add(run)
    await db.commit()
    return run


async def scheduler_locations() -> list[TenantLocation]:
    """Bakim islerinin kosacagi tum veri alanlari.

    Her tenant'in bildirimleri/e-posta kuyrugu KENDI semasindadir, bu yuzden
    isler tenant basina kosar. Control-plane de listeye dahildir: henuz
    tasinmamis tenant'larin verisi orada durur (tasima bitince no-op olur).
    """
    from app.tenancy.migrations import ready_datastores

    locations = [CONTROL_LOCATION]
    for row in await ready_datastores():
        locations.append(TenantLocation(schema=row.schema_name, dsn_alias=row.dsn_alias))
    return locations


async def _loop(job_name: str, interval_seconds: int) -> None:
    """Is hata alsa da yasamaya devam eden periyodik dongu."""
    logger.info("scheduler job '%s' basladi (aralik: %ss)", job_name, interval_seconds)
    while True:
        try:
            locations = await scheduler_locations()
        except Exception:
            # Kayit okunamadi: hicbir sey yapmamaktansa control-plane'de kos.
            logger.exception("tenant veri alanlari listelenemedi; control-plane'e dusuluyor")
            locations = [CONTROL_LOCATION]
        for location in locations:
            scope = location.schema or "control"
            try:
                async with session_scope(location) as db:
                    await execute_job(db, job_name, scope)
            except Exception:  # tek tenant tum donguyu dusurmesin
                logger.exception(
                    "scheduler job '%s' veri alani '%s' icin kosulamadi", job_name, scope
                )
        await asyncio.sleep(interval_seconds)


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    settings = get_settings()
    if not settings.scheduler_enabled:
        logger.warning("LOGISLOT_SCHEDULER_ENABLED=false — scheduler cikiyor")
        return
    await asyncio.gather(
        _loop(JOB_EMAIL_RETRY, settings.email_retry_interval_seconds),
        _loop(JOB_NOTIFICATION_CLEANUP, settings.notification_cleanup_interval_seconds),
    )


if __name__ == "__main__":
    asyncio.run(main())
