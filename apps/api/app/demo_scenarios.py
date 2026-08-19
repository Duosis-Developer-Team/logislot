"""Sunum icin demo senaryo verisi (BTA / Cakes & Bakes evreni).

Calistirma:
    python -m app.demo_scenarios                  # slug: bta
    python -m app.demo_scenarios --slug bta --dry-run

`app.seed` bir kereliktir ve tenant varsa hic calismaz; bu modul ise
YENIDEN CALISTIRILABILIR ve TARIH-GORELIDIR: "bugun"un randevulari her
kosuda gercekten bugune yazilir. Demo ortamini sunum oncesi tazelemek icin
kullanilir.

Iki farkli davranis vardir, bilerek:

* Katalog (arac/urun kategorisi, rampa, tedarikci, portal hesabi) DOGAL
  ANAHTARIYLA aranir; varsa dokunulmaz, yoksa eklenir. Rampalarin kabul
  ettigi kategori listesi yalnizca EKLEYEREK genisletilir — mevcut
  kisitlar kaldirilmaz.
* Senaryo hareketleri (randevu, seri, bildirim, takvim istisnasi) her
  kosuda silinip yeniden yazilir. Kimlikleri uuid5 ile sabittir; bu yuzden
  silme YALNIZCA bu modulun urettigi satirlara dokunur, organik veriye
  DOKUNMAZ.

Veri kalitesi tesisin kendi konfigurasyonuna karsi dogrulanir: calisma
saatleri, takvim istisnalari, rampa-urun/arac uyumu ve ayni rampada zaman
cakismasi kontrol edilir. Gecemeyen satir sessizce dusurulur ve ozetde
raporlanir — boylece demo verisi kural motoruyla CELISMEZ.

PRODUCTION NOTU: demo hesaplar ve demo parolasi uretir; gercek musteri
verisi olan bir ortamda calistirilmaz.
"""

import argparse
import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.core.db import control_session, location_for_tenant, session_scope
from app.core.enums import (
    BLOCKING_APPOINTMENT_STATUSES,
    AppointmentStatus,
    CargoWindow,
    CreatedByType,
    DeliveryType,
    DockOverrideType,
    QuantityUnit,
    SupplierStatus,
)
from app.core.security import hash_password
from app.core.timeutils import to_utc
from app.models import (
    Appointment,
    AppointmentRevision,
    AppointmentSeries,
    Dock,
    DockOverride,
    Facility,
    Notification,
    ProductCategory,
    Supplier,
    SupplierUser,
    Tenant,
    TenantUser,
    VehicleCategory,
)
from app.tenancy.directory import ensure_registered

DEMO_PASSWORD = "Demo123!"

#: Senaryo satirlarinin kimligi bu namespace + tesis + anahtar ile uretilir.
#: Sabittir: degistirilirse eski senaryo satirlari YETIM kalir (silinemez).
DEMO_NAMESPACE = uuid.UUID("6f1c3f2a-9d54-4a8e-9b7f-0c2e5a11d3b7")

#: Gecmis raporlarin kapsadigi pencere (gun).
HISTORY_DAYS = 21

#: Slot arama adimi ve gun kaydirma ust siniri (yerlestirme dogrulamasi).
_SLOT_STEP_MINUTES = 30
_MAX_DAY_SHIFT = 7


def demo_id(facility_id: uuid.UUID, key: str) -> uuid.UUID:
    """Ayni anahtar -> ayni kimlik. Idempotent silme/yazmanin dayanagi."""
    return uuid.uuid5(DEMO_NAMESPACE, f"{facility_id}:{key}")


# --------------------------------------------------------------------------
# Katalog tanimlari — tesisin hikayesi: pastane/unlu mamul uretim tesisi
# --------------------------------------------------------------------------

VEHICLE_CATEGORIES = [
    {
        "name": "Tanker",
        "display_name": "Tanker (Dokme Sivi)",
        "physical_note": "Pompa hattina yanasir; yalnizca sivi hammadde rampasi.",
    },
]

PRODUCT_CATEGORIES = [
    {
        "name": "Seker ve Kuru Gida",
        "display_name": "Seker ve Kuru Gida",
        "description": "Toz seker, nisasta, kakao, pudra sekeri.",
        "min_block_minutes": 45,
        "max_block_minutes": 150,
        "vehicle": "TIR",
    },
    {
        "name": "Yag ve Sivi Hammadde",
        "display_name": "Yag ve Sivi Hammadde",
        "description": "Sivi yag, glikoz surubu, margarin; dokme bosaltma.",
        "min_block_minutes": 60,
        "max_block_minutes": 180,
        "vehicle": "Tanker",
    },
    {
        "name": "Katki ve Aroma",
        "display_name": "Katki ve Aroma",
        "description": "Kabartma tozu, vanilin, gida boyasi; kucuk miktar.",
        "min_block_minutes": 30,
        "max_block_minutes": 60,
        "vehicle": "Kamyonet",
    },
    {
        "name": "Kuruyemis ve Meyve Dolgu",
        "display_name": "Kuruyemis ve Meyve Dolgu",
        "description": "Findik, ceviz, kuru uzum, meyve dolgusu.",
        "min_block_minutes": 45,
        "max_block_minutes": 120,
        "vehicle": "Kamyon",
    },
]

DOCKS = [
    {
        "name": "Rampa 4",
        "note": "Sivi hammadde pompa hatti; yalnizca tanker yanasir.",
        "products": ["Yag ve Sivi Hammadde"],
        "vehicles": ["Tanker"],
    },
]

#: Mevcut rampalarin kabul listesine EKLENECEK kategoriler (kaldirma YOK).
DOCK_PRODUCT_EXTENSIONS = {
    "Rampa 1": ["Seker ve Kuru Gida", "Kuruyemis ve Meyve Dolgu"],
    "Rampa 2": ["Seker ve Kuru Gida"],
    "Rampa 3": ["Katki ve Aroma"],
}

