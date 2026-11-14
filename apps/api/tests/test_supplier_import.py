"""Tedarikci Excel sablonu + toplu ice aktarma (musteri karari 2026-11).

Eslesme koda gore (varsa guncelle, yoksa olustur); guncellemede bos hucre
degistirmez, "-" temizler; tek hatada hicbir satir yazilmaz; dosya saklanmaz.
"""

import io

from openpyxl import Workbook, load_workbook

from app.seed import DEMO_PASSWORD
from app.services.supplier_import import COLUMNS, SHEET_NAME
from tests.conftest import auth_headers, login

HEADERS = [c.header for c in COLUMNS]


def xlsx(rows: list[dict[str, object]], headers: list[str] | None = None) -> bytes:
    """Baslik -> deger sozlukleriyle bir calisma kitabi."""
    headers = headers or HEADERS
    wb = Workbook()
    ws = wb.active
    ws.title = SHEET_NAME
    ws.append(headers)
    for row in rows:
        ws.append([row.get(h) for h in headers])
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


async def admin(client) -> dict:
    return auth_headers(await login(client, "/auth/login", "admin@cakesbakes.com"))


def base(seeded) -> str:
    return f"/facilities/{seeded['facility'].id}/supplier-import"


async def upload(client, seeded, headers, step: str, data: bytes, name="tedarikciler.xlsx"):
    return await client.post(
        f"{base(seeded)}/{step}",
        headers=headers,
        files={"file": (name, data, "application/octet-stream")},
    )


async def suppliers_by_code(client, seeded, headers) -> dict[str, dict]:
    fid = seeded["facility"].id
    rows = (await client.get(f"/facilities/{fid}/suppliers", headers=headers)).json()["data"]
    return {r["code"]: r for r in rows}


NEW_ROW = {
    "Tedarikçi Kodu": "SUP-900",
    "Firma Adı": "Ege Yağ San.",
    "Yetkili Kişi": "Zeynep Ak",
    "E-posta": "Zeynep@EgeYag.example.com",
    "Ek E-postalar": (
        "lojistik@egeyag.example.com; muhasebe@egeyag.example.com, lojistik@egeyag.example.com"
    ),
    "İzinli Ürün Kategorileri": "unlu mamul hammaddesi, Ambalaj Malzemesi",
    "Min. Süre (dk)": 30,
    "Maks. Süre (dk)": 120,
    "Günlük Süre Limiti (dk)": 240,
    "Haftalık Süre Limiti (dk)": "Sınırsız",
    "Kargo": "Evet",
    "Portal Hesabı Aç": "Evet",
}


