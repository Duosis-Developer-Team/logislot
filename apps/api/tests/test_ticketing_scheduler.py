"""Scheduler entegrasyonu: is kaydi, kapsam ve tek-kosum garantisi."""

import sqlalchemy as sa

from app.core.config import get_settings
from app.core.tenancy_runtime import CONTROL_LOCATION
from app.maintenance.scheduler import (
    CONTROL_ONLY_JOBS,
    JOB_TICKET_INBOX_RECOVERY,
    JOB_TICKET_OUTBOX,
    JOB_TICKET_RECONCILIATION,
    WORKERS,
    execute_job,
    locations_for_job,
)
from app.models import MaintenanceRun


def test_ticket_jobs_are_registered():
    for job in (JOB_TICKET_OUTBOX, JOB_TICKET_RECONCILIATION, JOB_TICKET_INBOX_RECOVERY):
        assert job in WORKERS


async def test_inbox_recovery_runs_only_on_control_plane():
    """Webhook inbox control semasindadir; tenant basina kosmak ayni satirlari
    defalarca islemeye calisirdi."""
    assert JOB_TICKET_INBOX_RECOVERY in CONTROL_ONLY_JOBS
    locations = await locations_for_job(JOB_TICKET_INBOX_RECOVERY)
    assert locations == [CONTROL_LOCATION]


async def test_jobs_record_a_run_row(session_maker, seeded):
    async with session_maker() as db:
        for job in (JOB_TICKET_OUTBOX, JOB_TICKET_RECONCILIATION, JOB_TICKET_INBOX_RECOVERY):
            run = await execute_job(db, job, scope="control")
            assert run.status == "success", (job, run.error_message)

        rows = list(
            (
                await db.execute(
                    sa.select(MaintenanceRun).where(
                        MaintenanceRun.job_name.like("ticket_%")
                    )
                )
            ).scalars()
        )
    assert {r.job_name for r in rows} == {
        JOB_TICKET_OUTBOX,
        JOB_TICKET_RECONCILIATION,
        JOB_TICKET_INBOX_RECOVERY,
    }


async def test_feature_flag_off_skips_ticket_work(session_maker, seeded):
    """Rollback yolu: bayrak kapaliyken isler no-op olur, veri silinmez."""
    settings = get_settings()
    settings.ticketing_enabled = False
    try:
        async with session_maker() as db:
            run = await execute_job(db, JOB_TICKET_OUTBOX, scope="control")
        assert run.status == "success"
        assert run.metadata_json["skipped"] == "feature_disabled"
    finally:
        settings.ticketing_enabled = True
