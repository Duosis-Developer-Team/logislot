"""Islem suresi hesaplama motoru (tesis bazli kurallar).

Musteri karari (2026-11 toplantisi): islem suresini tedarikci secmesin; sevkiyat
tipi (palet, cuval, big bag...), miktar, arac tipi ve urun kategorisine gore
sistem hesaplasin. Ayni araca az ya da cok yuk gelebildigi icin sure MIKTARA
baglidir; arac tek basina sureyi belirlemez.

ALGORITMA (docs/SURE_HESAPLAMA.md'de orneklerle):

1. Eslesme: aktif kurallar `position` sirasiyla taranir; dort kosulu da tutan
   ILK kural uygulanir. Bos kosul "hepsi" demektir:
     arac tipi · urun kategorisi · sevkiyat tipi (birim) · miktar araligi [min, max]
   Arac tipi verilmemis randevuda kategorinin varsayilan araci kullanilir
   (randevu olusturmayla ayni cozum).
2. Ham sure:
     sabit      -> fixed_minutes
     birim basi -> base_minutes + per_unit_minutes x miktar
3. Kirpma: kuralin istege bagli alt/ust siniri (min_minutes / max_minutes).
4. Yuvarlama: tesisin adimina YUKARI (5/10/15/30 dk; 1 = yuvarlama yok).
   Rampa planlamasi icin sure asla asagi yuvarlanmaz.
5. Eslesen kural yoksa: kategorinin taban blokaj suresi ("fallback") — kilitli
   modda bile randevu engellenmez, kaynak acikca "fallback" olarak isaretlenir.

MODLAR (tesis ayari):
  supplier  : tedarikci secer (eski davranis, varsayilan)
  suggested : sistem hesaplar ve onerir; tedarikci sinirlar icinde degistirebilir
  computed  : sistem hesaplar; tedarikcinin gonderdigi sure YOK SAYILIR
Yonetim her modda sureyi elle degistirebilir (elle sure kategori sinirlarina tabi).
Kuraldan gelen sure kategori/tedarikci min-maks sinirlarina takilmaz: kurali
yonetim acikca tanimlamistir.
"""

import math
import uuid
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import DurationCalcType, DurationMode
from app.models import DurationRule, ProductCategory

ROUNDING_CHOICES = (1, 5, 10, 15, 30)
DEFAULT_ROUNDING = 15
#: Tek randevunun alabilecegi en uzun sure (bir gun). Hatali kurali sinirlar.
MAX_RULE_MINUTES = 1440

DEFAULT_DURATION_POLICY: dict[str, Any] = {
    "mode": DurationMode.supplier.value,
    "rounding_minutes": DEFAULT_ROUNDING,
}


def resolve_duration_policy(facility: Any) -> dict[str, Any]:
    stored = getattr(facility, "duration_policy_json", None)
    stored = stored if isinstance(stored, dict) else {}
    mode = stored.get("mode")
    rounding = stored.get("rounding_minutes")
    return {
        "mode": mode if mode in {m.value for m in DurationMode} else DurationMode.supplier.value,
        "rounding_minutes": (
            rounding
            if isinstance(rounding, int) and not isinstance(rounding, bool)
            and rounding in ROUNDING_CHOICES
            else DEFAULT_ROUNDING
        ),
    }


@dataclass(frozen=True)
class DurationEstimate:
    minutes: int
    #: "rule" (kuraldan) veya "fallback" (kural yok, kategori taban suresi)
    source: str
    rule_id: uuid.UUID | None = None
    rule_position: int | None = None
    rule_name: str | None = None
    #: Insan okunur hesap adimlari (Turkce; arayuz "nasil hesaplandi" gosterir)
    steps: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "minutes": self.minutes,
            "source": self.source,
            "rule_id": str(self.rule_id) if self.rule_id else None,
            "rule_position": self.rule_position,
            "rule_name": self.rule_name,
            "steps": self.steps,
        }


# ------------------------------------------------------------------ eslesme


def rule_matches(
    rule: DurationRule,
    *,
    vehicle_category_id: uuid.UUID | None,
    product_category_id: uuid.UUID,
    quantity_unit: str,
    quantity: int,
) -> bool:
    if rule.vehicle_category_id is not None and rule.vehicle_category_id != vehicle_category_id:
        return False
    if rule.product_category_id is not None and rule.product_category_id != product_category_id:
        return False
    if rule.quantity_unit is not None and rule.quantity_unit != quantity_unit:
        return False
    if rule.min_quantity is not None and quantity < rule.min_quantity:
        return False
    if rule.max_quantity is not None and quantity > rule.max_quantity:
        return False
    return True


def find_rule(rules: list[DurationRule], **conditions: Any) -> DurationRule | None:
    for rule in rules:
        if rule.is_active and rule_matches(rule, **conditions):
            return rule
    return None


def _fmt(value: Decimal) -> str:
    text = format(value.normalize(), "f")
    return text.replace(".", ",")