SUPPLIERS = [
    {
        "code": "SUP-004",
        "company_name": "Trakya Seker ve Nisasta A.S.",
        "category_label": "Seker / Kuru Gida",
        "contact_name": "Burak Yildirim",
        "contact_email": "tedarik@trakyaseker.example.com",
        "contact_phone": "+90 282 000 00 04",
        "account_email": "tedarikci@trakyaseker.com",
        "categories": ["Seker ve Kuru Gida", "Genel"],
        "auto_approval_enabled": False,
        "cargo_enabled": False,
        "min_block_minutes": 45,
        "max_block_minutes": 150,
        "weekly_quota": 6,
        "monthly_quota": 20,
        "notes": "Sozlesmeli seker/nisasta tedarikcisi; TIR ile dokme cuval teslimati.",
    },
    {
        "code": "SUP-005",
        "company_name": "Ege Yag Sanayi A.S.",
        "category_label": "Sivi Hammadde",
        "contact_name": "Selin Ozturk",
        "contact_email": "planlama@egeyag.example.com",
        "contact_phone": "+90 232 000 00 05",
        "account_email": "tedarikci@egeyag.com",
        "categories": ["Yag ve Sivi Hammadde"],
        "auto_approval_enabled": True,
        "cargo_enabled": False,
        "min_block_minutes": 60,
        "max_block_minutes": 180,
        "weekly_quota": 4,
        "monthly_quota": 14,
        "notes": "Tanker ile dokme bosaltma; yalnizca Rampa 4 pompa hattini kullanir.",
    },
    {
        "code": "SUP-006",
        "company_name": "Trakya Sut ve Yumurta Koop.",
        "category_label": "Soguk Zincir",
        "contact_name": "Hakan Aydin",
        "contact_email": "sevkiyat@trakyasut.example.com",
        "contact_phone": "+90 282 000 00 06",
        "account_email": "tedarikci@trakyasut.com",
        "categories": ["Soguk Zincir"],
        "auto_approval_enabled": True,
        "cargo_enabled": False,
        "min_block_minutes": 45,
        "max_block_minutes": 120,
        "weekly_quota": 12,
        "monthly_quota": 45,
        "notes": "Haftalik sozlesmeli sut/yumurta teslimati; tekrarlayan seri ornegi bu hesapta.",
    },
    {
        "code": "SUP-007",
        "company_name": "Bosphorus Ambalaj ve Etiket",
        "category_label": "Ambalaj",
        "contact_name": "Elif Sahin",
        "contact_email": "siparis@bosphorusambalaj.example.com",
        "contact_phone": "+90 216 000 00 07",
        "account_email": "tedarikci@bosphorusambalaj.com",
        "categories": ["Ambalaj", "Genel"],
        "auto_approval_enabled": False,
        # Kargo teslimati acik: yeni "tedarikci bazinda kargo" ozelliginin vitrini.
        "cargo_enabled": True,
        "min_block_minutes": 30,
        "max_block_minutes": 90,
        "weekly_quota": 8,
        "monthly_quota": 30,
        "notes": "Karton/etiket tedarikcisi; kucuk gonderilerde kargo teslimati aciktir.",
    },
    {
        "code": "SUP-008",
        "company_name": "Anadolu Aroma ve Katki Ltd.",
        "category_label": "Katki / Aroma",
        "contact_name": "Deniz Korkmaz",
        "contact_email": "lab@anadoluaroma.example.com",
        "contact_phone": "+90 312 000 00 08",
        "account_email": "tedarikci@anadoluaroma.com",
        "categories": ["Katki ve Aroma", "Genel"],
        "auto_approval_enabled": False,
        "cargo_enabled": True,
        "min_block_minutes": 30,
        "max_block_minutes": 60,
        "weekly_quota": 5,
        "monthly_quota": 18,
        "notes": "Dusuk hacim / yuksek deger; kucuk arac ve kargo ile teslimat.",
    },
    {
        "code": "SUP-009",
        "company_name": "Karadeniz Kuruyemis A.S.",
        "category_label": "Kuruyemis",
        "contact_name": "Emre Tasdemir",
        "contact_email": "satis@karadenizkuruyemis.example.com",
        "contact_phone": "+90 454 000 00 09",
        "account_email": "tedarikci@karadenizkuruyemis.com",
        "categories": ["Kuruyemis ve Meyve Dolgu", "Genel"],
        "auto_approval_enabled": False,
        "cargo_enabled": False,
        "min_block_minutes": 45,
        "max_block_minutes": 120,
        "weekly_quota": 5,
        "monthly_quota": 16,
        "notes": "Sezonluk findik/ceviz alimlari; hasat doneminde talep yogunlasir.",
    },
]

DRIVERS = [
    ("Osman Celik", "+90 555 000 01 01"),
    ("Murat Duman", "+90 555 000 01 02"),
    ("Kadir Yalcin", "+90 555 000 01 03"),
    ("Serkan Aslan", "+90 555 000 01 04"),
    ("Ilker Bozkurt", "+90 555 000 01 05"),
    ("Volkan Ekinci", "+90 555 000 01 06"),
    ("Hasan Kurt", "+90 555 000 01 07"),
    ("Tolga Sezer", "+90 555 000 01 08"),
]


@dataclass
class Row:
    """Tek bir senaryo randevusu. `key` idempotent kimligin dayanagidir."""

    key: str
    supplier: str  # tedarikci kodu
    category: str  # urun kategorisi adi
    vehicle: str  # arac kategorisi adi
    dock: str  # rampa adi
    day: int  # bugune gore gun farki (negatif = gecmis)
    hour: int
    minutes: int
    status: AppointmentStatus
    product: str
    quantity: int
    unit: QuantityUnit = QuantityUnit.pallet
    minute: int = 0
    plate: str | None = None
    delivery: DeliveryType = DeliveryType.standard
    window: CargoWindow | None = None
    reason: str | None = None  # red / iptal gerekcesi
    completion_note: str | None = None
    revised_from_hour: int | None = None  # revizyon oncesi saat (revision_pending)
    revision_note: str | None = None
    created_by: CreatedByType = CreatedByType.supplier
    series_key: str | None = None
    occurrence_index: int | None = None


# --------------------------------------------------------------------------
# BUGUN — sunumun ana ekrani: dolu ama tutarli bir operasyon gunu
# --------------------------------------------------------------------------

TODAY_ROWS = [
    # ---- Rampa 1: buyuk arac / kuru hammadde
    Row("t-r1-0800", "SUP-001", "Unlu Mamul Hammaddesi", "TIR", "Rampa 1", 0, 8, 60,
        AppointmentStatus.completed, "Bugday Unu Tip 550", 24, plate="34 UN 1450",
        completion_note="24 palet eksiksiz teslim alindi; numune kalite kontrole gonderildi."),
    Row("t-r1-0930", "SUP-004", "Seker ve Kuru Gida", "TIR", "Rampa 1", 0, 9, 90,
        AppointmentStatus.completed, "Toz Seker 50 kg Cuval", 20, minute=30,
        plate="59 SK 0270",
        completion_note="Bosaltma 15 dk erken tamamlandi."),
    Row("t-r1-1130", "SUP-009", "Kuruyemis ve Meyve Dolgu", "Kamyon", "Rampa 1", 0, 11, 60,
        AppointmentStatus.approved, "Findik Ici 11-13 mm", 18, minute=30,
        plate="61 FN 3400"),
    Row("t-r1-1300", "SUP-009", "Kuruyemis ve Meyve Dolgu", "Kamyon", "Rampa 1", 0, 13, 45,
        AppointmentStatus.rejected, "Kuru Uzum", 12, plate="61 KU 1200",
        reason="Ayni saat diliminde TIR yigilmasi olustu; 15:00 sonrasi icin tekrar talep edin."),
    Row("t-r1-1400", "SUP-004", "Seker ve Kuru Gida", "TIR", "Rampa 1", 0, 14, 90,
        AppointmentStatus.pending, "Misir Nisastasi", 16, plate="59 NS 8820"),
    Row("t-r1-1600", "SUP-001", "Unlu Mamul Hammaddesi", "TIR", "Rampa 1", 0, 16, 60,
        AppointmentStatus.approved, "Tam Bugday Unu", 20, plate="34 UN 1782"),

    # ---- Rampa 2: soguk zincir + buyuk arac
    Row("t-r2-0830", "SUP-006", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", 0, 8, 60,
        AppointmentStatus.completed, "Pastorize Sut 1000 L", 8, minute=30,
        plate="59 ST 0640", unit=QuantityUnit.piece,
        completion_note="Soguk zincir sicaklik kaydi teslim alindi (+3.4 C)."),
    Row("t-r2-1000", "SUP-002", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", 0, 10, 90,
        AppointmentStatus.approved, "Donuk Pasta Bazi", 14, plate="34 DZ 5510"),
    Row("t-r2-1300", "SUP-006", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", 0, 13, 90,
        AppointmentStatus.pending, "Tereyagi Blok 25 kg", 10, plate="59 TY 2260"),
    Row("t-r2-1500", "SUP-006", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", 0, 15, 60,
        AppointmentStatus.revision_pending, "Yumurta Sarisi Pastorize", 6,
        unit=QuantityUnit.box, plate="59 YM 4130",
        revised_from_hour=14,
        revision_note="Oglen soguk oda dolulugu nedeniyle bir saat sonraya alindi."),

    # ---- Rampa 3: kucuk arac / kargo
    Row("t-r3-0900", "SUP-008", "Katki ve Aroma", "Kamyonet", "Rampa 3", 0, 9, 30,
        AppointmentStatus.completed, "Vanilin Aroma 5 kg", 12, unit=QuantityUnit.box,
        plate="06 AR 7710",
        completion_note="Lot numaralari uretim planina islendi."),
    Row("t-r3-1030", "SUP-007", "Ambalaj", "Kamyonet", "Rampa 3", 0, 10, 45,
        AppointmentStatus.approved, "Kraft Karton Kutu 30x20", 30, minute=30,
        unit=QuantityUnit.carton, plate="34 AM 9080"),
    # Kargo: kesin saat yok, ogleden sonra penceresi — kargo tavsiye katmani
    Row("t-r3-kargo", "SUP-007", "Genel", "Kargo/Parsel Araci", "Rampa 3", 0, 13, 90,
        AppointmentStatus.pending, "Etiket Rulosu (kucuk gonderi)", 40, minute=30,
        unit=QuantityUnit.carton,
        delivery=DeliveryType.cargo, window=CargoWindow.afternoon),
    Row("t-r3-1630", "SUP-008", "Katki ve Aroma", "Kamyonet", "Rampa 3", 0, 16, 30,
        AppointmentStatus.cancelled, "Gida Boyasi Seti", 8, minute=30,
        unit=QuantityUnit.box,
        reason="Tedarikci arac arizasi bildirdi; yarin sabaha tasindi."),

    # ---- Rampa 4: tanker / sivi hammadde
    Row("t-r4-0900", "SUP-005", "Yag ve Sivi Hammadde", "Tanker", "Rampa 4", 0, 9, 90,
        AppointmentStatus.completed, "Sivi Aycicek Yagi — 24 ton dokme", 1,
        unit=QuantityUnit.piece, plate="35 YG 2400",
        completion_note="Pompa hatti bosaltmasi sorunsuz; tank seviyesi %86."),
    Row("t-r4-1400", "SUP-005", "Yag ve Sivi Hammadde", "Tanker", "Rampa 4", 0, 14, 120,
        AppointmentStatus.approved, "Glikoz Surubu 42 DE — 18 ton", 1,
        unit=QuantityUnit.piece, plate="35 GL 1800"),
]


