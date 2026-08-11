import uuid
from datetime import date
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import FacilityStatus, PlanScope, PlanStatus, TenantStatus
from app.models.base import (
    CONTROL_SCHEMA,
    Base,
    JsonVariant,
    TimestampMixin,
    UUIDPkMixin,
    str_enum,
)


class Plan(Base, UUIDPkMixin, TimestampMixin):
    """Politika kabi; faturalama motoru degildir."""

    __tablename__ = "plans"
    __table_args__ = {"schema": CONTROL_SCHEMA}

    name: Mapped[str] = mapped_column(sa.String(200), unique=True)
    scope: Mapped[PlanScope] = mapped_column(str_enum(PlanScope), default=PlanScope.tenant)
    billing_unit_label: Mapped[str] = mapped_column(sa.String(50), default="fixed")
    measurable_dimensions_json: Mapped[list[Any] | None] = mapped_column(JsonVariant)
    rate_card_json: Mapped[list[Any] | None] = mapped_column(JsonVariant)
    #: Dinamik plan limitleri — sabit kolon degil, key->sayi haritasi:
    #: {"max_tenants": 300, "monthly_appointments": 5000, ...}
    #: Deger yoksa veya null ise o boyut SINIRSIZ sayilir. Boyut listesi
    #: app/core/plan_limits.py'de tanimlidir; yeni limit eklemek icin
    #: migration GEREKMEZ (bu yuzden JSON secildi).
    limits_json: Mapped[dict[str, Any] | None] = mapped_column(JsonVariant)
    valid_from: Mapped[date | None] = mapped_column(sa.Date)
    valid_until: Mapped[date | None] = mapped_column(sa.Date)
    status: Mapped[PlanStatus] = mapped_column(str_enum(PlanStatus), default=PlanStatus.draft)


class Tenant(Base, UUIDPkMixin, TimestampMixin):
    """Ana musteri hesabi. Operasyonel veri tutmaz; kimlik/faturalama/plan sarmalayicisidir."""

    __tablename__ = "tenants"
    __table_args__ = {"schema": CONTROL_SCHEMA}

    commercial_name: Mapped[str] = mapped_column(sa.String(255))
    display_name: Mapped[str] = mapped_column(sa.String(255))
    slug: Mapped[str] = mapped_column(sa.String(100), unique=True)
    status: Mapped[TenantStatus] = mapped_column(
        str_enum(TenantStatus), default=TenantStatus.trial
    )
    primary_contact_name: Mapped[str | None] = mapped_column(sa.String(255))
    primary_contact_email: Mapped[str | None] = mapped_column(sa.String(255))
    primary_contact_phone: Mapped[str | None] = mapped_column(sa.String(50))
    billing_contact_name: Mapped[str | None] = mapped_column(sa.String(255))
    billing_contact_email: Mapped[str | None] = mapped_column(sa.String(255))
    billing_contact_phone: Mapped[str | None] = mapped_column(sa.String(50))
    default_language: Mapped[str] = mapped_column(sa.String(10), default="tr")
    default_timezone: Mapped[str] = mapped_column(sa.String(64), default="Europe/Istanbul")
    assigned_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.Uuid, sa.ForeignKey("control.plans.id", ondelete="SET NULL")
    )
    notes: Mapped[str | None] = mapped_column(sa.Text)

    assigned_plan: Mapped[Plan | None] = relationship()
    facilities: Mapped[list["Facility"]] = relationship(back_populates="tenant")


class Facility(Base, UUIDPkMixin, TimestampMixin):
    """Musterinin operasyonel kapsami — TENANT ILE 1-1.

    Urun karari (2026-07): "1 tenant = 1 tesis". Tenant, kimlik/faturalama
    sarmalayicisi; Facility ise ayni musterinin operasyonel kapsamidir
    (rampalar, kategoriler, randevular, uyelikler hep buna baglidir).
    Kullanici arayuzunde AYRI bir "tesis" kavrami YOKTUR: tenant olusturulunca
    tesisi de otomatik acilir ve ad/saat dilimi/durum senkron tutulur.

    Tablo korunur cunku tum operasyonel FK zinciri (38 dosya) buna bagli;
    tenant_id UNIQUE ile 1-1 kisiti veritabani seviyesinde zorlanir.
    """

    __tablename__ = "facilities"
    __table_args__ = (
        sa.UniqueConstraint("tenant_id", "name"),
        # 1 tenant = 1 tesis (urun karari)
        sa.UniqueConstraint("tenant_id", name="uq_facilities_tenant_single"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("control.tenants.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(sa.String(255))
    address: Mapped[str | None] = mapped_column(sa.Text)
    location_metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JsonVariant)
    timezone: Mapped[str] = mapped_column(sa.String(64), default="Europe/Istanbul")
    status: Mapped[FacilityStatus] = mapped_column(
        str_enum(FacilityStatus), default=FacilityStatus.active
    )
    # Yeni rampalara uygulanan varsayilan calisma profili (WorkingHoursProfile).
    # Sekil: {"mon": {"start": "08:00", "end": "17:00"}, ..., "sun": null}
    default_working_profile_json: Mapped[dict[str, Any] | None] = mapped_column(JsonVariant)
    # Kargo randevulari icin tesis bazli varsayilan minimum blokaj (dk).
    cargo_default_min_block_minutes: Mapped[int] = mapped_column(sa.Integer, default=90)
    plan_override_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.Uuid, sa.ForeignKey("control.plans.id", ondelete="SET NULL")
    )
    branding_json: Mapped[dict[str, Any] | None] = mapped_column(JsonVariant)
    # Tedarikcilere gidecek bildirim/e-posta politikasi — YONETIM belirler,
    # tedarikci goremez/degistiremez. None = tum varsayilanlar acik.
    # Sekil: {"in_app_enabled": bool, "email_enabled": bool,
    #         "email_events": {<supplier event key>: bool}}
    supplier_notification_policy_json: Mapped[dict[str, Any] | None] = mapped_column(
        JsonVariant
    )

    tenant: Mapped[Tenant] = relationship(back_populates="facilities")
    plan_override: Mapped[Plan | None] = relationship()
