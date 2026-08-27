"""Tenant-plane ticket tablolari: musteri projeksiyonu ve giden komut kuyrugu.

Bu tablolar her tenant'in KENDI semasindadir. Sema izolasyonu birincil
savunmadir: bir sorguda `requester_id` filtresi unutulsa bile baska bir
tenant'in ticketina ULASILAMAZ, cunku o satirlar baska bir semadadir.

OTORITE HERMES'TEDIR. Buradaki satirlar merkezi yasam dongusunun okunabilir
KOPYASIDIR; status/resolution alanlari yalnizca dogrulanmis Hermes olayindan
veya snapshot'tan yazilir. Kullanici komutlari (yanit, reopen, kapatma onayi)
projeksiyonu dogrudan degistirmez; outbox uzerinden Hermes'e gider.
"""

import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import (
    TicketAttachmentScanStatus,
    TicketCategory,
    TicketCommandType,
    TicketDeliveryStatus,
    TicketImpact,
    TicketMessageAuthorType,
    TicketOutboxStatus,
    TicketRequesterType,
    TicketStatus,
)
from app.models.base import (
    Base,
    FacilityScopedMixin,
    JsonVariant,
    TimestampMixin,
    UUIDPkMixin,
    str_enum,
)


class SupportTicketProjection(Base, UUIDPkMixin, TimestampMixin, FacilityScopedMixin):
    """Musterinin gordugu ticket kaydi.

    `id` ayni zamanda Hermes'e gonderilen `source_ticket_id`'dir ve retry'larda
    DEGISMEZ — duplicate canonical ticket olmamasinin temel garantisi budur.
    """

    __tablename__ = "support_ticket_projections"
    __table_args__ = (
        sa.Index("ix_support_tickets_requester", "requester_type", "requester_id"),
        sa.Index("ix_support_tickets_status_updated", "remote_status", "updated_at"),
        sa.Index("ix_support_tickets_delivery", "delivery_status"),
        sa.UniqueConstraint("remote_ticket_id", name="uq_support_tickets_remote_id"),
    )

    # --- kaynak kimlik ---
    requester_type: Mapped[TicketRequesterType] = mapped_column(
        str_enum(TicketRequesterType)
    )
    requester_id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, index=True)
    #: Ad/e-posta snapshot'i: kullanici pasiflestirilse bile destek yazismasi
    #: baglamini kaybetmesin diye tutulur (Hermes'e giden snapshot ile ayni).
    requester_name: Mapped[str | None] = mapped_column(sa.String(255))
    requester_email: Mapped[str | None] = mapped_column(sa.String(255))
    #: Tedarikci talebiyse hangi firma — yonetim listesinde gorunur.
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid, index=True)
    supplier_name: Mapped[str | None] = mapped_column(sa.String(255))

    # --- canonical kimlik (Hermes) ---
    remote_ticket_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    remote_ticket_number: Mapped[str | None] = mapped_column(sa.String(40), index=True)

    # --- form alanlari ---
    title: Mapped[str] = mapped_column(sa.String(200))
    description: Mapped[str] = mapped_column(sa.Text)
    category: Mapped[TicketCategory] = mapped_column(str_enum(TicketCategory), index=True)
    impact: Mapped[TicketImpact] = mapped_column(str_enum(TicketImpact))
    reproduction_steps: Mapped[str | None] = mapped_column(sa.Text)
    expected_result: Mapped[str | None] = mapped_column(sa.Text)
    actual_result: Mapped[str | None] = mapped_column(sa.Text)
    error_code: Mapped[str | None] = mapped_column(sa.String(120))
    correlation_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    occurred_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    #: Allowlist'ten gecmis tarayici baglami (query string/cookie/token YOK).
    client_context_json: Mapped[dict[str, Any] | None] = mapped_column(JsonVariant)

    # --- yonlendirme snapshot'i ---
    route_group_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    route_group_name: Mapped[str | None] = mapped_column(sa.String(255))
    route_version: Mapped[int | None] = mapped_column(sa.Integer)

    # --- merkezi durum (yalnizca Hermes olaylarindan yazilir) ---
    remote_status: Mapped[TicketStatus] = mapped_column(
        str_enum(TicketStatus), default=TicketStatus.open
    )
    #: Uygulanmis en yuksek Hermes aggregate versiyonu. Sirasiz olaylarda
    #: karar bu alana gore verilir (bkz. projection apply algoritmasi).
    aggregate_version: Mapped[int] = mapped_column(
        sa.Integer, default=0, server_default="0"
    )
    #: Olay atlandiginda isaretlenir; reconciliation snapshot cekip onarir.
    sync_gap: Mapped[bool] = mapped_column(
        sa.Boolean, default=False, server_default=sa.false()
    )

    # --- cozum (public alanlar) ---
    resolution_summary: Mapped[str | None] = mapped_column(sa.Text)
    resolution_code: Mapped[str | None] = mapped_column(sa.String(40))
    resolution_fix_version: Mapped[str | None] = mapped_column(sa.String(120))
    resolved_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    resolved_by_group_name: Mapped[str | None] = mapped_column(sa.String(255))
    closed_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    first_response_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))

    # --- yerel teslimat durumu (LogiSlot'a ozel; Hermes bilmez) ---
    delivery_status: Mapped[TicketDeliveryStatus] = mapped_column(
        str_enum(TicketDeliveryStatus), default=TicketDeliveryStatus.pending
    )
    last_sync_error_code: Mapped[str | None] = mapped_column(sa.String(64))
    last_sync_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    remote_created_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    remote_updated_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))

    messages: Mapped[list["SupportTicketMessageProjection"]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan"
    )
    attachments: Mapped[list["SupportTicketAttachmentProjection"]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan"
    )