async def test_template_has_columns_categories_and_guide(client, seeded):
    headers = await admin(client)
    response = await client.get(f"{base(seeded)}/template", headers=headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert "attachment" in response.headers["content-disposition"]
    wb = load_workbook(io.BytesIO(response.content))
    assert wb.sheetnames == [SHEET_NAME, "Kategoriler", "Açıklama"]
    assert [c.value for c in wb[SHEET_NAME][1]] == HEADERS
    categories = [r[0] for r in wb["Kategoriler"].iter_rows(min_row=2, values_only=True)]
    assert "Unlu Mamul Hammaddesi" in categories


async def test_preview_classifies_rows_and_writes_nothing(client, seeded):
    headers = await admin(client)
    data = xlsx([
        NEW_ROW,
        {"Tedarikçi Kodu": "sup-001", "Telefon": "0212 555 00 00"},  # kod buyuk/kucuk duyarsiz
        {"Tedarikçi Kodu": "SUP-002", "Firma Adı": "Marmara Soguk Zincir Ltd."},  # degisiklik yok
        {"Tedarikçi Kodu": "SUP-901", "Firma Adı": "Hatalı", "Kargo": "belki",
         "İzinli Ürün Kategorileri": "Yok Böyle", "Min. Süre (dk)": 90, "Maks. Süre (dk)": 60},
        {"Tedarikçi Kodu": "SUP-900", "Firma Adı": "Tekrar"},
        {"Firma Adı": "Kodsuz"},
    ])
    response = await upload(client, seeded, headers, "preview", data)
    assert response.status_code == 200, response.text
    body = response.json()["data"]
    rows = {r["row"]: r for r in body["rows"]}
    assert rows[2]["action"] == "create" and rows[2]["errors"] == [] and rows[2]["create_account"]
    assert rows[3]["action"] == "update" and rows[3]["changes"] == ["contact_phone"]
    assert rows[4]["action"] == "unchanged"
    errors = " | ".join(rows[5]["errors"])
    assert "Kargo" in errors and "Yok Böyle" in errors and "Maks. Süre" in errors
    assert any("2. satırda da var" in e for e in rows[6]["errors"])
    assert rows[7]["errors"] == ["Tedarikçi Kodu boş"]
    assert body["summary"] == {
        "total": 6, "create": 1, "update": 1, "unchanged": 1, "error_rows": 3, "accounts": 1,
        "file_warnings": [],
    }
    assert "SUP-900" not in await suppliers_by_code(client, seeded, headers)


async def test_commit_is_all_or_nothing(client, seeded):
    headers = await admin(client)
    data = xlsx([NEW_ROW, {"Tedarikçi Kodu": "SUP-902", "Firma Adı": "X", "Aktif": "?"}])
    response = await upload(client, seeded, headers, "commit", data)
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "IMPORT_HAS_ERRORS"
    assert error["details"]["summary"]["error_rows"] == 1
    assert "SUP-900" not in await suppliers_by_code(client, seeded, headers)


async def test_commit_creates_updates_and_opens_accounts(client, seeded):
    headers = await admin(client)
    data = xlsx([
        NEW_ROW,
        # Guncelleme: bos hucre degistirmez, "-" temizler, yalnizca verilen alanlar.
        {"Tedarikçi Kodu": "SUP-001", "Telefon": "-", "Notlar": "Excel'den",
         "Aylık Kota (adet)": 40, "Günlük Süre Limiti (dk)": "Varsayılan",
         "Aktif": "Hayır"},
    ])
    before = (await suppliers_by_code(client, seeded, headers))["SUP-001"]
    response = await upload(client, seeded, headers, "commit", data)
    assert response.status_code == 200, response.text
    result = response.json()["data"]
    assert (result["summary"]["create"], result["summary"]["update"]) == (1, 1)
    [account] = result["accounts"]
    assert account["email"] == "zeynep@egeyag.example.com" and len(account["password"]) >= 8

    rows = await suppliers_by_code(client, seeded, headers)
    created = rows["SUP-900"]
    assert created["company_name"] == "Ege Yağ San."
    assert created["contact_email"] == "zeynep@egeyag.example.com"
    assert created["additional_emails"] == [
        "lojistik@egeyag.example.com", "muhasebe@egeyag.example.com",
    ]
    assert len(created["allowed_product_category_ids"]) == 2
    assert (created["min_block_minutes"], created["max_block_minutes"]) == (30, 120)
    assert created["cargo_enabled"] is True and created["is_active"] is True
    assert created["minute_limits"]["daily"] == {"mode": "custom", "minutes": 240}
    assert created["minute_limits"]["weekly"]["mode"] == "unlimited"
    assert created["account_email"] == "zeynep@egeyag.example.com"

    updated = rows["SUP-001"]
    assert updated["contact_phone"] is None and updated["notes"] == "Excel'den"
    assert updated["monthly_quota"] == 40 and updated["is_active"] is False
    assert updated["company_name"] == before["company_name"]  # bos hucre: degismedi
    assert updated["contact_email"] == before["contact_email"]
    assert updated["allowed_product_category_ids"] == before["allowed_product_category_ids"]

    # Acilan hesap gecici parolayla girer ve parola degistirmeye zorlanir.
    response = await client.post("/auth/supplier-login", json={
        "email": account["email"], "password": account["password"],
    })
    assert response.status_code == 200, response.text
    assert response.json()["data"]["must_change_password"] is True

    fid = seeded["facility"].id
    logs = (await client.get(f"/facilities/{fid}/audit-logs?limit=200", headers=headers)).json()
    actions = [e["action"] for e in logs["data"]["items"]]
    assert "supplier.import" in actions and "supplier_user.create" in actions

    # Ayni dosya tekrar: tedarikci artik mevcut ve degisiklik yok; hesap tekrar acilmaz.
    response = await upload(client, seeded, headers, "preview", xlsx([NEW_ROW]))
    row = response.json()["data"]["rows"][0]
    assert row["action"] == "unchanged" and row["create_account"] is False
    assert any("yalnızca yeni tedarikçide" in w for w in row["warnings"])


async def test_account_email_conflicts_are_row_errors(client, seeded):
    headers = await admin(client)
    data = xlsx([
        {**NEW_ROW, "E-posta": "tedarikci@anadoluun.com"},  # mevcut portal hesabi
        {**NEW_ROW, "Tedarikçi Kodu": "SUP-903", "E-posta": "yeni@x.example.com"},
        {**NEW_ROW, "Tedarikçi Kodu": "SUP-904", "E-posta": "YENI@x.example.com"},
        {**NEW_ROW, "Tedarikçi Kodu": "SUP-905", "E-posta": ""},
    ])
    rows = (await upload(client, seeded, headers, "preview", data)).json()["data"]["rows"]
    assert any("başka bir hesapta" in e for e in rows[0]["errors"])
    assert rows[1]["errors"] == []
    assert any("3. satırda da hesap" in e for e in rows[2]["errors"])
    assert rows[3]["errors"] == ["Portal hesabı için E-posta gerekli"]


async def test_file_level_errors_and_permissions(client, seeded):
    headers = await admin(client)
    response = await upload(client, seeded, headers, "preview", b"kod,firma\nA,B\n", "x.csv")
    assert response.json()["error"]["code"] == "IMPORT_FILE_INVALID"
    response = await upload(
        client, seeded, headers, "preview", xlsx([{"Firma Adı": "X"}], headers=["Firma Adı"])
    )
    assert response.json()["error"]["code"] == "IMPORT_HEADER_INVALID"
    response = await upload(client, seeded, headers, "preview", xlsx([]))
    assert response.json()["error"]["code"] == "IMPORT_EMPTY"
    response = await upload(client, seeded, headers, "preview", b"x" * (2 * 1024 * 1024 + 10))
    assert response.json()["error"]["code"] == "IMPORT_FILE_TOO_LARGE"

    # Turkce karakter / buyuk-kucuk harf farkli basliklar da taninir; bilinmeyen uyari olur.
    data = xlsx(
        [{"TEDARIKÇI KODU": "SUP-950", "firma adi": "Başlık Testi", "Renk": "mavi"}],
        headers=["TEDARIKÇI KODU", "firma adi", "Renk"],
    )
    body = (await upload(client, seeded, headers, "preview", data)).json()["data"]
    assert body["rows"][0]["action"] == "create" and body["rows"][0]["errors"] == []
    assert body["summary"]["file_warnings"] == ["Tanınmayan sütun yok sayıldı: Renk"]

    viewer = auth_headers(await login(client, "/auth/login", "izleyici@cakesbakes.com"))
    assert (await client.get(f"{base(seeded)}/template", headers=viewer)).status_code == 403
    assert DEMO_PASSWORD  # seed hesaplari kullanildi


def test_category_names_with_commas_are_not_split():
    from types import SimpleNamespace

    from app.services.supplier_import import _fold, _split_categories

    names = ["Soğuk Zincir (Et, Donuk, Süt)", "Genel", "Ambalaj Malzemesi"]
    known = {_fold(n): SimpleNamespace(id=n) for n in names}
    assert _split_categories("soğuk zincir (et, donuk, süt), Genel", known) == [
        "soğuk zincir (et, donuk, süt)", "Genel",
    ]
    assert _split_categories("Genel; Yok Böyle, Ambalaj Malzemesi", known) == [
        "Genel", "Yok Böyle", "Ambalaj Malzemesi",
    ]
