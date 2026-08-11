"""CSV export yardimcilari.

Tek bir yerde toplanmasinin sebebi: BOM + Content-Disposition + formul
enjeksiyonu korumasinin export'lar arasinda birbirinden ayrisamamasi.
"""

import csv
import io
from typing import Any

from fastapi import Response

#: Excel/LibreOffice bu karakterlerle baslayan hucreyi FORMUL olarak yorumlar.
#: Urun adi gibi alanlari tedarikci serbest metin olarak girdiginden, export'u
#: acan tesis yoneticisinin makinesinde kod calismasi mumkun olurdu.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def sanitize_cell(value: Any) -> Any:
    """Formul olarak yorumlanabilecek metin hucrelerini etkisizlestirir.

    Yalnizca metinlere dokunur; sayilar oldugu gibi kalir (negatif sayilar
    hucrede sayi olmaya devam eder).
    """
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value


def csv_response(filename: str, rows: list[list]) -> Response:
    """Excel-uyumlu UTF-8 BOM'lu, formul enjeksiyonuna karsi korumali CSV yaniti."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerows([sanitize_cell(cell) for cell in row] for row in rows)
    return Response(
        content="﻿" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