class SupportTicketMessageProjection(Base, UUIDPkMixin):
    """Yalnizca PUBLIC konusma. Ic notlar buraya asla yazilmaz.

    `visibility` kolonu tek bir degere ('public') CHECK ile kisitlanmistir:
    kaynak olaylar zaten yalnizca public mesaj tasir, bu kisit ikinci savunma
    hattidir — bir gun hatali bir kod ic not yazmaya kalkarsa veritabani
    reddeder.
    """

    __tablename__ = "support_ticket_message_projections"
    __table_args__ = (
        sa.CheckConstraint("visibility = 'public'", name="public_only"),
        sa.UniqueConstraint("remote_message_id", name="uq_support_ticket_messages_remote"),
        sa.Index("ix_support_ticket_messages_ticket_created", "ticket_id", "created_at"),
    )

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid,
        # Kisit adi ACIKCA verilir. Adlandirma sozlesmesinin uretecegi ad
        # Postgres'in 63 karakter sinirini asar; SQLAlchemy onu SESSIZCE
        # kisaltip sonuna hash ekler, elle yazilan migration ise ayni adi
        # uretemez. Iki taraf ayrisinca "yeni sema modelden, eski sema
        # migrationdan" kurali bozulur (bkz. app/models/ticketing_ddl.py).
        sa.ForeignKey(
            "support_ticket_projections.id",
            ondelete="CASCADE",
            name="fk_support_ticket_messages_ticket_id",
        ),
        index=True,
    )
    remote_message_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    visibility: Mapped[str] = mapped_column(
        sa.String(10), default="public", server_default="public"
    )
    author_type: Mapped[TicketMessageAuthorType] = mapped_column(
        str_enum(TicketMessageAuthorType)
    )
    author_display_name: Mapped[str | None] = mapped_column(sa.String(255))
    body: Mapped[str] = mapped_column(sa.Text)
    body_format: Mapped[str] = mapped_column(
        sa.String(20), default="text", server_default="text"
    )
    #: Olayin tasidigi aggregate versiyonu (sirasiz teslimat teshisi icin).
    aggregate_version: Mapped[int | None] = mapped_column(sa.Integer)
    #: Musteri yaniti henuz Hermes'e ulasmadiysa "gonderiliyor" gosterilir.
    is_pending: Mapped[bool] = mapped_column(
        sa.Boolean, default=False, server_default=sa.false()
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now()
    )

    ticket: Mapped[SupportTicketProjection] = relationship(back_populates="messages")