# --------------------------------------------------------------------------
# YAKLASAN GUNLER — haftalik takvim ve "yaklasan randevular" listesi icin
# --------------------------------------------------------------------------

UPCOMING_ROWS = [
    # Yarin
    Row("u-d1-r1-0900", "SUP-001", "Unlu Mamul Hammaddesi", "TIR", "Rampa 1", 1, 9, 60,
        AppointmentStatus.approved, "Cavdar Unu", 18, plate="34 UN 2093"),
    Row("u-d1-r1-1100", "SUP-004", "Seker ve Kuru Gida", "TIR", "Rampa 1", 1, 11, 90,
        AppointmentStatus.pending, "Kakao Tozu %22", 10, plate="59 KK 6600"),
    Row("u-d1-r2-1000", "SUP-006", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", 1, 10, 60,
        AppointmentStatus.approved, "Yogurt Bazi", 9, plate="59 YB 3320"),
    Row("u-d1-r2-1400", "SUP-002", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", 1, 14, 90,
        AppointmentStatus.pending, "Donuk Meyve Karisimi", 12, plate="34 MY 7410"),
    # Kargo — sabah penceresi: takvimde kargo uyari katmani olusur
    Row("u-d1-r3-kargo", "SUP-008", "Genel", "Kargo/Parsel Araci", "Rampa 3", 1, 8, 90,
        AppointmentStatus.pending, "Numune Kolisi (aroma)", 6, unit=QuantityUnit.carton,
        delivery=DeliveryType.cargo, window=CargoWindow.morning),
    Row("u-d1-r3-1300", "SUP-007", "Ambalaj", "Kamyonet", "Rampa 3", 1, 13, 45,
        AppointmentStatus.approved, "Pasta Altligi 28 cm", 24, unit=QuantityUnit.carton,
        plate="34 AM 4455"),
    Row("u-d1-r4-1000", "SUP-005", "Yag ve Sivi Hammadde", "Tanker", "Rampa 4", 1, 10, 90,
        AppointmentStatus.approved, "Pastacilik Margarini — 12 ton", 1,
        unit=QuantityUnit.piece, plate="35 MR 1200"),

    # +2 gun
    Row("u-d2-r1-0930", "SUP-009", "Kuruyemis ve Meyve Dolgu", "Kamyon", "Rampa 1", 2, 9, 60,
        AppointmentStatus.approved, "Ceviz Ici", 14, minute=30, plate="61 CV 5150"),
    Row("u-d2-r1-1330", "SUP-001", "Unlu Mamul Hammaddesi", "TIR", "Rampa 1", 2, 13, 75,
        AppointmentStatus.pending, "Irmik", 16, minute=30, plate="34 IR 8890"),
    Row("u-d2-r2-1100", "SUP-006", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", 2, 11, 60,
        AppointmentStatus.approved, "Pastorize Sut 1000 L", 8, unit=QuantityUnit.piece,
        plate="59 ST 0641"),
    Row("u-d2-r3-1500", "SUP-008", "Katki ve Aroma", "Kamyonet", "Rampa 3", 2, 15, 30,
        AppointmentStatus.approved, "Kabartma Tozu", 10, unit=QuantityUnit.box,
        plate="06 KB 2210"),

    # +3 gun
    Row("u-d3-r1-1000", "SUP-004", "Seker ve Kuru Gida", "TIR", "Rampa 1", 3, 10, 90,
        AppointmentStatus.approved, "Pudra Sekeri", 12, plate="59 PS 3080"),
    Row("u-d3-r2-0900", "SUP-002", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", 3, 9, 90,
        AppointmentStatus.pending, "Krem Santi Bazi", 10, plate="34 KS 6120"),

    # +4 gun
    Row("u-d4-r1-1100", "SUP-001", "Unlu Mamul Hammaddesi", "TIR", "Rampa 1", 4, 11, 60,
        AppointmentStatus.approved, "Bugday Unu Tip 650", 22, plate="34 UN 1451"),
    Row("u-d4-r3-1030", "SUP-007", "Ambalaj", "Kamyonet", "Rampa 3", 4, 10, 45,
        AppointmentStatus.approved, "Strec Film", 20, minute=30, unit=QuantityUnit.carton,
        plate="34 AM 9081"),
    Row("u-d4-r4-1300", "SUP-005", "Yag ve Sivi Hammadde", "Tanker", "Rampa 4", 4, 13, 120,
        AppointmentStatus.pending, "Sivi Aycicek Yagi — 24 ton dokme", 1,
        unit=QuantityUnit.piece, plate="35 YG 2401"),
]


# --------------------------------------------------------------------------
# GECMIS — raporlar (tamamlanma orani, kargo orani, tedarikci kirilimi) icin
# --------------------------------------------------------------------------

