"""Tedarikci Excel sablonu ve toplu ice aktarma (musteri karari 2026-11).

AKIS (durumsuz; dosya SAKLANMAZ, yalnizca istek boyunca bellekte islenir):
  1. Sablon indir  : tesisin aktif kategorileri ve aciklama sayfasiyla .xlsx.
  2. Onizleme      : dosya yuklenir; her satir icin olusturulacak / guncellenecek /
                     degismeyecek ve satir bazinda hatalar doner. Hicbir sey yazilmaz.
  3. Uygula        : ayni dosya yeniden yuklenir, ayni dogrulama tekrar kosar;
                     tek bir hata bile varsa HICBIR satir yazilmaz (hepsi ya da hic).

ESLESME tedarikci KODU ile: kod tesiste varsa guncellenir, yoksa olusturulur.
GUNCELLEMEDE bos hucre mevcut degeri DEGISTIRMEZ; "-" istege bagli alani temizler.
Boylece yalnizca degistirmek istenen sutunlar doldurulabilir.

GUVENLIK: dosya boyutu, sikistirilmis icerik boyutu ve satir sayisi sinirli;
XML defusedxml ile ayristirilir (openpyxl kuruluysa onu kullanir); formuller
hesaplanmaz (data_only) ve hucre degerleri yalnizca metin/sayi olarak okunur.
"""

import io
import re
import uuid
import zipfile
from dataclasses import dataclass, field
from typing import Any

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from pydantic import EmailStr, TypeAdapter, ValidationError

from app.models import ProductCategory, Supplier
from app.schemas.config import MAX_ADDITIONAL_EMAILS
from app.services.supplier_limits import DIMENSIONS, MAX_MINUTES, resolve_supplier_overrides

MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024
MAX_ROWS = 1000
MAX_BLOCK_MINUTES = 1440
SHEET_NAME = "Tedarikçiler"
CLEAR = "-"

_EMAIL = TypeAdapter(EmailStr)
_SPLIT = re.compile(r"[,;\n\r\t]+")
_TRUE = {"evet", "e", "yes", "y", "1", "true", "x", "var", "açık", "acik"}
_FALSE = {"hayır", "hayir", "h", "no", "n", "0", "false", "yok", "kapalı", "kapali"}
_UNLIMITED = {"sınırsız", "sinirsiz", "unlimited", "limitsiz"}
_INHERIT = {"varsayılan", "varsayilan", "default", "tesis"}


@dataclass(frozen=True)
class Column:
    key: str
    header: str
    kind: str  # text | email | emails | int | bool | categories | minutes
    help: str
    required: bool = False
    max_length: int | None = None
    width: int = 18


