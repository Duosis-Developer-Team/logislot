"""Sema-basina-tenant altyapisinin degismezleri (invariant).

Bu testler is kurallarini degil, izolasyon mekanizmasinin BOZULMAMASI
gereken sozlesmelerini korur. Ozellikle `translate_map` anahtar kumesi
testi kritiktir: kural bozulursa uretimde SQLAlchemy'nin derlenmis sorgu
onbellegi InvalidRequestError firlatir ve API tamamen durur.
"""

import uuid

import pytest

from app.core.errors import ApiError
from app.core.tenancy_runtime import (
    CONTROL_LOCATION,
    TenantLocation,
    schema_name_for,
    translate_map,
)
from app.models.base import CONTROL_SCHEMA
from app.tenancy.directory import claim_email, claim_email_once, tenant_for_email


def test_translate_map_anahtar_kumesi_her_zaman_ayni():
    """SQLAlchemy sozlesmesi: ardisik haritalar AYNI anahtarlari tasimali.

    Farkli anahtar kumeleri derlenmis sorgu onbellegini bozar
    (InvalidRequestError). Bu yuzden hicbir yol None veya 'control'
    anahtarini atlamamalidir.
    """
    beklenen = {None, CONTROL_SCHEMA}
    for dialect in ("postgresql", "sqlite"):
        for schema in (None, "t_" + "0" * 32, "public"):
            assert set(translate_map(schema, dialect_name=dialect)) == beklenen


def test_postgres_haritasi_control_plane_i_public_e_sabitler():
    harita = translate_map("t_abc", dialect_name="postgresql")
    assert harita[None] == "t_abc"
    assert harita[CONTROL_SCHEMA] == "public"


def test_kaydi_olmayan_tenant_eski_yerlesime_duser():
    """Gecis donemi sozlesmesi: sema yoksa ortak tablolar kullanilir."""
    harita = translate_map(None, dialect_name="postgresql")
    assert harita[None] == "public"


def test_sema_adi_uuid_den_turer_ve_slug_dan_bagimsizdir():
    tid = uuid.UUID("940d83e7-e0f8-4996-b002-923cccfa3971")
    assert schema_name_for(tid) == "t_940d83e7e0f84996b002923cccfa3971"
    # Postgres identifier siniri 63 bayt
    assert len(schema_name_for(uuid.uuid4())) <= 63
    # Ayni tenant her zaman ayni semaya cozulur (slug degisse bile)
    assert schema_name_for(tid) == schema_name_for(tid)


def test_control_location_kimliksiz_istegin_varsayilanidir():
    assert CONTROL_LOCATION.is_control
    assert not TenantLocation(schema="t_x").is_control


async def test_dizin_ayni_e_postayi_iki_tenant_a_vermez(seeded, session_maker):
    """Tablolar semalara bolununce kaybolan GLOBAL benzersizligi dizin korur."""
    tenant_id = seeded["tenant"].id
    other_tenant = uuid.uuid4()
    async with session_maker() as db:
        await claim_email_once(
            db, principal_id=uuid.uuid4(), user_type="tenant",
            email="ortak@ornek.com", tenant_id=tenant_id,
        )
        with pytest.raises(ApiError) as exc:
            await claim_email_once(
                db, principal_id=uuid.uuid4(), user_type="tenant",
                email="ortak@ornek.com", tenant_id=other_tenant,
            )
        assert exc.value.code == "DUPLICATE_EMAIL"


async def test_dizin_ayni_e_postaya_farkli_portalda_izin_verir(seeded, session_maker):
    """Bir e-posta hem tenant hem tedarikci hesabi olabilir (mevcut davranis)."""
    tenant_id = seeded["tenant"].id
    async with session_maker() as db:
        await claim_email_once(
            db, principal_id=uuid.uuid4(), user_type="tenant",
            email="ikili@ornek.com", tenant_id=tenant_id,
        )
        await claim_email_once(
            db, principal_id=uuid.uuid4(), user_type="supplier",
            email="ikili@ornek.com", tenant_id=tenant_id,
        )
        assert await tenant_for_email(db, "supplier", "ikili@ornek.com") is not None


async def test_onaylanmayan_talep_geri_alinir(seeded, session_maker):
    """confirm() cagrilmazsa e-posta rezervasyonu birakilir (telafi)."""
    tenant_id = seeded["tenant"].id
    pid = uuid.uuid4()
    async with session_maker() as db:
        with pytest.raises(RuntimeError):
            async with claim_email(
                db, principal_id=pid, user_type="tenant",
                email="yarim@ornek.com", tenant_id=tenant_id,
            ):
                raise RuntimeError("kullanici yazimi patladi")
        # Rezervasyon geri birakildigi icin e-posta yeniden alinabilir
        assert await tenant_for_email(db, "tenant", "yarim@ornek.com") is None


async def test_dizin_aramasi_login_ile_ayni_semantikte_tam_eslemedir(seeded, session_maker):
    """Yonlendirme, login sorgusuyla AYNI eslemeyi kullanmali.

    Aksi halde yalnizca harf durumuyla ayrisan iki hesaptan biri digerinin
    semasina yonlendirilir ve dogru parolaya ragmen 401 alir.
    """
    tenant_id = seeded["tenant"].id
    async with session_maker() as db:
        await claim_email_once(
            db, principal_id=uuid.uuid4(), user_type="tenant",
            email="Karisik@Ornek.com", tenant_id=tenant_id,
        )
        assert await tenant_for_email(db, "tenant", "Karisik@Ornek.com") is not None
        assert await tenant_for_email(db, "tenant", "karisik@ornek.com") is None


def test_sema_silme_yalnizca_beklenen_adi_hedefler():
    """Yikici islem: kalip disindaki hicbir ad kabul edilmemeli."""
    from app.tenancy.provisioning import _TENANT_SCHEMA_RE

    assert _TENANT_SCHEMA_RE.match(schema_name_for(uuid.uuid4()))
    for tehlikeli in ("public", "information_schema", "t_x", "t_" + "g" * 32, ""):
        assert not _TENANT_SCHEMA_RE.match(tehlikeli)
