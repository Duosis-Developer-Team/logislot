"""Rampa + gun icin gecerli takvim istisnasini secen TEK nokta.

Yazma tarafi rampa+gun basina tek aktif istisna zorunlu kilar
(routers/docks.py), ancak bu kuraldan onceki kayitlarda cift istisna
bulunabilir. Secim o durumda da DETERMINISTIK olmali; aksi halde ayni veri
icin musaitlik motoru ile takvim/rapor gorunumu farkli cevap verebilir.

Kural: KAPALI istisna her zaman kazanir (guvenli yon — kapatilmis bir gunu
yanlislikla acmayiz), esitlikte en son olusturulan kayit kullanilir.
"""

import uuid
from collections.abc import Iterable
from datetime import date as date_type

from app.core.enums import DockOverrideType
from app.models import DockOverride


def pick_override(
    overrides: Iterable[DockOverride], dock_id: uuid.UUID, day: date_type
) -> DockOverride | None:
    matches = [
        o for o in overrides if o.dock_id == dock_id and o.date == day and o.is_active
    ]
    if not matches:
        return None
    closed = [o for o in matches if o.type == DockOverrideType.closed]
    return max(closed or matches, key=lambda o: o.created_at)
