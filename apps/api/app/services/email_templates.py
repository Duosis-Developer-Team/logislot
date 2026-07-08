"""E-posta sablonlari (duz metin, Turkce).

Sablon motoru YOK (bilincli MVP karari): her anahtar kucuk bir Python
fonksiyonudur. Ileride Jinja'ya gecis, ayni anahtar sozlesmesi korunarak
render_email() icinin degistirilmesiyle yapilir; cagiran kod degismez.
"""

from dataclasses import dataclass

from app.core.config import get_settings

STATUS_LABELS = {
    "pending": "Onay Bekliyor",
    "approved": "Onaylandı",
    "revision_pending": "Revize Bekliyor",
    "rejected": "Reddedildi",
    "completed": "Tamamlandı",
    "cancelled": "İptal Edildi",
}


@dataclass
class EmailContext:
    supplier_name: str
    product_name: str
    when: str  # "15.07.2026 10:00" bicimli yerel saat
    dock_name: str | None = None
    status: str | None = None
    reason: str | None = None
    old_when: str | None = None
    new_when: str | None = None
    note: str | None = None
    occurrence_count: int | None = None  # seri iptali icin


def _portal_link() -> str:
    return f"{get_settings().public_web_url.rstrip('/')}/login"


def _details(ctx: EmailContext) -> str:
    lines = [
        f"Tarih/Saat : {ctx.when}",
        f"Ürün       : {ctx.product_name}",
    ]
    if ctx.dock_name:
        lines.append(f"Rampa      : {ctx.dock_name}")
    if ctx.status:
        lines.append(f"Durum      : {STATUS_LABELS.get(ctx.status, ctx.status)}")
    return "\n".join(lines)


def _wrap(greeting_name: str, message: str, ctx: EmailContext) -> str:
    return (
        f"Sayın {greeting_name},\n\n"
        f"{message}\n\n"
        f"{_details(ctx)}\n\n"
        f"Portalda görüntüle: {_portal_link()}\n\n"
        "LogiSlot"
    )


def _approved(ctx: EmailContext) -> tuple[str, str]:
    return (
        f"Randevunuz onaylandı — {ctx.when}",
        _wrap(ctx.supplier_name, f'"{ctx.product_name}" randevunuz onaylandı.', ctx),
    )


def _rejected(ctx: EmailContext) -> tuple[str, str]:
    return (
        "Randevu talebiniz reddedildi",
        _wrap(
            ctx.supplier_name,
            f'"{ctx.product_name}" talebiniz reddedildi.'
            + (f"\nRed sebebi: {ctx.reason}" if ctx.reason else ""),
            ctx,
        ),
    )


def _revised(ctx: EmailContext) -> tuple[str, str]:
    return (
        f"Randevunuz revize edildi — yeni saat {ctx.when}",
        _wrap(
            ctx.supplier_name,
            f'"{ctx.product_name}" randevunuz için tesis yönetimi yeni saat önerdi:\n'
            f"{ctx.old_when or '-'} → {ctx.new_when or '-'}"
            + (f"\nNot: {ctx.note}" if ctx.note else ""),
            ctx,
        ),
    )


def _revised_team(ctx: EmailContext) -> tuple[str, str]:
    return (
        f"Randevu revize edildi — {ctx.when}",
        _wrap(
            ctx.supplier_name,  # ekip mailinde de baglam tedarikci adiyla verilir
            f'{ctx.supplier_name} — "{ctx.product_name}" randevusu revize edildi:\n'
            f"{ctx.old_when or '-'} → {ctx.new_when or '-'}"
            + (f"\nNot: {ctx.note}" if ctx.note else ""),
            ctx,
        ),
    )


def _cancelled(ctx: EmailContext) -> tuple[str, str]:
    return (
        f"Randevunuz iptal edildi — {ctx.when}",
        _wrap(
            ctx.supplier_name,
            f'"{ctx.product_name}" randevunuz iptal edildi.'
            + (f"\nİptal sebebi: {ctx.reason}" if ctx.reason else ""),
            ctx,
        ),
    )


def _series_cancelled(ctx: EmailContext) -> tuple[str, str]:
    count = ctx.occurrence_count or 0
    return (
        "Tekrarlayan randevu seriniz iptal edildi",
        _wrap(
            ctx.supplier_name,
            f'"{ctx.product_name}" tekrarlayan serinizin gelecekteki {count} randevusu '
            "iptal edildi. Tamamlanmış randevular etkilenmedi."
            + (f"\nİptal sebebi: {ctx.reason}" if ctx.reason else ""),
            ctx,
        ),
    )


def _series_revised(ctx: EmailContext) -> tuple[str, str]:
    count = ctx.occurrence_count or 0
    return (
        "Tekrarlayan randevu seriniz revize edildi",
        _wrap(
            ctx.supplier_name,
            f'"{ctx.product_name}" serinizin gelecekteki {count} randevusu için tesis '
            f"yönetimi yeni saat önerdi: {ctx.new_when or '-'}"
            + (f"\nNot: {ctx.note}" if ctx.note else "")
            + "\nRandevular onayınız beklenerek 'Revize Bekliyor' durumuna alındı.",
            ctx,
        ),
    )


TEMPLATES = {
    "appointment_approved": _approved,
    "appointment_rejected": _rejected,
    "appointment_revised": _revised,
    "appointment_revised_team": _revised_team,
    "appointment_cancelled": _cancelled,
    "appointment_series_cancelled": _series_cancelled,
    "appointment_series_revised": _series_revised,
}


def render_email(template_key: str, ctx: EmailContext) -> tuple[str, str]:
    """(subject, body) dondurur; bilinmeyen anahtar ValueError."""
    try:
        return TEMPLATES[template_key](ctx)
    except KeyError as exc:
        raise ValueError(f"Bilinmeyen e-posta sablonu: {template_key}") from exc