class SupportTicketAttachmentProjection(Base, UUIDPkMixin):
    """Ek dosya METADATASI. Binary ve imzali URL veritabaninda TUTULMAZ.

    Indirme her seferinde yetki kontrolunden gecip Hermes'ten kisa omurlu bir
    URL ister; kalici bir baglanti saklamak, ticket yetkisi kalkmis birinin
    dosyaya erismesi demek olurdu.
    """

    __tablename__ = "support_ticket_attachment_projections"
    __table_args__ = (
        sa.UniqueConstraint("upload_id", name="uq_support_ticket_attachments_upload"),
        sa.Index("ix_support_ticket_attachments_ticket", "ticket_id"),
    )

    ticket_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.Uuid,
        # Kisa ACIK ad — sozlesme adi 63 karakteri asar (bkz. yukarisi).
        sa.ForeignKey(
            "support_ticket_projections.id",
            ondelete="CASCADE",
            name="fk_support_ticket_attachments_ticket_id",
        ),
        index=True,
    )
    message_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.Uuid,
        sa.ForeignKey(
            "support_ticket_message_projections.id",
            ondelete="SET NULL",
            name="fk_support_ticket_attachments_message_id",
        ),
    )
    #: Hermes upload oturumunun kimligi; ticket olusturulmadan once vardir.
    upload_id: Mapped[uuid.UUID] = mapped_column(sa.Uuid)
    remote_attachment_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    file_name: Mapped[str] = mapped_column(sa.String(255))
    mime_type: Mapped[str | None] = mapped_column(sa.String(120))
    size_bytes: Mapped[int | None] = mapped_column(sa.BigInteger)
    scan_status: Mapped[TicketAttachmentScanStatus] = mapped_column(
        str_enum(TicketAttachmentScanStatus), default=TicketAttachmentScanStatus.pending_scan
    )
    #: Yalnizca 'public' ekler projeksiyona girer.
    visibility: Mapped[str] = mapped_column(
        sa.String(10), default="public", server_default="public"
    )
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now()
    )

    ticket: Mapped[SupportTicketProjection | None] = relationship(
        back_populates="attachments"
    )


class SupportTicketOutbox(Base, UUIDPkMixin):
    """Hermes'e gidecek komutlarin transactional outbox'i.

    Yerel projeksiyon ve bu satir AYNI tenant transaction'inda yazilir. Boylece
    "kullaniciya kaydettim dedim ama gonderilmedi" durumu olusamaz: kayit varsa
    komut da vardir, yoksa ikisi de yoktur.

    `command_id` ayni zamanda Idempotency-Key'dir; ayni satirin tekrar
    gonderilmesi Hermes tarafinda ayni yaniti dondurur.
    """

    __tablename__ = "support_ticket_outbox"
    __table_args__ = (
        sa.Index("ix_support_ticket_outbox_due", "status", "next_attempt_at"),
        sa.Index("ix_support_ticket_outbox_ticket", "ticket_id"),
        sa.UniqueConstraint("command_id", name="uq_support_ticket_outbox_command"),
    )

    #: Idempotency-Key. Ayni komut icin SABIT; yalnizca route kurtarmasinda
    #: yeni bir komut satiri (yeni key) uretilir, source_ticket_id degismez.
    command_id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid,
        sa.ForeignKey(
            "support_ticket_projections.id",
            ondelete="CASCADE",
            name="fk_support_ticket_outbox_ticket_id",
        ),
        index=True,
    )
    #: Yerel mesaj satiri (public_reply komutlarinda) — ack gelince
    #: `is_pending` bayragini dusurmek icin.
    message_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    command_type: Mapped[TicketCommandType] = mapped_column(str_enum(TicketCommandType))
    payload_version: Mapped[str] = mapped_column(
        sa.String(10), default="1.0", server_default="1.0"
    )
    payload_json: Mapped[dict[str, Any]] = mapped_column(JsonVariant)
    correlation_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    status: Mapped[TicketOutboxStatus] = mapped_column(
        str_enum(TicketOutboxStatus), default=TicketOutboxStatus.pending, index=True
    )
    attempts: Mapped[int] = mapped_column(sa.Integer, default=0, server_default="0")
    next_attempt_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), index=True
    )
    last_error_code: Mapped[str | None] = mapped_column(sa.String(64))
    #: Kullaniciya gosterilmeden once secret/token deseni temizlenmis mesaj.
    last_error_message: Mapped[str | None] = mapped_column(sa.String(500))
    locked_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    locked_by: Mapped[str | None] = mapped_column(sa.String(64))
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now()
    )
    sent_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    dead_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