#: (gun once, saat, dk, tedarikci, kategori, arac, rampa, statu, urun, adet, birim)
HISTORY_PLAN = [
    (1, 8, 60, "SUP-001", "Unlu Mamul Hammaddesi", "TIR", "Rampa 1", "completed",
     "Bugday Unu Tip 550", 24, QuantityUnit.pallet),
    (1, 10, 90, "SUP-004", "Seker ve Kuru Gida", "TIR", "Rampa 1", "completed",
     "Toz Seker 50 kg Cuval", 20, QuantityUnit.pallet),
    (1, 9, 60, "SUP-006", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", "completed",
     "Pastorize Sut 1000 L", 8, QuantityUnit.piece),
    (1, 14, 45, "SUP-007", "Ambalaj", "Kamyonet", "Rampa 3", "completed",
     "Kraft Karton Kutu 30x20", 28, QuantityUnit.carton),
    (2, 9, 120, "SUP-005", "Yag ve Sivi Hammadde", "Tanker", "Rampa 4", "completed",
     "Glikoz Surubu 42 DE — 18 ton", 1, QuantityUnit.piece),
    (2, 11, 60, "SUP-009", "Kuruyemis ve Meyve Dolgu", "Kamyon", "Rampa 1", "completed",
     "Findik Ici 11-13 mm", 18, QuantityUnit.pallet),
    (2, 13, 90, "SUP-002", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", "completed",
     "Donuk Pasta Bazi", 14, QuantityUnit.pallet),
    (2, 15, 30, "SUP-008", "Katki ve Aroma", "Kamyonet", "Rampa 3", "cancelled",
     "Limon Aromasi", 6, QuantityUnit.box),
    (3, 8, 60, "SUP-001", "Unlu Mamul Hammaddesi", "TIR", "Rampa 1", "completed",
     "Tam Bugday Unu", 20, QuantityUnit.pallet),
    (3, 10, 60, "SUP-006", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", "completed",
     "Yumurta Sarisi Pastorize", 6, QuantityUnit.box),
    (3, 14, 90, "SUP-004", "Seker ve Kuru Gida", "TIR", "Rampa 1", "completed",
     "Misir Nisastasi", 16, QuantityUnit.pallet),
    (4, 9, 45, "SUP-007", "Ambalaj", "Kamyonet", "Rampa 3", "completed",
     "Etiket Rulosu", 36, QuantityUnit.carton),
    (4, 11, 90, "SUP-002", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", "completed",
     "Tereyagi Blok 25 kg", 10, QuantityUnit.pallet),
    (4, 13, 60, "SUP-009", "Kuruyemis ve Meyve Dolgu", "Kamyon", "Rampa 1", "rejected",
     "Kuru Uzum", 12, QuantityUnit.pallet),
    (5, 8, 90, "SUP-005", "Yag ve Sivi Hammadde", "Tanker", "Rampa 4", "completed",
     "Sivi Aycicek Yagi — 24 ton dokme", 1, QuantityUnit.piece),
    (5, 10, 60, "SUP-001", "Unlu Mamul Hammaddesi", "TIR", "Rampa 1", "completed",
     "Cavdar Unu", 18, QuantityUnit.pallet),
    (5, 15, 30, "SUP-008", "Katki ve Aroma", "Kamyonet", "Rampa 3", "completed",
     "Kabartma Tozu", 10, QuantityUnit.box),
    (7, 9, 60, "SUP-006", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", "completed",
     "Pastorize Sut 1000 L", 8, QuantityUnit.piece),
    (7, 11, 90, "SUP-004", "Seker ve Kuru Gida", "TIR", "Rampa 1", "completed",
     "Kakao Tozu %22", 10, QuantityUnit.pallet),
    (7, 14, 45, "SUP-007", "Ambalaj", "Kamyonet", "Rampa 3", "cancelled",
     "Pasta Altligi 28 cm", 24, QuantityUnit.carton),
    (8, 8, 60, "SUP-001", "Unlu Mamul Hammaddesi", "TIR", "Rampa 1", "completed",
     "Bugday Unu Tip 650", 22, QuantityUnit.pallet),
    (8, 13, 120, "SUP-005", "Yag ve Sivi Hammadde", "Tanker", "Rampa 4", "completed",
     "Pastacilik Margarini — 12 ton", 1, QuantityUnit.piece),
    (9, 10, 90, "SUP-002", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", "completed",
     "Krem Santi Bazi", 10, QuantityUnit.pallet),
    (9, 12, 60, "SUP-009", "Kuruyemis ve Meyve Dolgu", "Kamyon", "Rampa 1", "completed",
     "Ceviz Ici", 14, QuantityUnit.pallet),
    (10, 9, 45, "SUP-008", "Katki ve Aroma", "Kamyonet", "Rampa 3", "completed",
     "Vanilin Aroma 5 kg", 12, QuantityUnit.box),
    (10, 11, 60, "SUP-006", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", "completed",
     "Yogurt Bazi", 9, QuantityUnit.pallet),
    (11, 8, 90, "SUP-004", "Seker ve Kuru Gida", "TIR", "Rampa 1", "completed",
     "Pudra Sekeri", 12, QuantityUnit.pallet),
    (11, 14, 60, "SUP-001", "Unlu Mamul Hammaddesi", "TIR", "Rampa 2", "completed",
     "Irmik", 16, QuantityUnit.pallet),
    (12, 10, 45, "SUP-007", "Ambalaj", "Kamyonet", "Rampa 3", "completed",
     "Strec Film", 20, QuantityUnit.carton),
    (12, 13, 90, "SUP-002", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", "rejected",
     "Donuk Meyve Karisimi", 12, QuantityUnit.pallet),
    (14, 9, 60, "SUP-001", "Unlu Mamul Hammaddesi", "TIR", "Rampa 1", "completed",
     "Bugday Unu Tip 550", 24, QuantityUnit.pallet),
    (14, 11, 90, "SUP-005", "Yag ve Sivi Hammadde", "Tanker", "Rampa 4", "completed",
     "Glikoz Surubu 42 DE — 18 ton", 1, QuantityUnit.piece),
    (15, 10, 60, "SUP-006", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", "completed",
     "Pastorize Sut 1000 L", 8, QuantityUnit.piece),
    (15, 14, 45, "SUP-009", "Kuruyemis ve Meyve Dolgu", "Kamyon", "Rampa 1", "completed",
     "Visne Dolgusu", 10, QuantityUnit.pallet),
    (16, 9, 90, "SUP-004", "Seker ve Kuru Gida", "TIR", "Rampa 1", "completed",
     "Toz Seker 50 kg Cuval", 20, QuantityUnit.pallet),
    (17, 11, 60, "SUP-002", "Soguk Zincir", "Frigorifik Arac", "Rampa 2", "completed",
     "Tereyagi Blok 25 kg", 10, QuantityUnit.pallet),
    (18, 10, 45, "SUP-008", "Katki ve Aroma", "Kamyonet", "Rampa 3", "completed",
     "Gida Boyasi Seti", 8, QuantityUnit.box),
    (18, 13, 60, "SUP-001", "Unlu Mamul Hammaddesi", "TIR", "Rampa 1", "completed",
     "Tam Bugday Unu", 20, QuantityUnit.pallet),
]

#: Gecmis KARGO teslimatlari (raporlardaki kargo orani icin ayri tutulur).
HISTORY_CARGO = [
    (3, "SUP-007", "Genel", "Kargo/Parsel Araci", "Rampa 3", CargoWindow.morning,
     "Etiket Rulosu (kucuk gonderi)", 40),
    (6, "SUP-008", "Genel", "Kargo/Parsel Araci", "Rampa 3", CargoWindow.afternoon,
     "Numune Kolisi (aroma)", 6),
    (9, "SUP-003", "Genel", "Kargo/Parsel Araci", "Rampa 3", CargoWindow.morning,
     "Yedek Parca Kolisi", 4),
    (13, "SUP-007", "Ambalaj", "Kargo/Parsel Araci", "Rampa 3", CargoWindow.all_day,
     "Pasta Altligi 28 cm", 24),
]

REJECTION_REASONS = {
    "Kuru Uzum": "Talep edilen saatte uyumlu rampa doluydu; alternatif saat onerildi.",
    "Donuk Meyve Karisimi": "Soguk oda kapasitesi dolu; ertesi gune yonlendirildi.",
}
CANCELLATION_REASONS = {
    "Limon Aromasi": "Tedarikci sevkiyati erteledi.",
    "Pasta Altligi 28 cm": "Uretim plani degisti; siparis sonraki haftaya alindi.",
}


# --------------------------------------------------------------------------
# Yerlestirme dogrulamasi — demo verisi kural motoruyla celismemeli
# --------------------------------------------------------------------------


@dataclass
class Placement:
    """Bir rampanin gun-ici dolulugu; cakisma kontrolu icin."""

    intervals: list[tuple[datetime, datetime]] = field(default_factory=list)

    def conflicts(self, start: datetime, end: datetime) -> bool:
        return any(start < e and s < end for s, e in self.intervals)

    def add(self, start: datetime, end: datetime) -> None:
        self.intervals.append((start, end))


_WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

#: Kotaya sayilmayan statuler (kural motoruyla ayni kabul).
_NON_COUNTING_STATUSES = (AppointmentStatus.cancelled, AppointmentStatus.rejected)


def _week_start(day: date) -> date:
    """Pazartesi baslangicli hafta — kural motoruyla ayni tanim."""
    return day - timedelta(days=day.weekday())


def _working_window(
    dock: Dock,
    facility: Facility,
    day: date,
    overrides: dict[tuple[uuid.UUID, date], DockOverride],
) -> tuple[time, time] | None:
    """O gun rampanin acik oldugu pencere; kapaliysa None.

    Oncelik sirasi kural motoruyla aynidir: takvim istisnasi > rampa
    profili > tesis varsayilani.
    """
    override = overrides.get((dock.id, day))
    if override is not None and override.is_active:
        if override.type == DockOverrideType.closed:
            return None
        if override.start_time and override.end_time:
            return override.start_time, override.end_time

    profile = dock.working_hours_json or facility.default_working_profile_json or {}
    entry = profile.get(_WEEKDAY_KEYS[day.weekday()])
    if not entry:
        return None
    return (
        time.fromisoformat(entry["start"]),
        time.fromisoformat(entry["end"]),
    )