COLUMNS: tuple[Column, ...] = (
    Column("code", "Tedarikçi Kodu", "text",
           "Zorunlu. Tesiste benzersiz; eşleşme bu koda göre yapılır.",
           required=True, max_length=50, width=16),
    Column("company_name", "Firma Adı", "text", "Yeni tedarikçide zorunlu.",
           max_length=255, width=28),
    Column("category_label", "Firma Kategorisi", "text", "Serbest etiket (ör. Hammadde).",
           max_length=100),
    Column("contact_name", "Yetkili Kişi", "text", "", max_length=255),
    Column("contact_email", "E-posta", "email",
           "Birincil iletişim adresi. Portal hesabı açılırsa giriş e-postası da budur.", width=26),
    Column("contact_phone", "Telefon", "text", "", max_length=50, width=16),
    Column("additional_emails", "Ek E-postalar", "emails",
           f"Virgülle ayırın; en fazla {MAX_ADDITIONAL_EMAILS}. Tüm bildirimler bunlara da gider.",
           width=32),
    Column("categories", "İzinli Ürün Kategorileri", "categories",
           "Virgülle ayırın; 'Kategoriler' sayfasındaki adlarla aynı yazılmalı.", width=32),
    Column("min_block_minutes", "Min. Süre (dk)", "int", "Tek randevunun en kısa süresi.",
           width=14),
    Column("max_block_minutes", "Maks. Süre (dk)", "int", "Tek randevunun en uzun süresi.",
           width=14),
    Column("weekly_quota", "Haftalık Kota (adet)", "int", "Haftalık en fazla randevu sayısı.",
           width=14),
    Column("monthly_quota", "Aylık Kota (adet)", "int", "Aylık en fazla randevu sayısı.",
           width=14),
    Column("daily_minutes", "Günlük Süre Limiti (dk)", "minutes",
           "Boş/Varsayılan = tesis varsayılanı, Sınırsız ya da dakika.", width=16),
    Column("weekly_minutes", "Haftalık Süre Limiti (dk)", "minutes",
           "Boş/Varsayılan = tesis varsayılanı, Sınırsız ya da dakika.", width=16),
    Column("monthly_minutes", "Aylık Süre Limiti (dk)", "minutes",
           "Boş/Varsayılan = tesis varsayılanı, Sınırsız ya da dakika.", width=16),
    Column("auto_approval_enabled", "Otomatik Onay", "bool", "Evet / Hayır. Yenide boş = Hayır.",
           width=12),
    Column("cargo_enabled", "Kargo", "bool", "Evet / Hayır. Yenide boş = Hayır.", width=10),
    Column("is_active", "Aktif", "bool", "Evet / Hayır. Yenide boş = Evet.", width=10),
    Column("create_account", "Portal Hesabı Aç", "bool",
           "Yalnızca YENİ tedarikçide: Evet ise E-posta ile portal hesabı açılır, geçici parola "
           "sonuç ekranında bir kez gösterilir.", width=14),
    Column("notes", "Notlar", "text", "", width=30),
)
_BY_KEY = {c.key: c for c in COLUMNS}
_MINUTE_KEYS = {"daily_minutes": "daily", "weekly_minutes": "weekly", "monthly_minutes": "monthly"}
_SIMPLE_FIELDS = (
    "company_name", "category_label", "contact_name", "contact_email", "contact_phone",
    "min_block_minutes", "max_block_minutes", "weekly_quota", "monthly_quota",
    "auto_approval_enabled", "cargo_enabled", "notes",
)


