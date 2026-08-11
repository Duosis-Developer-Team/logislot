"""Control-plane tenancy tablolari: veri yerlesimi ve login yonlendirmesi.

Bu iki tablo TENANT SEMASINDA DEGIL, control-plane'de yasar; cunku ikisi de
"hangi tenant nerede" sorusunu yanitlar ve bu soru bir tenant'in kendi
semasindan cevaplanamaz.
"""

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import DatastoreStatus
from app.models.base import (
    CONTROL_SCHEMA,
    Base,
    TimestampMixin,
    UUIDPkMixin,
    str_enum,
)


class TenantDatastore(Base, UUIDPkMixin, TimestampMixin):
    """Bir tenant'in verisinin FIZIKSEL olarak nerede durdugunu soyler.

    Kayit yoksa tenant henuz eski (ortak) yerlesimdedir; kayit ``ready``
    ise tum istekleri kendi semasina yonlendirilir. Bu tablo, tasima
    surecinin tek dogruluk kaynagidir.
    """

    __tablename__ = "tenant_datastores"
    __table_args__ = {"schema": CONTROL_SCHEMA}

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid,
        sa.ForeignKey(f"{CONTROL_SCHEMA}.tenants.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    #: Postgres sema adi. Tenant UUID'sinden turetilir — slug DEGISEBILIR,
    #: sema adi ise asla degismemelidir (yeniden adlandirma = veri tasima).
    schema_name: Mapped[str] = mapped_column(sa.String(63), unique=True)
    #: None = control-plane veritabani (varsayilan yerlesim).
    #: Dolu ise ayarlardaki DSN haritasinda aranan ANAHTAR'dir; DSN'in
    #: kendisi (parola iceriyor) veritabaninda TUTULMAZ, secret'ta kalir.
    dsn_alias: Mapped[str | None] = mapped_column(sa.String(64))
    status: Mapped[DatastoreStatus] = mapped_column(
        str_enum(DatastoreStatus), default=DatastoreStatus.pending, index=True
    )
    provisioned_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    #: Semanin uzerinde calistirilmis son tenant-plane alembic revizyonu.
    migrated_revision: Mapped[str | None] = mapped_column(sa.String(64))
    notes: Mapped[str | None] = mapped_column(sa.Text)


class PrincipalDirectory(Base, TimestampMixin):
    """E-posta -> tenant yonlendirme dizini (login'in ilk adimi).

    Kullanici kayitlari tenant'in KENDI semasinda durdugundan, "bu e-posta
    hangi tenant'a ait" sorusu artik tek bir tablodan cevaplanamaz. Bu dizin
    yalnizca YONLENDIRME icin gereken en az veriyi tutar; parola ozeti, ad,
    tercihler gibi kisisel alanlar tenant semasinda kalir.

    (user_type, email) UNIQUE kisiti, tablolar semalara bolundukten sonra da
    "ayni e-posta iki tenant'ta olamaz" garantisini surdurur — bu garanti
    once tenant_users.email UNIQUE tarafindan saglaniyordu.
    """

    __tablename__ = "principal_directory"
    __table_args__ = (
        sa.UniqueConstraint("user_type", "email", name="uq_principal_directory_type_email"),
        {"schema": CONTROL_SCHEMA},
    )

    #: tenant_users.id veya supplier_users.id (platform kullanicilari
    #: control-plane'de yasadigi icin dizine GIRMEZ).
    principal_id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True)
    user_type: Mapped[str] = mapped_column(sa.String(20))
    email: Mapped[str] = mapped_column(sa.String(255), index=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid,
        sa.ForeignKey(f"{CONTROL_SCHEMA}.tenants.id", ondelete="CASCADE"),
        index=True,
    )
