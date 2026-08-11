"""Bildirim uretimi: alici cozumleme + lifecycle olay kurallari (+ e-posta kanali).

Hedefleme (rapor karari):
- Tenant tarafinda alicilar, tesiste `appt.approve` iznine sahip uyelerdir
  (sistem yoneticileri + rampa/depo yoneticileri). Izleyici bildirim ALMAZ.
- Rampa yoneticisi yalnizca ATANMIS rampalarina dusen randevu olaylarini alir.
- Tedarikci yalnizca kendi randevu durum degisikliklerini alir.
E-posta ikinci kanaldir (log_only provider): approve/reject/cancel tedarikciye;
REVISE hem tedarikciye hem ilgili ekibe gider (v1.0 saha davranisi).
"""

import uuid
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import TenantPermission
from app.models import Appointment, Dock, Facility, FacilityMembership, Notification, Supplier
from app.services.email import EmailMessage, send_email
from app.services.email_templates import EmailContext, render_email


async def _facility_when(
    db: AsyncSession, appointment: Appointment, fmt: str = "%d.%m %H:%M"
) -> str:
    """Randevu saatini TESIS saat diliminde formatlar.

    scheduled_start_at UTC(aware) saklanir; bildirim/e-posta metinlerinde
    kullaniciya ham UTC gostermek yanlis saate yol acar (or. 08:00 yerine
    05:00). Facility.timezone'a cevrilerek yazilir.
    """
    tz_name = (
        await db.execute(
            select(Facility.timezone).where(Facility.id == appointment.facility_id)
        )
    ).scalar_one_or_none() or "Europe/Istanbul"
    return appointment.scheduled_start_at.astimezone(ZoneInfo(tz_name)).strftime(fmt)


async def _supplier_policy(db: AsyncSession, facility_id: uuid.UUID) -> dict:
    """Tesisin tedarikci bildirim politikasi (yonetim belirler).

    db.get identity map uzerinden calisir; ayni istekte tekrar tekrar
    cagrilmasi ek sorgu uretmez.
    """
    from app.services.notification_preferences import (
        DEFAULT_SUPPLIER_POLICY,
        resolve_supplier_policy,
    )

    facility = await db.get(Facility, facility_id)
    if facility is None:
        return dict(DEFAULT_SUPPLIER_POLICY)
    return resolve_supplier_policy(facility)


def _route_hint(appointment: Appointment) -> str:
    return f"/admin/appointments?appointmentId={appointment.id}"


def _base_metadata(appointment: Appointment) -> dict[str, Any]:
    return {
        "appointment_id": str(appointment.id),
        "status": appointment.status.value,
        "dock_id": str(appointment.dock_id) if appointment.dock_id else None,
        "supplier_id": str(appointment.supplier_id),
        "route_hint": _route_hint(appointment),
    }


async def _admin_recipients(
    db: AsyncSession, facility_id: uuid.UUID, dock_id: uuid.UUID | None
) -> list:
    """appt.approve yetkili uyeler (TenantUser); rampa scope'u uygulanir."""
    result = await db.execute(
        select(FacilityMembership)
        .options(
            selectinload(FacilityMembership.roles),
            selectinload(FacilityMembership.user),
        )
        .where(FacilityMembership.facility_id == facility_id)
    )
    recipients = []
    for membership in result.scalars():
        if TenantPermission.APPT_APPROVE not in membership.permissions:
            continue
        if membership.assigned_dock_ids and dock_id is not None:
            if str(dock_id) not in membership.assigned_dock_ids:
                continue
        recipients.append(membership.user)
    return recipients


async def _supplier_account(db: AsyncSession, supplier_id: uuid.UUID):
    """(supplier, portal hesabi | None) — tercihler portal hesabinda yasar."""
    supplier = (
        await db.execute(
            select(Supplier)
            .options(selectinload(Supplier.users))
            .where(Supplier.id == supplier_id)
        )
    ).scalar_one_or_none()
    if supplier is None:
        return None, None
    return supplier, (supplier.users[0] if supplier.users else None)


async def _supplier_email(
    db: AsyncSession, supplier_id: uuid.UUID
) -> tuple[str | None, str | None]:
    """(email, ad) — once portal hesabi, yoksa iletisim e-postasi."""
    supplier, account = await _supplier_account(db, supplier_id)
    if supplier is None:
        return None, None
    email = account.email if account else supplier.contact_email
    return email, supplier.company_name