def compute_rule_minutes(
    rule: DurationRule, quantity: int, rounding: int
) -> tuple[int, list[str]]:
    """Kuralin bu miktar icin urettigi sure ve hesap adimlari."""
    steps: list[str] = []
    if rule.calc_type == DurationCalcType.fixed:
        raw = Decimal(rule.fixed_minutes or 0)
        steps.append(f"Sabit süre: {_fmt(raw)} dk")
    else:
        base = Decimal(rule.base_minutes or 0)
        per_unit = Decimal(rule.per_unit_minutes or 0)
        raw = base + per_unit * quantity
        steps.append(f"{_fmt(base)} dk taban + {quantity} × {_fmt(per_unit)} dk = {_fmt(raw)} dk")
    if rule.min_minutes is not None and raw < rule.min_minutes:
        raw = Decimal(rule.min_minutes)
        steps.append(f"Alt sınır uygulandı: {rule.min_minutes} dk")
    if rule.max_minutes is not None and raw > rule.max_minutes:
        raw = Decimal(rule.max_minutes)
        steps.append(f"Üst sınır uygulandı: {rule.max_minutes} dk")
    step = rounding if rounding > 1 else 1
    rounded = math.ceil(raw.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) / step) * step
    rounded = min(max(int(rounded), step), MAX_RULE_MINUTES)
    if Decimal(rounded) != raw:
        steps.append(f"{step} dakikaya yukarı yuvarlandı: {rounded} dk")
    return rounded, steps


async def load_rules(
    db: AsyncSession, facility_id: uuid.UUID, *, active_only: bool = True
) -> list[DurationRule]:
    query = select(DurationRule).where(DurationRule.facility_id == facility_id)
    if active_only:
        query = query.where(DurationRule.is_active.is_(True))
    query = query.order_by(DurationRule.position, DurationRule.created_at)
    return list((await db.execute(query)).scalars())


def estimate_with_rules(
    rules: list[DurationRule],
    policy: dict[str, Any],
    *,
    product_category: ProductCategory,
    vehicle_category_id: uuid.UUID | None,
    quantity: int,
    quantity_unit: str,
) -> DurationEstimate:
    """Saf hesap (DB'siz): senaryo tablosu ayni kurallarla cok kez cagirir."""
    vehicle_id = vehicle_category_id or product_category.default_vehicle_category_id
    rule = find_rule(
        rules,
        vehicle_category_id=vehicle_id,
        product_category_id=product_category.id,
        quantity_unit=str(quantity_unit),
        quantity=quantity,
    )
    if rule is None:
        minutes = product_category.min_block_minutes
        return DurationEstimate(
            minutes=minutes,
            source="fallback",
            steps=[f"Eşleşen kural yok; kategorinin taban süresi uygulandı: {minutes} dk"],
        )
    minutes, steps = compute_rule_minutes(rule, quantity, policy["rounding_minutes"])
    return DurationEstimate(
        minutes=minutes,
        source="rule",
        rule_id=rule.id,
        rule_position=rule.position,
        rule_name=rule.name,
        steps=steps,
    )


async def estimate_duration(
    db: AsyncSession,
    facility: Any,
    *,
    product_category: ProductCategory,
    vehicle_category_id: uuid.UUID | None,
    quantity: int,
    quantity_unit: str,
) -> DurationEstimate:
    return estimate_with_rules(
        await load_rules(db, facility.id),
        resolve_duration_policy(facility),
        product_category=product_category,
        vehicle_category_id=vehicle_category_id,
        quantity=quantity,
        quantity_unit=quantity_unit,
    )


# ------------------------------------------------------------------ analiz


def specificity(rule: DurationRule) -> int:
    """Kuralin kac kosulu dolu: arac, kategori, birim, miktar alt/ust siniri."""
    return sum(
        value is not None
        for value in (
            rule.vehicle_category_id,
            rule.product_category_id,
            rule.quantity_unit,
            rule.min_quantity,
            rule.max_quantity,
        )
    )


def _covers(general: DurationRule, specific: DurationRule) -> bool:
    """`general`, `specific`in eslesecegi HER durumda da esleserse True."""
    for attr in ("vehicle_category_id", "product_category_id", "quantity_unit"):
        g = getattr(general, attr)
        if g is not None and g != getattr(specific, attr):
            return False
    g_min = general.min_quantity if general.min_quantity is not None else -math.inf
    s_min = specific.min_quantity if specific.min_quantity is not None else -math.inf
    g_max = general.max_quantity if general.max_quantity is not None else math.inf
    s_max = specific.max_quantity if specific.max_quantity is not None else math.inf
    return g_min <= s_min and g_max >= s_max


def shadowed_rules(rules: list[DurationRule]) -> dict[uuid.UUID, uuid.UUID]:
    """Hic uygulanamayacak kurallar: {golgelenen kural: onu golgeleyen onceki kural}.

    Ust siradaki daha genel bir kural her durumda once eslesiyorsa alttaki kural
    olu kalir; arayuz bunu uyarir ve "en ozel ustte" siralamasini onerir.
    """
    active = [r for r in rules if r.is_active]
    result: dict[uuid.UUID, uuid.UUID] = {}
    for index, rule in enumerate(active):
        for earlier in active[:index]:
            if _covers(earlier, rule):
                result[rule.id] = earlier.id
                break
    return result


def sort_by_specificity(rules: list[DurationRule]) -> list[DurationRule]:
    """En ozel kural uste; esitlikte mevcut sira korunur (kararli siralama)."""
    return sorted(rules, key=lambda r: (-specificity(r), r.position))