def _dock_accepts(dock: Dock, category: ProductCategory, vehicle: VehicleCategory) -> bool:
    """Rampa-urun/arac uyumu (bos kabul listesi = hepsini kabul eder)."""
    products = dock.accepted_product_categories
    if products and category.id not in {c.id for c in products}:
        return False
    vehicles = dock.accepted_vehicle_categories
    if vehicles and vehicle.id not in {v.id for v in vehicles}:
        return False
    return True


# --------------------------------------------------------------------------
# Katalog kurulumu (varsa dokunma, yoksa ekle)
# --------------------------------------------------------------------------


async def _ensure_vehicle_categories(db, facility: Facility) -> dict[str, VehicleCategory]:
    existing = {
        v.name: v
        for v in (
            await db.execute(
                select(VehicleCategory).where(VehicleCategory.facility_id == facility.id)
            )
        ).scalars()
    }
    for spec in VEHICLE_CATEGORIES:
        if spec["name"] in existing:
            continue
        row = VehicleCategory(
            id=demo_id(facility.id, f"vehicle:{spec['name']}"),
            tenant_id=facility.tenant_id,
            facility_id=facility.id,
            name=spec["name"],
            display_name=spec["display_name"],
            physical_note=spec.get("physical_note"),
        )
        db.add(row)
        existing[row.name] = row
    await db.flush()
    return existing


async def _ensure_product_categories(
    db, facility: Facility, vehicles: dict[str, VehicleCategory]
) -> dict[str, ProductCategory]:
    existing = {
        c.name: c
        for c in (
            await db.execute(
                select(ProductCategory).where(ProductCategory.facility_id == facility.id)
            )
        ).scalars()
    }
    for spec in PRODUCT_CATEGORIES:
        if spec["name"] in existing:
            continue
        default_vehicle = vehicles.get(spec["vehicle"])
        row = ProductCategory(
            id=demo_id(facility.id, f"category:{spec['name']}"),
            tenant_id=facility.tenant_id,
            facility_id=facility.id,
            name=spec["name"],
            display_name=spec["display_name"],
            description=spec.get("description"),
            min_block_minutes=spec["min_block_minutes"],
            max_block_minutes=spec.get("max_block_minutes"),
            default_vehicle_category_id=default_vehicle.id if default_vehicle else None,
        )
        db.add(row)
        existing[row.name] = row
    await db.flush()
    return existing


async def _ensure_docks(
    db,
    facility: Facility,
    categories: dict[str, ProductCategory],
    vehicles: dict[str, VehicleCategory],
) -> dict[str, Dock]:
    async def load() -> dict[str, Dock]:
        return {
            d.name: d
            for d in (
                await db.execute(
                    select(Dock)
                    .options(
                        selectinload(Dock.accepted_product_categories),
                        selectinload(Dock.accepted_vehicle_categories),
                    )
                    .where(Dock.facility_id == facility.id)
                )
            ).scalars()
        }

    existing = await load()
    for spec in DOCKS:
        if spec["name"] in existing:
            continue
        db.add(
            Dock(
                id=demo_id(facility.id, f"dock:{spec['name']}"),
                tenant_id=facility.tenant_id,
                facility_id=facility.id,
                name=spec["name"],
                note=spec.get("note"),
                working_hours_json=facility.default_working_profile_json,
                accepted_product_categories=[
                    categories[n] for n in spec["products"] if n in categories
                ],
                accepted_vehicle_categories=[
                    vehicles[n] for n in spec["vehicles"] if n in vehicles
                ],
            )
        )
    await db.flush()
    existing = await load()

    # Mevcut rampalarin kabul listesi YALNIZCA genisletilir.
    for dock_name, category_names in DOCK_PRODUCT_EXTENSIONS.items():
        dock = existing.get(dock_name)
        if dock is None or not dock.accepted_product_categories:
            # Bos liste "hepsini kabul et" demektir; ona dokunmak kisitlama olurdu.
            continue
        current = {c.id for c in dock.accepted_product_categories}
        for name in category_names:
            category = categories.get(name)
            if category is not None and category.id not in current:
                dock.accepted_product_categories.append(category)
    await db.flush()
    return await load()


async def _ensure_suppliers(
    db, facility: Facility, categories: dict[str, ProductCategory]
) -> tuple[dict[str, Supplier], list[SupplierUser]]:
    existing = {
        s.code: s
        for s in (
            await db.execute(
                select(Supplier)
                .options(
                    selectinload(Supplier.allowed_product_categories),
                    selectinload(Supplier.users),
                )
                .where(Supplier.facility_id == facility.id)
            )
        ).scalars()
    }
    new_accounts: list[SupplierUser] = []
    for spec in SUPPLIERS:
        supplier = existing.get(spec["code"])
        # Yeni yaratilan kayitta `users` iliskisi lazy'dir; async oturumda
        # ona DOKUNULMAZ — hesabin olup olmadigini bu bayrak tasir.
        created = supplier is None
        if created:
            supplier = Supplier(
                id=demo_id(facility.id, f"supplier:{spec['code']}"),
                tenant_id=facility.tenant_id,
                facility_id=facility.id,
                company_name=spec["company_name"],
                code=spec["code"],
                category_label=spec["category_label"],
                contact_name=spec["contact_name"],
                contact_email=spec["contact_email"],
                contact_phone=spec["contact_phone"],
                status=SupplierStatus.active,
                auto_approval_enabled=spec["auto_approval_enabled"],
                cargo_enabled=spec["cargo_enabled"],
                min_block_minutes=spec["min_block_minutes"],
                max_block_minutes=spec["max_block_minutes"],
                weekly_quota=spec["weekly_quota"],
                monthly_quota=spec["monthly_quota"],
                notes=spec["notes"],
                allowed_product_categories=[
                    categories[n] for n in spec["categories"] if n in categories
                ],
            )
            db.add(supplier)
            existing[spec["code"]] = supplier
            await db.flush()

        if created or not supplier.users:
            account = SupplierUser(
                id=demo_id(facility.id, f"supplier-user:{spec['code']}"),
                supplier_id=supplier.id,
                name=f"{spec['company_name']} Portal",
                email=spec["account_email"],
                password_hash=hash_password(DEMO_PASSWORD),
            )
            db.add(account)
            new_accounts.append(account)
    await db.flush()
    return existing, new_accounts


# --------------------------------------------------------------------------
# Senaryo hareketleri
# --------------------------------------------------------------------------


def _scenario_keys() -> list[str]:
    """Bu modulun uretebilecegi TUM randevu anahtarlari (silme kapsami)."""
    keys = [r.key for r in TODAY_ROWS + UPCOMING_ROWS]
    keys += [f"h-{i}" for i in range(len(HISTORY_PLAN))]
    keys += [f"hc-{i}" for i in range(len(HISTORY_CARGO))]
    keys += [f"series-sut-{i}" for i in range(SERIES_OCCURRENCES)]
    return keys


SERIES_OCCURRENCES = 5
SERIES_KEY = "series-sut"


async def _purge_previous(db, facility: Facility) -> int:
    """Onceki kosunun senaryo satirlarini siler — yalnizca kendi kimlikleri."""
    appointment_ids = [demo_id(facility.id, f"appt:{k}") for k in _scenario_keys()]
    notification_ids = [
        demo_id(facility.id, f"notif:{k}") for k in _NOTIFICATION_KEYS
    ]
    override_ids = [demo_id(facility.id, f"override:{k}") for k in _OVERRIDE_KEYS]
    series_id = demo_id(facility.id, f"series:{SERIES_KEY}")

    await db.execute(
        delete(AppointmentRevision).where(
            AppointmentRevision.appointment_id.in_(appointment_ids)
        )
    )
    await db.execute(delete(Notification).where(Notification.id.in_(notification_ids)))
    result = await db.execute(
        delete(Appointment).where(Appointment.id.in_(appointment_ids))
    )
    await db.execute(delete(AppointmentSeries).where(AppointmentSeries.id == series_id))
    await db.execute(delete(DockOverride).where(DockOverride.id.in_(override_ids)))
    return result.rowcount or 0


