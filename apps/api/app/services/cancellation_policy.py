"""Tedarikcinin randevu iptal kurallari (tesis politikasi).

Musteri talebi ve 2026-11 toplantisi kararlari:
- tedarikci iptal ederken FIRMANIN duzenledigi listeden sebep secer; aciklama
  istege baglidir (sebep bazinda zorunlu yapilabilir),
- randevuya belirli bir sureden (orn. 24 saat) az kalinca portaldan iptal
  edilemez,
- tedarikci iptalinde TELAFI randevusu zorunludur: iptal ve telafi tek
  islemde yapilir, telafi randevusu bayrakla isaretlenir.

Kurallar tesis bazlidir ve YONETIM belirler
(`facilities.supplier_cancellation_policy_json`). None = kural yok, yani eski
davranis: sebep/telafi istenmez, baslangica kadar iptal serbesttir. Boylece
kurali istemeyen tenant'lar etkilenmez. Yonetim iptali bu kurallardan
ETKILENMEZ: tesis kendi randevusunu her zaman iptal edebilir.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.timeutils import to_utc
from app.models import CancellationReason, Facility
from app.models.cancellation import DEFAULT_CANCELLATION_REASONS

#: Bildirim kuralinin ust siniri (30 gun). Daha uzun bir pencere tedarikcinin
#: portaldan iptal hakkini fiilen ortadan kaldirir.
MAX_NOTICE_HOURS = 720

DEFAULT_CANCELLATION_POLICY: dict[str, Any] = {
    "require_reason": False,
    "require_makeup": False,
    "min_notice_hours": 0,
}


def _as_bool(value: Any, default: bool) -> bool:
    return value if isinstance(value, bool) else default


def _as_hours(value: Any) -> int:
    # bool da int'tir; yanlislikla saklanmis true/false 1/0 saat sayilmasin.
    if isinstance(value, bool) or not isinstance(value, int):
        return 0
    return min(max(value, 0), MAX_NOTICE_HOURS)


def resolve_cancellation_policy(facility: Any) -> dict[str, Any]:
    """Kayitli politikayi varsayilanlarin uzerine bindirir.

    Bozuk/eski sekildeki veri sistemi bozmaz: her alan tipi dogrulanarak
    okunur, taninmayan anahtarlar (orn. ilk surumun
    `require_alternative_date`'i) dusurulur.
    """
    stored = getattr(facility, "supplier_cancellation_policy_json", None)
    stored = stored if isinstance(stored, dict) else {}
    return {
        "require_reason": _as_bool(stored.get("require_reason"), False),
        "require_makeup": _as_bool(stored.get("require_makeup"), False),
        "min_notice_hours": _as_hours(stored.get("min_notice_hours")),
    }


def notice_cutoff(policy: dict[str, Any], now: datetime) -> datetime:
    """Tedarikcinin iptal edebilecegi en erken baslangic ani (dahil)."""
    return now + timedelta(hours=policy["min_notice_hours"])


def ensure_cancellation_notice(
    policy: dict[str, Any], start_at: datetime, now: datetime
) -> None:
    """Randevuya kural suresinden az kaldiysa tedarikci iptalini reddeder."""
    hours = policy["min_notice_hours"]
    if hours and to_utc(start_at) < notice_cutoff(policy, now):
        raise ApiError(
            "CANCELLATION_NOTICE_TOO_SHORT",
            f"Randevuya {hours} saatten az kaldigi icin portaldan iptal edilemez; "
            "lutfen tesisle iletisime gecin",
            409,
            details={"min_notice_hours": hours},
        )


# ---------------------------------------------------------------- sebepler


async def list_reasons(
    db: AsyncSession, facility_id: uuid.UUID, *, active_only: bool = False
) -> list[CancellationReason]:
    query = select(CancellationReason).where(CancellationReason.facility_id == facility_id)
    if active_only:
        query = query.where(CancellationReason.is_active.is_(True))
    query = query.order_by(CancellationReason.position, CancellationReason.created_at)
    return list((await db.execute(query)).scalars())


def reason_out(reason: CancellationReason) -> dict[str, Any]:
    return {
        "id": str(reason.id),
        "label": reason.label,
        "note_required": reason.note_required,
        "is_active": reason.is_active,
        "position": reason.position,
    }


def seed_default_reasons(db: AsyncSession, facility: Facility) -> None:
    """Yeni tesise baslangic sebep listesini ekler (commit cagirana aittir)."""
    for position, label in enumerate(DEFAULT_CANCELLATION_REASONS):
        db.add(
            CancellationReason(
                tenant_id=facility.tenant_id,
                facility_id=facility.id,
                label=label,
                note_required=False,
                is_active=True,
                position=position,
            )
        )


async def resolve_supplier_reason(
    db: AsyncSession,
    facility: Any,
    *,
    reason_id: uuid.UUID | None,
    note: str | None,
) -> tuple[CancellationReason | None, str | None]:
    """Secilen sebebi ve aciklamayi tesis politikasina gore dogrular.

    Donus: (sebep veya None, normalize aciklama).
    """
    policy = resolve_cancellation_policy(facility)
    note = (note or "").strip() or None

    reason: CancellationReason | None = None
    if reason_id is not None:
        reason = (
            await db.execute(
                select(CancellationReason).where(
                    CancellationReason.id == reason_id,
                    CancellationReason.facility_id == facility.id,
                    CancellationReason.is_active.is_(True),
                )
            )
        ).scalar_one_or_none()
        if reason is None:
            raise ApiError(
                "CANCELLATION_REASON_INVALID", "Secilen iptal sebebi gecerli degil", 422
            )
    elif policy["require_reason"]:
        raise ApiError("CANCELLATION_REASON_REQUIRED", "Iptal sebebi secilmelidir", 422)

    if reason is not None and reason.note_required and (note is None or len(note) < 3):
        raise ApiError(
            "CANCELLATION_NOTE_REQUIRED",
            "Bu sebep icin aciklama yazilmalidir",
            422,
        )
    return reason, note


def reason_text(label: str | None, note: str | None) -> str | None:
    """Bildirim/denetim metni: "Arac / nakliye sorunu — aciklama"."""
    if label and note:
        return f"{label} — {note}"
    return label or note


def utcnow() -> datetime:
    return datetime.now(UTC)
