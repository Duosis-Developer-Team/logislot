"""Control-plane ticket tablolari: yonlendirme, katalog onbellegi, webhook inbox.

Bu uc tablo TENANT SEMASINDA DEGIL control-plane'de yasar; ucunun de sebebi
ayni: sorulari bir tenant'in kendi semasindan cevaplanamaz.

  * routing config   -> Platform Yoneticisi tenant'lar ARASI yonetir.
  * katalog cache    -> Hermes gruplari tenant'a ait degildir, ortaktir.
  * webhook inbox    -> gelen olay once "hangi tenant" sorusunu cozmelidir.

Ticket ICERIGI burada TUTULMAZ. Inbox payload'i musteriye gorunur alanlarla
sinirlidir ve Hermes'in ic notlari hicbir kosulda buraya yazilmaz.
"""

import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import TicketWebhookStatus
from app.integrations.hermes_contract import APPLICATION_CODE
from app.models.base import (
    CONTROL_SCHEMA,
    Base,
    JsonVariant,
    TimestampMixin,
    UUIDPkMixin,
    str_enum,
)


class TicketRoutingConfig(Base, UUIDPkMixin, TimestampMixin):
    """Bir tenant'in ticketlarinin dustugu TEK aktif Hermes grubu.

    V1 karari (D-004): tenant basina tam olarak bir aktif hedef grup. Son
    kullanici grup SECMEZ; yalnizca degistirilemez hedef ekip adini gorur.
    Bu yuzden burada bir liste degil, tekil bir grup vardir ve unique kisit
    `(tenant_id, application_code)` uzerindedir.
    """

    __tablename__ = "ticket_routing_configs"
    __table_args__ = (
        sa.UniqueConstraint(
            "tenant_id", "application_code", name="uq_ticket_routing_configs_tenant_app"
        ),
        {"schema": CONTROL_SCHEMA},
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid,
        sa.ForeignKey(f"{CONTROL_SCHEMA}.tenants.id", ondelete="CASCADE"),
        index=True,
    )
    application_code: Mapped[str] = mapped_column(
        sa.String(50), default=APPLICATION_CODE, server_default=APPLICATION_CODE
    )
    hermes_group_id: Mapped[uuid.UUID] = mapped_column(sa.Uuid)
    #: Yalnizca GOSTERIM icin snapshot; yetkilendirme buna gore YAPILMAZ.
    hermes_group_name_snapshot: Mapped[str | None] = mapped_column(sa.String(255))
    #: Her kayitta artan tam sayi — create payload'inda tasinir ve Hermes
    #: eski bir route ile gelen istegi `route_stale` ile reddedebilir.
    route_version: Mapped[int] = mapped_column(sa.Integer, default=1, server_default="1")
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, default=True, server_default=sa.true()
    )
    #: Hermes'e en son BASARIYLA dogrulatildigi an.
    last_verified_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    #: Dogrulamada kullanilan katalog surumu (ETag/timestamp).
    catalog_version: Mapped[str | None] = mapped_column(sa.String(128))
    last_error_code: Mapped[str | None] = mapped_column(sa.String(64))
    last_error_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    configured_by_platform_user_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)


class HermesGroupCatalogCache(Base, UUIDPkMixin, TimestampMixin):
    """Hermes Duosis aktif gruplarinin okunabilir kopyasi.

    OTORITE DEGILDIR: kaydetme ve ticket olusturma dogrulamasi her zaman uzak
    servise sorar. Cache yalnizca platform ekranini her acilista Hermes'e
    gitmekten kurtarir ve Hermes gecici erisilemezken "son bilinen liste"
    gosterilmesini saglar (yeni/degistirilmis route kaydi yine engellenir).

    Uye kimligi/e-postasi BURADA TUTULMAZ — katalog zaten dondurmez.
    """

    __tablename__ = "hermes_group_catalog_cache"
    __table_args__ = (
        sa.UniqueConstraint(
            "application_code", "group_id", name="uq_hermes_group_catalog_app_group"
        ),
        {"schema": CONTROL_SCHEMA},
    )

    application_code: Mapped[str] = mapped_column(
        sa.String(50), default=APPLICATION_CODE, server_default=APPLICATION_CODE
    )
    group_id: Mapped[uuid.UUID] = mapped_column(sa.Uuid)
    name: Mapped[str] = mapped_column(sa.String(255))
    description: Mapped[str | None] = mapped_column(sa.Text)
    member_count: Mapped[int | None] = mapped_column(sa.Integer)
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, default=True, server_default=sa.true()
    )
    catalog_version: Mapped[str | None] = mapped_column(sa.String(128))
    remote_updated_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    fetched_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now()
    )


class TicketWebhookInbox(Base, UUIDPkMixin):
    """Hermes'ten gelen imzali olaylarin idempotent giris defteri.

    `event_id` UNIQUE'tir: ayni olayin tekrar gonderilmesi (Hermes retry veya
    saldirgan replay) ikinci bir projeksiyon/bildirim URETMEZ.

    Iki veritabani transaction'i atomik olamayacagi icin akis bilerek
    "once tenant projeksiyonu commit, sonra inbox processed" sirasindadir:
    arada cokme olursa olay TEKRAR islenir ve version kontrolu sayesinde
    no-op olur. Ters sira sessiz veri kaybi olurdu.
    """

    __tablename__ = "ticket_webhook_inbox"
    __table_args__ = (
        sa.Index("ix_ticket_webhook_inbox_status_attempt", "status", "next_attempt_at"),
        sa.Index("ix_ticket_webhook_inbox_source_ticket", "source_ticket_id"),
        {"schema": CONTROL_SCHEMA},
    )

    event_id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, unique=True, index=True)
    application_code: Mapped[str] = mapped_column(sa.String(50))
    #: Kaynak tenant kimligi = LogiSlot control.tenants.id. FK KURULMAZ:
    #: taninmayan bir tenant icin gelen olay da kayda gecmeli ve
    #: `source_tenant_unknown` olarak incelenebilmelidir.
    source_tenant_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid, index=True)
    source_ticket_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    remote_ticket_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    remote_ticket_number: Mapped[str | None] = mapped_column(sa.String(40))
    event_type: Mapped[str] = mapped_column(sa.String(80), index=True)
    aggregate_version: Mapped[int | None] = mapped_column(sa.Integer)
    sequence: Mapped[int | None] = mapped_column(sa.Integer)
    occurred_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    correlation_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    #: Musteriye gorunur payload. Ic not/root cause ASLA yazilmaz; yazan bir
    #: olay gelirse dogrulama katmani onu reddeder ve guvenlik logu uretir.
    payload_json: Mapped[dict[str, Any] | None] = mapped_column(JsonVariant)
    status: Mapped[TicketWebhookStatus] = mapped_column(
        str_enum(TicketWebhookStatus), default=TicketWebhookStatus.received, index=True
    )
    attempts: Mapped[int] = mapped_column(sa.Integer, default=0, server_default="0")
    next_attempt_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    last_error_code: Mapped[str | None] = mapped_column(sa.String(64))
    #: Olayi isleyen surecin kilidi — takilan kayitlari kurtarma isi bulur.
    locked_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now()
    )
    processed_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