_NOTIFICATION_KEYS = [
    "admin-new-request",
    "admin-cargo",
    "admin-revision",
    "supplier-approved",
    "supplier-revision",
    "supplier-rejected",
]

_OVERRIDE_KEYS = ["r4-maintenance", "r1-extra-hours"] + [
    f"today-shift:{name}" for name in sorted({r.dock for r in TODAY_ROWS})
]

#: Bugunun senaryosunun kapsadigi saat araligi (ek mesai karari icin).
_TODAY_SPAN = (time(8, 0), time(18, 0))


class ScenarioBuilder:
    """Randevu satirlarini tesis konfigurasyonuna karsi dogrulayip yazar."""

    def __init__(
        self,
        db,
        facility: Facility,
        *,
        docks: dict[str, Dock],
        categories: dict[str, ProductCategory],
        vehicles: dict[str, VehicleCategory],
        suppliers: dict[str, Supplier],
        overrides: dict[tuple[uuid.UUID, date], DockOverride],
        occupancy: dict[uuid.UUID, Placement],
        quota: dict[tuple[uuid.UUID, date], int],
        tz: ZoneInfo,
        today: datetime,
    ) -> None:
        self.db = db
        self.facility = facility
        self.docks = docks
        self.categories = categories
        self.vehicles = vehicles
        self.suppliers = suppliers
        self.overrides = overrides
        self.occupancy = occupancy
        self.tz = tz
        self.today = today
        self.written = 0
        self.skipped: list[str] = []
        self.shifted: list[str] = []
        self.quota = quota
        self._driver_index = 0

    def _next_driver(self) -> tuple[str, str]:
        driver = DRIVERS[self._driver_index % len(DRIVERS)]
        self._driver_index += 1
        return driver

    def _resolve_slot(
        self, row: Row, dock: Dock
    ) -> tuple[datetime, datetime] | None:
        """Satiri gercekten yerlesebilecegi ilk slota oturtur.

        Sunum verisi "yaklasik dogru" olamaz: kapali gune veya dolu bir
        rampaya randevu yazmak urunun kendi kuraliyla celisirdi. Bu yuzden
        once ayni gun icinde 30 dk adimlarla ileri kaydirilir; olmuyorsa
        gecmis satirlar bir onceki, gelecek satirlar bir sonraki gune
        tasinir. Bugunun programi ise gun degistirmez — "bugun" bugundur.
        """
        # Gun adaylari: bugun sabit; gecmis geriye, gelecek ileriye kayar.
        if row.day == 0:
            day_offsets = [0]
        elif row.day < 0:
            day_offsets = [row.day - step for step in range(_MAX_DAY_SHIFT)]
        else:
            day_offsets = [row.day + step for step in range(_MAX_DAY_SHIFT)]

        placement = self.occupancy.setdefault(dock.id, Placement())
        for day_offset in day_offsets:
            base = self.today + timedelta(
                days=day_offset, hours=row.hour, minutes=row.minute
            )
            window = _working_window(dock, self.facility, base.date(), self.overrides)
            if window is None:
                continue
            open_at = base.replace(hour=window[0].hour, minute=window[0].minute)
            close_at = base.replace(hour=window[1].hour, minute=window[1].minute)
            start = max(base, open_at)
            while start + timedelta(minutes=row.minutes) <= close_at:
                end = start + timedelta(minutes=row.minutes)
                if not placement.conflicts(start, end):
                    return start, end
                start += timedelta(minutes=_SLOT_STEP_MINUTES)
        return None

    def add(self, row: Row) -> Appointment | None:
        dock = self.docks.get(row.dock)
        category = self.categories.get(row.category)
        vehicle = self.vehicles.get(row.vehicle)
        supplier = self.suppliers.get(row.supplier)
        if not (dock and category and vehicle and supplier):
            self.skipped.append(f"{row.key}: katalog kaydi eksik")
            return None

        if not _dock_accepts(dock, category, vehicle):
            self.skipped.append(f"{row.key}: {dock.name} bu urun/arac ile uyumlu degil")
            return None

        slot = self._resolve_slot(row, dock)
        if slot is None:
            self.skipped.append(
                f"{row.key}: {dock.name} icin uygun slot yok (kapali gun / doluluk)"
            )
            return None
        start, end = slot
        # Kota: demo verisi tedarikcinin KENDI haftalik sinirini asamaz —
        # asarsa sunum sirasinda yeni randevu acilamaz hale gelirdi.
        if row.status not in _NON_COUNTING_STATUSES:
            week = _week_start(start.date())
            used = self.quota.get((supplier.id, week), 0)
            if supplier.weekly_quota is not None and used >= supplier.weekly_quota:
                self.skipped.append(
                    f"{row.key}: {supplier.company_name} haftalik kotasi dolu"
                )
                return None
            self.quota[(supplier.id, week)] = used + 1
        planned = self.today + timedelta(days=row.day, hours=row.hour, minutes=row.minute)
        if start != planned:
            self.shifted.append(f"{row.key}: {planned:%d.%m %H:%M} -> {start:%d.%m %H:%M}")

        placement = self.occupancy.setdefault(dock.id, Placement())
        driver_name, driver_phone = self._next_driver()
        appointment = Appointment(
            id=demo_id(self.facility.id, f"appt:{row.key}"),
            tenant_id=self.facility.tenant_id,
            facility_id=self.facility.id,
            supplier_id=supplier.id,
            dock_id=dock.id,
            product_category_id=category.id,
            vehicle_category_id=vehicle.id,
            product_name=row.product,
            quantity=row.quantity,
            quantity_unit=row.unit,
            license_plate=row.plate,
            driver_name=None if row.delivery == DeliveryType.cargo else driver_name,
            driver_phone=None if row.delivery == DeliveryType.cargo else driver_phone,
            delivery_type=row.delivery,
            cargo_window=row.window,
            cargo_min_block_minutes=(
                self.facility.cargo_default_min_block_minutes
                if row.delivery == DeliveryType.cargo
                else None
            ),
            requested_start_at=to_utc(start),
            requested_end_at=to_utc(end),
            scheduled_start_at=to_utc(start),
            scheduled_end_at=to_utc(end),
            duration_minutes=row.minutes,
            status=row.status,
            created_by_type=row.created_by,
        )
        if row.status == AppointmentStatus.rejected:
            appointment.rejection_reason = row.reason
        if row.status == AppointmentStatus.cancelled:
            appointment.cancellation_reason = row.reason
        if row.status == AppointmentStatus.completed:
            appointment.completion_note = row.completion_note
        if row.status == AppointmentStatus.revision_pending and row.revised_from_hour:
            # Kaydirma olmus olabilir: revizyon oncesi saat, PLANLANAN saatle
            # arasindaki farki korur (ornek "1 saat sonraya alindi").
            original_start = start - timedelta(hours=row.hour - row.revised_from_hour)
            appointment.original_start_at = to_utc(original_start)
            appointment.original_end_at = to_utc(
                original_start + timedelta(minutes=row.minutes)
            )
            appointment.revision_note = row.revision_note

        self.db.add(appointment)
        # Iptal/red bir rampayi ISGAL ETMEZ; takvimde de yer kaplamamalidir.
        if row.status in BLOCKING_APPOINTMENT_STATUSES or (
            row.status == AppointmentStatus.completed
        ):
            placement.add(start, end)
        self.written += 1
        return appointment