def _add(
    db: AsyncSession,
    appointment: Appointment,
    *,
    type_: str,
    severity: str,
    title: str,
    body: str | None,
    recipient_user_id: uuid.UUID | None = None,
    recipient_supplier_id: uuid.UUID | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    metadata = _base_metadata(appointment)
    if extra:
        metadata.update(extra)
    db.add(
        Notification(
            tenant_id=appointment.tenant_id,
            facility_id=appointment.facility_id,
            recipient_user_id=recipient_user_id,
            recipient_supplier_id=recipient_supplier_id,
            type=type_,
            severity=severity,
            title=title,
            body=body,
            entity_type="appointment",
            entity_id=appointment.id,
            metadata_json=metadata,
        )
    )


async def _dock_name(db: AsyncSession, dock_id: uuid.UUID | None) -> str | None:
    if dock_id is None:
        return None
    return (
        await db.execute(select(Dock.name).where(Dock.id == dock_id))
    ).scalar_one_or_none()


async def _email_context(
    db: AsyncSession, appointment: Appointment, **extra
) -> tuple[str | None, EmailContext]:
    """(alici e-posta, sablon baglami) — alici yoksa email None doner."""
    email, name = await _supplier_email(db, appointment.supplier_id)
    ctx = EmailContext(
        supplier_name=name or "Tedarikçi",
        product_name=appointment.product_name,
        when=await _facility_when(db, appointment, "%d.%m.%Y %H:%M"),
        dock_name=await _dock_name(db, appointment.dock_id),
        status=appointment.status.value,
        **extra,
    )
    return email, ctx


async def _email_supplier(
    db: AsyncSession,
    appointment: Appointment,
    *,
    template_key: str,
    **ctx_extra,
) -> None:
    from app.services.notification_preferences import prefs_email_allowed

    policy = await _supplier_policy(db, appointment.facility_id)
    if not prefs_email_allowed(policy, template_key):
        return  # politika kapali: e-posta ve EmailLog uretilmez (MVP karari)
    email, ctx = await _email_context(db, appointment, **ctx_extra)
    if not email:
        return
    subject, body = render_email(template_key, ctx)
    await send_email(
        db,
        EmailMessage(
            tenant_id=appointment.tenant_id,
            facility_id=appointment.facility_id,
            recipient_email=email,
            recipient_name=ctx.supplier_name,
            subject=subject,
            body=body,
            template_key=template_key,
            appointment_id=appointment.id,
        ),
    )


async def notify_admins(
    db: AsyncSession,
    appointment: Appointment,
    *,
    type_: str,
    severity: str,
    title: str,
    body: str | None,
    extra: dict[str, Any] | None = None,
) -> None:
    from app.services.notification_preferences import in_app_allowed

    for user in await _admin_recipients(db, appointment.facility_id, appointment.dock_id):
        if not in_app_allowed(user, type_):
            continue  # tercih kapali: satir HIC uretilmez (MVP karari)
        _add(
            db, appointment,
            type_=type_, severity=severity, title=title, body=body,
            recipient_user_id=user.id, extra=extra,
        )


async def notify_supplier(
    db: AsyncSession,
    appointment: Appointment,
    *,
    type_: str,
    severity: str,
    title: str,
    body: str | None,
    extra: dict[str, Any] | None = None,
) -> None:
    from app.services.notification_preferences import prefs_in_app_allowed

    policy = await _supplier_policy(db, appointment.facility_id)
    if not prefs_in_app_allowed(policy, type_):
        return  # politika kapali: satir uretilmez (kritik eventler haric)
    _add(
        db, appointment,
        type_=type_, severity=severity, title=title, body=body,
        recipient_supplier_id=appointment.supplier_id, extra=extra,
    )


async def on_appointment_created(
    db: AsyncSession, appointment: Appointment, supplier_name: str, *, by_admin: bool = False
) -> None:
    from app.core.enums import AppointmentStatus, DeliveryType

    auto_approved = appointment.status == AppointmentStatus.approved
    when = await _facility_when(db, appointment)
    if by_admin:
        # Admin tedarikci adina acti: tedarikciye haber ver (onayli dogar),
        # diger yoneticilere olagan olusturma bildirimi.
        await notify_supplier(
            db, appointment,
            type_="appointment_approved", severity="success",
            title="Randevunuz tesis tarafından oluşturuldu",
            body=f"Tesis, {when} için adınıza randevu oluşturdu (onaylı).",
        )
        await _email_supplier(db, appointment, template_key="appointment_approved")
        await notify_admins(
            db, appointment,
            type_="appointment_created", severity="info",
            title="Yeni randevu (tesis tarafından)",
            body=f"{supplier_name} adına {when} için randevu oluşturuldu.",
        )
    elif auto_approved:
        await notify_admins(
            db, appointment,
            type_="appointment_created", severity="info",
            title="Yeni randevu (otomatik onaylı)",
            body=f"{supplier_name}, {when} için randevu oluşturdu (otomatik onaylandı).",
        )
        await notify_supplier(
            db, appointment,
            type_="appointment_approved", severity="success",
            title="Randevunuz onaylandı",
            body=f"{when} randevunuz otomatik onaylandı.",
        )
    else:
        await notify_admins(
            db, appointment,
            type_="appointment_created", severity="warning",
            title="Yeni randevu talebi",
            body=f"{supplier_name}, {when} için randevu talep etti.",
        )

    # Kargo advisory: yalnizca olusturma aninda BIR kez (spam yok).
    if appointment.delivery_type == DeliveryType.cargo:
        window_labels = {"morning": "sabah", "afternoon": "öğleden sonra", "all_day": "gün içinde"}
        window = window_labels.get(
            appointment.cargo_window.value if appointment.cargo_window else "all_day",
            "gün içinde",
        )
        await notify_admins(
            db, appointment,
            type_="cargo_advisory", severity="warning",
            title="Kargo uyarısı",
            body=f"{supplier_name} kargosu {window} bekleniyor; ilgili rampada boşluk bırakın.",
            extra={"window": appointment.cargo_window.value if appointment.cargo_window else None},
        )


async def on_lifecycle_action(
    db: AsyncSession,
    appointment: Appointment,
    *,
    action: str,
    by_supplier: bool = False,
    reason: str | None = None,
    old_start: str | None = None,
    new_start: str | None = None,
    old_dock_name: str | None = None,
    new_dock_name: str | None = None,
) -> None:
    """approve/reject/revise/dock_change/complete/cancel bildirim + e-postalari."""
    when = await _facility_when(db, appointment)

    if action == "dock_change":
        # Urun karari: rampa degisimi REVIZE degildir — randevu onayli kalir,
        # tedarikciden yeniden onay istenmez. Yine de gidecegi yer degistigi
        # icin bilgilendirme sarttir (surucu yanlis rampaya gitmesin).
        await notify_supplier(
            db, appointment,
            type_="appointment_dock_changed", severity="info",
            title="Randevunuzun rampası değişti",
            body=(
                f"{when} randevunuz {new_dock_name} rampasına alındı"
                + (f" (önceki: {old_dock_name})." if old_dock_name else ".")
            ),
            extra={
                "old_dock_name": old_dock_name,
                "new_dock_name": new_dock_name,
                "note": reason,
            },
        )
        # old_when/new_when alanlari sablonda "eski -> yeni" satirini besler;
        # burada tasidiklari deger SAAT degil RAMPA adidir (saat degismiyor).
        await _email_supplier(
            db,
            appointment,
            template_key="appointment_dock_changed",
            old_when=old_dock_name,
            new_when=new_dock_name,
            note=reason,
        )
        return

    if action == "approve":
        await notify_supplier(
            db, appointment,
            type_="appointment_approved", severity="success",
            title="Randevunuz onaylandı",
            body=f"{when} randevunuz onaylandı.",
        )
        await _email_supplier(db, appointment, template_key="appointment_approved")
    elif action == "reject":
        await notify_supplier(
            db, appointment,
            type_="appointment_rejected", severity="error",
            title="Randevunuz reddedildi",
            body=f"Red sebebi: {reason}" if reason else "Randevu talebiniz reddedildi.",
            extra={"reason": reason},
        )
        await _email_supplier(
            db, appointment, template_key="appointment_rejected", reason=reason
        )
    elif action == "revise":
        await notify_supplier(
            db, appointment,
            type_="appointment_revised", severity="warning",
            title="Randevunuz revize edildi",
            body="Tesis yönetimi yeni saat önerdi.",
            extra={"old_start_at": old_start, "new_start_at": new_start},
        )
        # v1.0 saha davranisi: saat degisikliginde ILGILI EKIBE otomatik e-posta.
        revise_ctx = {
            "old_when": old_start,
            "new_when": new_start,
            "note": appointment.revision_note,
        }
        await _email_supplier(
            db, appointment, template_key="appointment_revised", **revise_ctx
        )
        from app.services.notification_preferences import email_allowed as _email_ok

        _, team_ctx = await _email_context(db, appointment, **revise_ctx)
        team_subject, team_body = render_email("appointment_revised_team", team_ctx)
        for user in await _admin_recipients(
            db, appointment.facility_id, appointment.dock_id
        ):
            if not _email_ok(user, "appointment_revised_team"):
                continue
            await send_email(
                db,
                EmailMessage(
                    tenant_id=appointment.tenant_id,
                    facility_id=appointment.facility_id,
                    recipient_email=user.email,
                    recipient_name=user.name,
                    subject=team_subject,
                    body=team_body,
                    template_key="appointment_revised_team",
                    appointment_id=appointment.id,
                ),
            )
    elif action == "complete":
        await notify_supplier(
            db, appointment,
            type_="appointment_completed", severity="info",
            title="Randevunuz tamamlandı",
            body=f"{when} randevunuzda mal kabul tamamlandı.",
        )
    elif action == "cancel":
        if by_supplier:
            await notify_admins(
                db, appointment,
                type_="appointment_cancelled", severity="warning",
                title="Randevu tedarikçi tarafından iptal edildi",
                body=f"{when} randevusu iptal edildi.",
                extra={"reason": reason},
            )
        else:
            await notify_supplier(
                db, appointment,
                type_="appointment_cancelled", severity="warning",
                title="Randevunuz iptal edildi",
                body=f"İptal sebebi: {reason}" if reason else f"{when} randevunuz iptal edildi.",
                extra={"reason": reason},
            )
            await _email_supplier(
                db, appointment, template_key="appointment_cancelled", reason=reason
            )
