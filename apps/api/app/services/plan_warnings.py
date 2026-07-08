"""Plan included_quota esik degerlendirmesi (Sprint 10/11 ortak).

Plan FATURALAMA MOTORU DEGILDIR: rate_card'daki included_quota yalnizca
uyari esigi olarak yorumlanir; hicbir operasyon engellenmez.
"""

from typing import Any

USAGE_WARNING_THRESHOLDS = [(120, "critical"), (100, "warning"), (80, "info")]

DIMENSION_LABELS = {
    "appointments_created": "randevu kullanımı",
    "appointments_completed": "tamamlanan randevu kullanımı",
    "active_docks": "aktif rampa sayısı",
    "active_suppliers": "aktif tedarikçi sayısı",
    "active_users": "aktif kullanıcı sayısı",
    "active_facilities": "tesis sayısı",
}


def evaluate_rate_card(plan, dims: dict[str, int]) -> list[dict[str, Any]]:
    """rate_card_json'daki her included_quota'li boyut icin esik uyarisi uretir."""
    results: list[dict[str, Any]] = []
    for entry in plan.rate_card_json or []:
        quota = entry.get("included_quota")
        dimension = entry.get("dimension")
        if not quota or dimension not in dims:
            continue
        used = dims[dimension]
        percent = round(used / quota * 100)
        severity = next(
            (level for limit, level in USAGE_WARNING_THRESHOLDS if percent >= limit),
            None,
        )
        if severity is None:
            continue
        results.append(
            {
                "dimension": dimension,
                "label": DIMENSION_LABELS.get(dimension, dimension),
                "used": used,
                "included_quota": quota,
                "percent": percent,
                "severity": severity,
            }
        )
    return results