async def _existing_quota_usage(
    db, facility: Facility, today: datetime
) -> dict[tuple[uuid.UUID, date], int]:
    """Organik randevularin tedarikci-hafta sayaclari (kotaya sayilanlar)."""
    start = to_utc(today - timedelta(days=HISTORY_DAYS + 14))
    end = to_utc(today + timedelta(days=90))
    rows = (
        await db.execute(
            select(Appointment).where(
                Appointment.facility_id == facility.id,
                Appointment.scheduled_start_at >= start,
                Appointment.scheduled_start_at < end,
                Appointment.status.not_in(_NON_COUNTING_STATUSES),
            )
        )
    ).scalars()
    usage: dict[tuple[uuid.UUID, date], int] = {}
    for row in rows:
        week = _week_start(to_utc(row.scheduled_start_at).date())
        usage[(row.supplier_id, week)] = usage.get((row.supplier_id, week), 0) + 1
    return usage


async def _existing_occupancy(
    db, facility: Facility, tz: ZoneInfo, today: datetime
) -> dict[uuid.UUID, Placement]:
    """Organik (senaryo disi) randevular; uzerlerine yazilmaz."""
    start = to_utc(today - timedelta(days=HISTORY_DAYS + 1))
    end = to_utc(today + timedelta(days=45))
    rows = (
        await db.execute(
            select(Appointment).where(
                Appointment.facility_id == facility.id,
                Appointment.scheduled_start_at >= start,
                Appointment.scheduled_start_at < end,
            )
        )
    ).scalars()
    occupancy: dict[uuid.UUID, Placement] = {}
    for row in rows:
        if row.dock_id is None:
            continue
        if row.status not in BLOCKING_APPOINTMENT_STATUSES and (
            row.status != AppointmentStatus.completed
        ):
            continue
        # SQLite naive datetime dondurebilir; DB'deki her deger UTC'dir.
        occupancy.setdefault(row.dock_id, Placement()).add(
            to_utc(row.scheduled_start_at).astimezone(tz),
            to_utc(row.scheduled_end_at).astimezone(tz),
        )
    return occupancy


def _history_rows() -> list[Row]:
    rows: list[Row] = []
    for index, (
        days_ago, hour, minutes, supplier, category, vehicle, dock, status, product,
        quantity, unit,
    ) in enumerate(HISTORY_PLAN):
        appointment_status = AppointmentStatus(status)
        rows.append(
            Row(
                f"h-{index}", supplier, category, vehicle, dock,
                -days_ago, hour, minutes, appointment_status, product, quantity,
                unit=unit,
                reason=(
                    REJECTION_REASONS.get(product)
                    if appointment_status == AppointmentStatus.rejected
                    else CANCELLATION_REASONS.get(product)
                ),
                completion_note=(
                    "Teslim alindi; irsaliye ve kalite kaydi tamam."
                    if appointment_status == AppointmentStatus.completed
                    else None
                ),
            )
        )
    for index, (
        days_ago, supplier, category, vehicle, dock, window, product, quantity
    ) in enumerate(HISTORY_CARGO):
        rows.append(
            Row(
                f"hc-{index}", supplier, category, vehicle, dock,
                -days_ago, 8, 90, AppointmentStatus.completed, product, quantity,
                unit=QuantityUnit.carton,
                delivery=DeliveryType.cargo, window=window,
                completion_note="Kargo beklenen pencerede ulasti.",
            )
        )
    return rows


def _series_rows(today: datetime) -> list[Row]:
    """Haftalik sozlesmeli sut teslimati — tekrarlayan seri vitrini.

    Ilk occurrence GELECEK haftanin pazartesisidir; boylece bugunun
    programiyla hicbir kosulda cakismaz.
    """
    days_to_monday = (7 - today.weekday()) % 7 or 7
    first_offset = days_to_monday + 7
    return [
        Row(
            f"{SERIES_KEY}-{index}", "SUP-006", "Soguk Zincir", "Frigorifik Arac",
            "Rampa 2", first_offset + index * 7, 8, 60,
            AppointmentStatus.approved, "Pastorize Sut 1000 L", 8,
            unit=QuantityUnit.piece, plate="59 ST 0642",
            series_key=SERIES_KEY, occurrence_index=index,
        )
        for index in range(SERIES_OCCURRENCES)
    ]


def _original_clock(appointment: Appointment, tz: ZoneInfo) -> str:
    """Revizyon oncesi saat (revision_pending randevular icin)."""
    source = appointment.original_start_at or appointment.scheduled_start_at
    return to_utc(source).astimezone(tz).strftime("%H:%M")


def _clock(appointment: Appointment, tz: ZoneInfo) -> str:
    """Bildirim metni randevunun GERCEK saatini soyler (kaydirma olsa bile)."""
    return to_utc(appointment.scheduled_start_at).astimezone(tz).strftime("%H:%M")


def _notification(
    facility: Facility, key: str, appointment: Appointment, **kwargs
) -> Notification:
    return Notification(
        id=demo_id(facility.id, f"notif:{key}"),
        tenant_id=facility.tenant_id,
        facility_id=facility.id,
        entity_type="appointment",
        entity_id=appointment.id,
        metadata_json={
            "appointment_id": str(appointment.id),
            "status": appointment.status.value,
            "dock_id": str(appointment.dock_id),
            "supplier_id": str(appointment.supplier_id),
            "route_hint": f"/admin/appointments?appointmentId={appointment.id}",
        },
        **kwargs,
    )


# --------------------------------------------------------------------------
# Ana akis
# --------------------------------------------------------------------------


