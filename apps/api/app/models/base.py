import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column

#: Control-plane (platform) tablolarinin SEMBOLIK sema adi.
#:
#: Gercek bir Postgres semasi degildir; calisma aninda her baglantiya
#: verilen ``schema_translate_map`` bunu gercek semaya cevirir
#: (uretimde ``public``, testlerde ``None``). Boylece tek bir model
#: tanimi hem tenant semalarinda hem control-plane'de kullanilabilir.
#:
#: DUZLEM AYRIMI:
#:   - ``schema=CONTROL_SCHEMA`` -> tum tenant'lar icin ORTAK tablo
#:     (tenants, plans, platform_users, tenant_datastores, ...)
#:   - ``schema=None``           -> her tenant'in KENDI semasindaki tablo
#:     (facilities, appointments, docks, tenant_users, ...)
CONTROL_SCHEMA = "control"

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

# JSONB Postgres'te; testlerde (SQLite) generic JSON'a duser.
JsonVariant = sa.JSON().with_variant(JSONB(), "postgresql")


def str_enum(enum_cls: type[Enum]) -> sa.Enum:
    """Enum'lari tasinabilirlik icin native olmayan (varchar) kolon olarak sakla."""
    return sa.Enum(
        enum_cls,
        native_enum=False,
        length=32,
        values_callable=lambda e: [m.value for m in e],
    )


class Base(DeclarativeBase):
    metadata = sa.MetaData(naming_convention=NAMING_CONVENTION)


class UUIDPkMixin:
    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
        nullable=False,
    )


class FacilityScopedMixin:
    """Operasyonel tablolarin tenant + facility tasiyicisi.

    Not: izolasyonun BIRINCIL mekanizmasi artik bu kolonlar degil, tablonun
    hangi semada durdugudur (bkz. CONTROL_SCHEMA). tenant_id ikinci savunma
    hatti ve control-plane'e referans olarak korunur.
    """

    @declared_attr
    def tenant_id(cls) -> Mapped[uuid.UUID]:  # noqa: N805
        return mapped_column(
            sa.Uuid,
            sa.ForeignKey(f"{CONTROL_SCHEMA}.tenants.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )

    @declared_attr
    def facility_id(cls) -> Mapped[uuid.UUID]:  # noqa: N805
        return mapped_column(
            sa.Uuid,
            sa.ForeignKey("facilities.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