class ImportFileError(Exception):
    """Dosya bir butun olarak okunamaz (format, boyut, baslik)."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("İ", "i").replace("I", "ı").lower()).strip()


def _fold(text: str) -> str:
    """Eslestirme icin Turkce-duyarsiz kucultme (I/ı/İ/i, sapkalar)."""
    table = str.maketrans("ıİçğöşüâîû", "iicgosuaiu")
    return _norm(text).translate(table)


_HEADER_LOOKUP = {_fold(c.header): c.key for c in COLUMNS}


# ---------------------------------------------------------------- sablon


def build_template(categories: list[ProductCategory]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = SHEET_NAME
    head_font = Font(bold=True, color="FFFFFF")
    head_fill = PatternFill("solid", fgColor="0B2C56")
    req_fill = PatternFill("solid", fgColor="B4232C")
    for index, col in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=1, column=index, value=col.header)
        cell.font = head_font
        cell.fill = req_fill if col.required else head_fill
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        ws.column_dimensions[get_column_letter(index)].width = col.width
    ws.row_dimensions[1].height = 32
    ws.freeze_panes = "B2"

    yes_no = DataValidation(type="list", formula1='"Evet,Hayır"', allow_blank=True)
    yes_no.error = "Evet ya da Hayır seçin"
    limit = DataValidation(type="list", formula1='"Varsayılan,Sınırsız"', allow_blank=True)
    limit.showErrorMessage = False  # sayi da yazilabilir; liste yalnizca kolaylik
    ws.add_data_validation(yes_no)
    ws.add_data_validation(limit)
    for index, col in enumerate(COLUMNS, start=1):
        letter = get_column_letter(index)
        if col.kind == "bool":
            yes_no.add(f"{letter}2:{letter}{MAX_ROWS + 1}")
        elif col.kind == "minutes":
            limit.add(f"{letter}2:{letter}{MAX_ROWS + 1}")

    cats = wb.create_sheet("Kategoriler")
    cats.append(["Ürün Kategorisi (İzinli Ürün Kategorileri sütununa bu adlarla yazın)"])
    cats["A1"].font = Font(bold=True)
    cats.column_dimensions["A"].width = 60
    for category in sorted(categories, key=lambda c: c.display_name.lower()):
        cats.append([category.display_name])

    guide = wb.create_sheet("Açıklama")
    guide.column_dimensions["A"].width = 30
    guide.column_dimensions["B"].width = 12
    guide.column_dimensions["C"].width = 90
    guide.append(["Sütun", "Zorunlu", "Açıklama"])
    for cell in guide[1]:
        cell.font = Font(bold=True)
    for col in COLUMNS:
        guide.append([col.header, "Evet" if col.required else "", col.help])
    guide.append([])
    for line in (
        "Eşleşme Tedarikçi Kodu ile yapılır: kod varsa tedarikçi GÜNCELLENİR, yoksa OLUŞTURULUR.",
        "Güncellemede boş bırakılan hücre mevcut değeri DEĞİŞTİRMEZ. İsteğe bağlı bir alanı "
        "temizlemek için '-' yazın.",
        f"En fazla {MAX_ROWS} satır. Önce önizleme yapılır; hatalı satır varsa hiçbir kayıt "
        "yazılmaz.",
        "Dosya sistemde saklanmaz; yalnızca içe aktarma sırasında okunur.",
    ):
        guide.append([line])

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


# ---------------------------------------------------------------- okuma


def _check_archive(data: bytes) -> None:
    if len(data) > MAX_FILE_BYTES:
        raise ImportFileError("IMPORT_FILE_TOO_LARGE", "Dosya en fazla 2 MB olabilir")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            infos = archive.infolist()
            if len(infos) > 200 or sum(i.file_size for i in infos) > MAX_UNCOMPRESSED_BYTES:
                raise ImportFileError("IMPORT_FILE_INVALID", "Dosya içeriği beklenenden büyük")
    except zipfile.BadZipFile as exc:
        raise ImportFileError(
            "IMPORT_FILE_INVALID", "Dosya okunamadı; LogiSlot şablonundaki .xlsx dosyasını kullanın"
        ) from exc


def _cell_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def read_rows(data: bytes) -> tuple[list[tuple[int, dict[str, str]]], list[str]]:
    """(satir_no, {anahtar: metin}) listesi ve dosya duzeyi uyarilar."""
    _check_archive(data)
    try:
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception as exc:  # openpyxl cok cesitli hata firlatir
        raise ImportFileError(
            "IMPORT_FILE_INVALID", "Dosya okunamadı; LogiSlot şablonundaki .xlsx dosyasını kullanın"
        ) from exc
    try:
        ws = wb[SHEET_NAME] if SHEET_NAME in wb.sheetnames else wb.worksheets[0]
        rows = ws.iter_rows(values_only=True)
        header = next(rows, None)
        if not header:
            raise ImportFileError("IMPORT_HEADER_INVALID", "Başlık satırı bulunamadı")
        mapping: dict[int, str] = {}
        warnings: list[str] = []
        for index, title in enumerate(header):
            text = _cell_text(title)
            if not text:
                continue
            key = _HEADER_LOOKUP.get(_fold(text))
            if key is None:
                warnings.append(f"Tanınmayan sütun yok sayıldı: {text}")
            elif key in mapping.values():
                raise ImportFileError("IMPORT_HEADER_INVALID", f"Sütun iki kez var: {text}")
            else:
                mapping[index] = key
        missing = [c.header for c in COLUMNS if c.required and c.key not in mapping.values()]
        if missing:
            raise ImportFileError(
                "IMPORT_HEADER_INVALID", f"Zorunlu sütun eksik: {', '.join(missing)}"
            )
        out: list[tuple[int, dict[str, str]]] = []
        for number, values in enumerate(rows, start=2):
            record = {
                key: _cell_text(values[i]) if i < len(values) else ""
                for i, key in mapping.items()
            }
            if not any(record.values()):
                continue
            if len(out) >= MAX_ROWS:
                raise ImportFileError("IMPORT_TOO_MANY_ROWS", f"En fazla {MAX_ROWS} satır olabilir")
            out.append((number, record))
        return out, warnings
    finally:
        wb.close()


# ---------------------------------------------------------------- dogrulama


@dataclass
class RowResult:
    row: int
    code: str
    company_name: str
    action: str = "create"  # create | update | unchanged
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    changes: list[str] = field(default_factory=list)
    # uygulanacak degerler
    values: dict[str, Any] = field(default_factory=dict)
    category_ids: list[uuid.UUID] | None = None
    minute_limits: dict[str, Any] | None = None
    minute_limits_set: bool = False
    create_account: bool = False
    supplier_id: uuid.UUID | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "row": self.row,
            "code": self.code,
            "company_name": self.company_name,
            "action": self.action,
            "errors": self.errors,
            "warnings": self.warnings,
            "changes": self.changes,
            "create_account": self.create_account,
        }


def _parse_bool(text: str) -> bool | None:
    folded = _norm(text)
    if folded in _TRUE:
        return True
    if folded in _FALSE:
        return False
    raise ValueError("Evet ya da Hayır olmalı")


def _parse_int(text: str, *, minimum: int, maximum: int | None) -> int:
    try:
        number = float(text.replace(",", "."))
    except ValueError as exc:
        raise ValueError("sayı olmalı") from exc
    if not number.is_integer():
        raise ValueError("tam sayı olmalı")
    value = int(number)
    if value < minimum or (maximum is not None and value > maximum):
        upper = f"–{maximum}" if maximum is not None else " ve üzeri"
        raise ValueError(f"{minimum}{upper} aralığında olmalı")
    return value


def _parse_email(text: str) -> str:
    try:
        return str(_EMAIL.validate_python(text)).lower()
    except ValidationError as exc:
        raise ValueError(f"geçersiz e-posta: {text}") from exc


def _parse_emails(text: str) -> list[str]:
    seen: list[str] = []
    for part in _SPLIT.split(text):
        part = part.strip()
        if not part:
            continue
        email = _parse_email(part)
        if email not in seen:
            seen.append(email)
    if len(seen) > MAX_ADDITIONAL_EMAILS:
        raise ValueError(f"en fazla {MAX_ADDITIONAL_EMAILS} ek e-posta")
    return seen


def _split_categories(text: str, known: dict[str, Any]) -> list[str]:
    """Hücreyi kategori adlarına böler; ADINDA VİRGÜL olan kategoriyi bölmez.

    "Soğuk Zincir (Et, Donuk, Süt), Genel" düz virgülle bölününce "Soğuk Zincir (Et"
    bilinmeyen kategori sayılırdı. Her parçadan başlayarak bilinen bir ada denk gelen
    EN UZUN ardışık parça dizisi tek ad sayılır; denk gelmeyen parça kendi başına kalır
    (bilinmeyen kategori olarak raporlanır).
    """
    spans = [(m.start(), m.end()) for m in re.finditer(r"[^,;\n\r\t]+", text)]
    spans = [(a, b) for a, b in spans if text[a:b].strip()]
    out: list[str] = []
    i = 0
    while i < len(spans):
        best = i
        for j in range(len(spans) - 1, i, -1):
            if _fold(text[spans[i][0] : spans[j][1]]) in known:
                best = j
                break
        out.append(text[spans[i][0] : spans[best][1]].strip())
        i = best + 1
    return out


def _parse_minute_limit(text: str, dimension: str) -> dict[str, Any]:
    folded = _norm(text)
    if folded in _INHERIT:
        return {"mode": "inherit", "minutes": None}
    if folded in _UNLIMITED:
        return {"mode": "unlimited", "minutes": None}
    minutes = _parse_int(text, minimum=1, maximum=MAX_MINUTES[dimension])
    return {"mode": "custom", "minutes": minutes}


def validate_rows(
    rows: list[tuple[int, dict[str, str]]],
    *,
    existing: dict[str, Supplier],
    categories: list[ProductCategory],
    taken_account_emails: set[str],
) -> list[RowResult]:
    """Satirlari dogrular ve uygulanacak degerleri cikarir. DB'ye yazmaz.

    `existing`: kod (kucuk harf) -> mevcut tedarikci (izinli kategoriler yuklu).
    `taken_account_emails`: portal/yonetim hesabinda kullanilan e-postalar (kucuk harf).
    """
    by_name: dict[str, ProductCategory] = {}
    for category in categories:
        by_name.setdefault(_fold(category.display_name), category)
        by_name.setdefault(_fold(category.name), category)

    codes_seen: dict[str, int] = {}
    account_emails_seen: dict[str, int] = {}
    results: list[RowResult] = []
    for number, record in rows:
        code = record.get("code", "")
        result = RowResult(row=number, code=code, company_name=record.get("company_name", ""))
        results.append(result)
        errors = result.errors

        if not code:
            errors.append("Tedarikçi Kodu boş")
            continue
        if len(code) > 50:
            errors.append("Tedarikçi Kodu en fazla 50 karakter")
        key = code.lower()
        if key in codes_seen:
            errors.append(f"Bu kod dosyada {codes_seen[key]}. satırda da var")
        else:
            codes_seen[key] = number

        supplier = existing.get(key)
        result.action = "update" if supplier else "create"
        result.supplier_id = supplier.id if supplier else None
        if supplier and not result.company_name:
            result.company_name = supplier.company_name

        values: dict[str, Any] = {}
        for column in COLUMNS:
            raw = record.get(column.key, "")
            if column.key in ("code", "categories", "create_account", "is_active") or (
                column.key in _MINUTE_KEYS
            ):
                continue
            if raw == "":
                continue
            if raw == CLEAR:
                if column.required or column.key == "company_name" or column.kind == "bool":
                    errors.append(f"{column.header}: '-' ile temizlenemez")
                else:
                    values[column.key] = [] if column.kind == "emails" else None
                continue
            try:
                if column.kind == "text":
                    if column.max_length and len(raw) > column.max_length:
                        raise ValueError(f"en fazla {column.max_length} karakter")
                    values[column.key] = raw
                elif column.kind == "email":
                    values[column.key] = _parse_email(raw)
                elif column.kind == "emails":
                    values[column.key] = _parse_emails(raw)
                elif column.kind == "int":
                    is_block = column.key.endswith("block_minutes")
                    values[column.key] = _parse_int(
                        raw,
                        minimum=1 if is_block else 0,
                        maximum=MAX_BLOCK_MINUTES if is_block else None,
                    )
                elif column.kind == "bool":
                    values[column.key] = _parse_bool(raw)
            except ValueError as exc:
                errors.append(f"{column.header}: {exc}")

        if not supplier and not record.get("company_name"):
            errors.append("Firma Adı yeni tedarikçide zorunlu")

        # Blokaj sureleri: sonuc durum uzerinden tutarlilik
        final_min = values.get(
            "min_block_minutes", supplier.min_block_minutes if supplier else None
        )
        final_max = values.get(
            "max_block_minutes", supplier.max_block_minutes if supplier else None
        )
        if final_min is not None and final_max is not None and final_max < final_min:
            errors.append("Maks. Süre, Min. Süre'den küçük olamaz")

        # Aktiflik
        active_raw = record.get("is_active", "")
        if active_raw:
            try:
                values["is_active"] = _parse_bool(active_raw)
            except ValueError as exc:
                errors.append(f"Aktif: {exc}")

        # Kategoriler
        cats_raw = record.get("categories", "")
        if cats_raw == CLEAR:
            result.category_ids = []
        elif cats_raw:
            ids: list[uuid.UUID] = []
            for part in _split_categories(cats_raw, by_name):
                match = by_name.get(_fold(part))
                if match is None:
                    errors.append(f"Bilinmeyen ürün kategorisi: {part}")
                elif match.id not in ids:
                    ids.append(match.id)
            result.category_ids = ids
        if not supplier and not result.category_ids:
            result.warnings.append(
                "İzinli ürün kategorisi yok: kategori eklenene kadar randevu açamaz"
            )

        # Sure limitleri
        overrides = resolve_supplier_overrides(supplier) if supplier else {
            d: {"mode": "inherit", "minutes": None} for d in DIMENSIONS
        }
        touched = False
        for col_key, dimension in _MINUTE_KEYS.items():
            raw = record.get(col_key, "")
            if not raw:
                continue
            try:
                overrides[dimension] = _parse_minute_limit(raw, dimension)
                touched = True
            except ValueError as exc:
                errors.append(f"{_BY_KEY[col_key].header}: {exc}")
        if touched:
            result.minute_limits_set = True
            result.minute_limits = (
                None if all(o["mode"] == "inherit" for o in overrides.values()) else overrides
            )

        # Portal hesabi
        account_raw = record.get("create_account", "")
        if account_raw:
            try:
                wants = bool(_parse_bool(account_raw))
            except ValueError as exc:
                errors.append(f"Portal Hesabı Aç: {exc}")
                wants = False
            if wants and supplier:
                result.warnings.append(
                    "Portal hesabı yalnızca yeni tedarikçide açılır; mevcut tedarikçi için "
                    "tedarikçi kartını kullanın"
                )
            elif wants:
                email = values.get("contact_email")
                if not email:
                    errors.append("Portal hesabı için E-posta gerekli")
                elif email in taken_account_emails:
                    errors.append(f"{email} başka bir hesapta kullanılıyor")
                elif email in account_emails_seen:
                    errors.append(
                        f"{email} dosyada {account_emails_seen[email]}. satırda da hesap için "
                        "kullanılıyor"
                    )
                else:
                    account_emails_seen[email] = number
                    result.create_account = True

        result.values = values
        if supplier and not errors:
            result.changes = _diff(supplier, result)
            if not result.changes:
                result.action = "unchanged"
    return results


def _diff(supplier: Supplier, result: RowResult) -> list[str]:
    changed: list[str] = []
    for key, value in result.values.items():
        if key == "is_active":
            current = supplier.status.value == "active"
        elif key == "additional_emails":
            current = supplier.additional_emails or []
        else:
            current = getattr(supplier, key)
        if current != value:
            changed.append(key)
    if result.category_ids is not None and set(result.category_ids) != {
        c.id for c in supplier.allowed_product_categories
    }:
        changed.append("allowed_product_categories")
    if result.minute_limits_set and result.minute_limits != (supplier.minute_limits_json or None):
        changed.append("minute_limits")
    return changed


def summarize(results: list[RowResult], file_warnings: list[str]) -> dict[str, Any]:
    return {
        "total": len(results),
        "create": sum(1 for r in results if r.action == "create" and not r.errors),
        "update": sum(1 for r in results if r.action == "update" and not r.errors),
        "unchanged": sum(1 for r in results if r.action == "unchanged" and not r.errors),
        "error_rows": sum(1 for r in results if r.errors),
        "accounts": sum(1 for r in results if r.create_account and not r.errors),
        "file_warnings": file_warnings,
    }


SIMPLE_FIELDS = _SIMPLE_FIELDS