async def apply_scenarios(db, facility: Facility, *, tz: ZoneInfo) -> dict:
    today = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)

    vehicles = await _ensure_vehicle_categories(db, facility)
    categories = await _ensure_product_categories(db, facility, vehicles)
    docks = await _ensure_docks(db, facility, categories, vehicles)
    suppliers, new_accounts = await _ensure_suppliers(db, facility, categories)

    removed = await _purge_previous(db, facility)

    # Takvim istisnalari once yazilir: yerlestirme dogrulamasi bunlari okur.
    overrides_spec = [
        (
            "r4-maintenance", "Rampa 4", (today + timedelta(days=6)).date(),
            DockOverrideType.closed, None, None, "Yillik pompa hatti bakimi",
        ),
        (
            "r1-extra-hours", "Rampa 1",
            (today + timedelta(days=((5 - today.weekday()) % 7) or 7)).date(),
            DockOverrideType.extra_hours, time(8, 0), time(17, 0),
            "Bayram oncesi ek mesai (cumartesi tam gun)",
        ),
    ]
    # Sunum gunu bos gorunmesin: bugun normalde kapali (pazar) veya kisa
    # (cumartesi) ise tesisin KENDI ek mesai mekanizmasiyla acilir. Uydurma
    # bir istisna degil; urunun destekledigi gercek bir operasyon senaryosu.
    profile = facility.default_working_profile_json or {}
    today_entry = profile.get(_WEEKDAY_KEYS[today.weekday()])
    needs_extra_shift = today_entry is None or (
        time.fromisoformat(today_entry["end"]) < _TODAY_SPAN[1]
    )
    if needs_extra_shift:
        for dock_name in sorted({r.dock for r in TODAY_ROWS}):
            overrides_spec.append(
                (
                    f"today-shift:{dock_name}", dock_name, today.date(),
                    DockOverrideType.extra_hours, _TODAY_SPAN[0], _TODAY_SPAN[1],
                    "Yogun sezon hafta sonu ek mesai",
                )
            )

    for key, dock_name, day, type_, start_t, end_t, reason in overrides_spec:
        dock = docks.get(dock_name)
        if dock is None:
            continue
        db.add(
            DockOverride(
                id=demo_id(facility.id, f"override:{key}"),
                tenant_id=facility.tenant_id,
                facility_id=facility.id,
                dock_id=dock.id,
                date=day,
                type=type_,
                start_time=start_t,
                end_time=end_t,
                reason=reason,
            )
        )
    await db.flush()

    override_map = {
        (o.dock_id, o.date): o
        for o in (
            await db.execute(
                select(DockOverride).where(DockOverride.facility_id == facility.id)
            )
        ).scalars()
    }
    occupancy = await _existing_occupancy(db, facility, tz, today)
    quota = await _existing_quota_usage(db, facility, today)

    builder = ScenarioBuilder(
        db, facility,
        docks=docks, categories=categories, vehicles=vehicles, suppliers=suppliers,
        overrides=override_map, occupancy=occupancy, quota=quota, tz=tz, today=today,
    )

    written: dict[str, Appointment] = {}
    for row in _history_rows() + TODAY_ROWS + UPCOMING_ROWS:
        appointment = builder.add(row)
        if appointment is not None:
            written[row.key] = appointment

    # --- Tekrarlayan seri (haftalik sozlesme)
    series_rows = _series_rows(today)
    series = AppointmentSeries(
        id=demo_id(facility.id, f"series:{SERIES_KEY}"),
        tenant_id=facility.tenant_id,
        facility_id=facility.id,
        supplier_id=suppliers["SUP-006"].id,
        recurrence_frequency="weekly",
        occurrence_count=len(series_rows),
        status="active",
        metadata_json={"label": "Haftalik pastorize sut sozlesmesi"},
    )
    db.add(series)
    await db.flush()
    series_written = 0
    for row in series_rows:
        appointment = builder.add(row)
        if appointment is not None:
            appointment.series_id = series.id
            appointment.occurrence_index = row.occurrence_index
            appointment.recurring_rule = "weekly"
            series_written += 1
            written[row.key] = appointment
    series.occurrence_count = series_written or len(series_rows)
    await db.flush()

    # --- Revizyon gecmisi (revision_pending randevunun kaydi)
    revised = written.get("t-r2-1500")
    if revised is not None and revised.original_start_at is not None:
        db.add(
            AppointmentRevision(
                appointment_id=revised.id,
                old_start_at=revised.original_start_at,
                old_end_at=revised.original_end_at,
                old_dock_id=revised.dock_id,
                new_start_at=revised.scheduled_start_at,
                new_end_at=revised.scheduled_end_at,
                new_dock_id=revised.dock_id,
                note=revised.revision_note,
            )
        )

    # --- Bildirimler: panelde zil dolu gelsin
    admin_user = (
        await db.execute(
            select(TenantUser)
            .where(TenantUser.tenant_id == facility.tenant_id)
            .order_by(TenantUser.created_at)
        )
    ).scalars().first()

    notifications = 0
    pending_row = written.get("t-r1-1400")
    if admin_user is not None and pending_row is not None:
        db.add(
            _notification(
                facility, "admin-new-request", pending_row,
                recipient_user_id=admin_user.id,
                type="appointment_created", severity="warning",
                title="Yeni randevu talebi",
                body=(
                    f"Trakya Seker ve Nisasta A.S. bugun {_clock(pending_row, tz)} icin "
                    "Misir Nisastasi teslimati talep etti; onayiniz bekleniyor."
                ),
            )
        )
        notifications += 1
    cargo_row = written.get("t-r3-kargo")
    if admin_user is not None and cargo_row is not None:
        db.add(
            _notification(
                facility, "admin-cargo", cargo_row,
                recipient_user_id=admin_user.id,
                type="cargo_advisory", severity="warning",
                title="Kargo uyarisi",
                body=(
                    "Bosphorus Ambalaj kargosu bugun ogleden sonra bekleniyor; "
                    "varis saati kesin degil, Rampa 3'te bosluk birakin."
                ),
            )
        )
        notifications += 1
    if admin_user is not None and revised is not None:
        db.add(
            _notification(
                facility, "admin-revision", revised,
                recipient_user_id=admin_user.id,
                type="appointment_revised", severity="info",
                title="Randevu revize edildi",
                body=(
                    "Trakya Sut ve Yumurta Koop. randevusu "
                    f"{_original_clock(revised, tz)}'ten {_clock(revised, tz)}'e alindi; "
                    "tedarikci onayi bekleniyor."
                ),
            )
        )
        notifications += 1

    approved_row = written.get("t-r1-1600")
    if approved_row is not None:
        db.add(
            _notification(
                facility, "supplier-approved", approved_row,
                recipient_supplier_id=approved_row.supplier_id,
                type="appointment_approved", severity="success",
                title="Randevunuz onaylandi",
                body=(
                    f"Bugun {_clock(approved_row, tz)} Tam Bugday Unu teslimatiniz "
                    "Rampa 1 icin onaylandi."
                ),
            )
        )
        notifications += 1
    if revised is not None:
        db.add(
            _notification(
                facility, "supplier-revision", revised,
                recipient_supplier_id=revised.supplier_id,
                type="appointment_revised", severity="warning",
                title="Randevunuz icin yeni saat onerildi",
                body=(
                    f"Yumurta Sarisi teslimatiniz {_original_clock(revised, tz)} yerine "
                    f"{_clock(revised, tz)} olarak onerildi."
                ),
            )
        )
        notifications += 1
    rejected_row = written.get("t-r1-1300")
    if rejected_row is not None:
        db.add(
            _notification(
                facility, "supplier-rejected", rejected_row,
                recipient_supplier_id=rejected_row.supplier_id,
                type="appointment_rejected", severity="error",
                title="Randevu talebiniz reddedildi",
                body=(
                    "Kuru Uzum talebiniz yogunluk nedeniyle reddedildi; gun sonuna dogru "
                    "bir saat icin tekrar talep olusturabilirsiniz."
                ),
            )
        )
        notifications += 1

    await db.flush()
    return {
        "removed": removed,
        "appointments": builder.written,
        "series_occurrences": series_written,
        "notifications": notifications,
        "new_accounts": new_accounts,
        "skipped": builder.skipped,
        "shifted": builder.shifted,
    }


async def run(slug: str, *, dry_run: bool = False) -> None:
    async with control_session() as db:
        tenant = (
            await db.execute(select(Tenant).where(Tenant.slug == slug))
        ).scalar_one_or_none()
    if tenant is None:
        raise SystemExit(f"'{slug}' tenant'i bulunamadi. Once `python -m app.seed` kosun.")

    location = await location_for_tenant(tenant.id)
    async with session_scope(location) as db:
        facility = (
            await db.execute(
                select(Facility)
                .where(Facility.tenant_id == tenant.id)
                .order_by(Facility.created_at)
            )
        ).scalars().first()
        if facility is None:
            raise SystemExit(f"'{slug}' tenant'inda tesis yok.")

        tz = ZoneInfo(facility.timezone)
        summary = await apply_scenarios(db, facility, tz=tz)

        if dry_run:
            await db.rollback()
        else:
            await db.commit()

    if not dry_run and summary["new_accounts"]:
        # Portal girisi control-plane dizini uzerinden cozulur.
        async with control_session() as control_db:
            for account in summary["new_accounts"]:
                await ensure_registered(
                    control_db,
                    principal_id=account.id,
                    user_type="supplier",
                    email=account.email,
                    tenant_id=tenant.id,
                )
            await control_db.commit()

    print(f"Demo senaryolari {'DENENDI (dry-run)' if dry_run else 'uygulandi'}: {slug}")
    print(f"  Silinen onceki senaryo randevusu : {summary['removed']}")
    print(f"  Yazilan randevu                  : {summary['appointments']}")
    print(f"  Tekrarlayan seri occurrence      : {summary['series_occurrences']}")
    print(f"  Bildirim                         : {summary['notifications']}")
    if summary["new_accounts"]:
        print("  Yeni tedarikci portal hesaplari:")
        for account in summary["new_accounts"]:
            print(f"    {account.email} / {DEMO_PASSWORD}")
    if summary["shifted"]:
        print(f"  Uygun slota kaydirilan ({len(summary['shifted'])}):")
        for line in summary["shifted"]:
            print(f"    - {line}")
    if summary["skipped"]:
        print(f"  Atlanan satir ({len(summary['skipped'])}) — konfigurasyona uymadi:")
        for line in summary["skipped"]:
            print(f"    - {line}")


def main() -> None:
    parser = argparse.ArgumentParser(description="LogiSlot demo senaryo verisi")
    parser.add_argument("--slug", default="bta", help="hedef tenant slug (varsayilan: bta)")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="hicbir sey yazmadan dogrula ve ozeti yazdir",
    )
    args = parser.parse_args()
    asyncio.run(run(args.slug, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
