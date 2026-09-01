#!/usr/bin/env python3
"""LogiSlot uctan uca demo saglik kontrolu (API seviyesi E2E).

Kullanim:
    python3 scripts/demo_smoke.py
    LOGISLOT_BASE_URL=http://localhost:8010 python3 scripts/demo_smoke.py

Env degiskenleri:
    LOGISLOT_BASE_URL        (varsayilan http://localhost:8010)
    LOGISLOT_ADMIN_EMAIL     (varsayilan admin@cakesbakes.com)
    LOGISLOT_PLATFORM_EMAIL  (varsayilan admin@logislot.com)
    LOGISLOT_SUPPLIER_EMAIL  (varsayilan tedarikci@anadoluun.com — MANUEL onayli)
    LOGISLOT_DEMO_PASSWORD   (varsayilan Demo123!)

Basarisiz adimda aciklamayla non-zero exit yapar.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

BASE = os.environ.get("LOGISLOT_BASE_URL", "http://localhost:8010")
ADMIN_EMAIL = os.environ.get("LOGISLOT_ADMIN_EMAIL", "admin@cakesbakes.com")
PLATFORM_EMAIL = os.environ.get("LOGISLOT_PLATFORM_EMAIL", "admin@logislot.com")
# MANUEL onayli tedarikci secilir: 14. adim yeni randevuyu "pending"
# listesinde arar. Otomatik onayli tedarikci (marmarasoguk) ile randevu
# dogrudan "approved" dogar ve o adim her zaman basarisiz olurdu.
SUPPLIER_EMAIL = os.environ.get("LOGISLOT_SUPPLIER_EMAIL", "tedarikci@anadoluun.com")
PASSWORD = os.environ.get("LOGISLOT_DEMO_PASSWORD", "Demo123!")

_step = 0


def step(name: str) -> None:
    global _step
    _step += 1
    print(f"[{_step:>2}] {name} ... ", end="", flush=True)


def ok(detail: str = "") -> None:
    print(f"OK {detail}")


def fail(message: str) -> None:
    print(f"HATA\n     → {message}")
    sys.exit(1)


def request(method: str, path: str, body=None, token=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.load(exc)
        except Exception:
            return exc.code, {"error": {"message": exc.reason}}
    except Exception as exc:
        fail(f"{method} {path}: baglanti hatasi — {exc}")


def expect(status, body, path, expected=200):
    if status != expected or (expected == 200 and not body.get("success", True)):
        message = (body.get("error") or {}).get("message", body)
        fail(f"{path} -> HTTP {status}: {message}")
    return body.get("data")


def login(endpoint: str, email: str) -> str:
    status, body = request("POST", endpoint, {"email": email, "password": PASSWORD})
    data = expect(status, body, endpoint)
    return data["access_token"]


def next_weekday() -> str:
    day = date.today() + timedelta(days=1)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day.isoformat()


def main() -> None:
    print(f"LogiSlot demo smoke — {BASE}\n")

    step("Health check")
    status, body = request("GET", "/health")
    expect(status, body, "/health")
    ok()

    step("Platform login")
    platform_token = login("/auth/platform-login", PLATFORM_EMAIL)
    ok()

    step("Platform usage")
    status, body = request("GET", "/platform/usage", token=platform_token)
    usage = expect(status, body, "/platform/usage")
    ok(f"({usage['totals']['tenants']} tenant, {usage['totals']['facilities']} tesis)")

    step("Admin login")
    admin_token = login("/auth/login", ADMIN_EMAIL)
    ok()

    step("Facility context (/auth/me)")
    status, body = request("GET", "/auth/me", token=admin_token)
    me = expect(status, body, "/auth/me")
    facility_id = me["default_facility_id"]
    if not facility_id:
        fail("Admin kullanicisinin varsayilan tesisi yok")
    ok(f"(tesis: {facility_id[:8]}…)")

    step("Dashboard summary")
    status, body = request(
        "GET", f"/facilities/{facility_id}/dashboard-summary", token=admin_token
    )
    dashboard = expect(status, body, "dashboard-summary")
    ok(f"({dashboard['today_appointments']} bugun, {dashboard['pending_approvals']} bekleyen)")

    step("Calendar day")
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    status, body = request(
        "GET", f"/facilities/{facility_id}/calendar/day?date={tomorrow}", token=admin_token
    )
    calendar = expect(status, body, "calendar/day")
    ok(f"({len(calendar['docks'])} rampa, {len(calendar['appointments'])} randevu)")

    step("Reports summary")
    status, body = request(
        "GET", f"/facilities/{facility_id}/reports/summary", token=admin_token
    )
    report = expect(status, body, "reports/summary")
    ok(f"({report['totals']['appointments']} randevu, %{round(report['rates']['completion_rate']*100)} tamamlanma)")

    step("Branding (fallback/effective)")
    status, body = request(
        "GET", f"/facilities/{facility_id}/branding", token=admin_token
    )
    branding = expect(status, body, "branding")
    ok(f"({branding['brand_name']})")

    step("Supplier login")
    supplier_token = login("/auth/supplier-login", SUPPLIER_EMAIL)
    ok()

    step("Supplier catalog")
    status, body = request("GET", "/supplier/catalog", token=supplier_token)
    catalog = expect(status, body, "/supplier/catalog")
    if not catalog["product_categories"]:
        fail("Tedarikcinin izinli kategorisi yok")
    category_id = catalog["product_categories"][0]["id"]
    ok(f"({len(catalog['product_categories'])} kategori)")

    step("Availability evaluate")
    target = next_weekday()
    status, body = request(
        "POST", "/supplier/availability/evaluate",
        {"product_category_id": category_id, "target_date": target, "duration_minutes": 60},
        token=supplier_token,
    )
    slots = expect(status, body, "availability")
    free = [s for s in slots if s["status"] != "full"]
    if not free:
        fail(f"{target} icin bos slot yok")
    ok(f"({len(slots)} slot, {len(free)} musait)")

    step("Appointment create")
    status, body = request(
        "POST", "/supplier/appointments",
        {
            "product_category_id": category_id,
            "product_name": "Demo Smoke Randevusu",
            "quantity": 1,
            "target_date": target,
            "start_at": free[-1]["start"],
            "duration_minutes": 60,
        },
        token=supplier_token,
    )
    appointment = expect(status, body, "appointment create")
    appointment_id = appointment["id"]
    ok(f"(durum: {appointment['status']}, rampa atandi)")

    step("Admin appointment list (yeni randevu gorunur)")
    status, body = request(
        "GET", f"/facilities/{facility_id}/appointments?status=pending", token=admin_token
    )
    pending = expect(status, body, "appointments list")
    if not any(a["id"] == appointment_id for a in pending):
        fail("Yeni randevu admin listesinde bulunamadi")
    ok()

    step("Approve appointment")
    status, body = request(
        "POST",
        f"/facilities/{facility_id}/appointments/{appointment_id}/approve",
        {},
        token=admin_token,
    )
    approved = expect(status, body, "approve")
    if approved["status"] != "approved":
        fail(f"Beklenen approved, gelen {approved['status']}")
    ok()

    step("Supplier notifications unread")
    status, body = request(
        "GET", "/supplier/notifications/unread-count", token=supplier_token
    )
    unread = expect(status, body, "supplier unread")
    if unread["unread"] < 1:
        fail("Onay bildirimi tedarikciye dusmedi")
    ok(f"({unread['unread']} okunmamis)")

    step("Email logs (onay e-postasi)")
    status, body = request(
        "GET",
        f"/facilities/{facility_id}/email-logs?appointment_id={appointment_id}",
        token=admin_token,
    )
    emails = expect(status, body, "email-logs")["items"]  # Sprint 11: zarf {items,...}
    if not any(e["template_key"] == "appointment_approved" for e in emails):
        fail("Onay e-posta logu bulunamadi")
    ok(f"({len(emails)} kayit, provider: {emails[0]['provider']})")

    step("Temizlik: smoke randevusunu iptal et")
    status, body = request(
        "POST",
        f"/facilities/{facility_id}/appointments/{appointment_id}/cancel",
        {"reason": "Demo smoke temizligi"},
        token=admin_token,
    )
    expect(status, body, "cancel")
    ok()

    print(f"\n✔ Tum adimlar basarili ({_step}/{_step}). Demo ortami saglikli.")


if __name__ == "__main__":
    main()
