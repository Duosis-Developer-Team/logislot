#!/usr/bin/env python3
"""LogiSlot pilot hazirlik kontrolu (Sprint 12).

Canli API'ye karsi kosar ve PASS/WARN/FAIL/MANUAL listesi basar.
Cikis kodu yalnizca FAIL varsa non-zero olur; WARN'lar gozden gecirilmelidir.

Kullanim:
    python3 scripts/pilot_readiness.py
    LOGISLOT_BASE_URL=https://api.staging... LOGISLOT_WEB_URL=https://portal... \
        PLATFORM_EMAIL=... PLATFORM_PASSWORD=... python3 scripts/pilot_readiness.py
"""

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("LOGISLOT_BASE_URL", "http://localhost:8010")
WEB = os.environ.get("LOGISLOT_WEB_URL", "http://localhost:3010")
EMAIL = os.environ.get("PLATFORM_EMAIL", "admin@logislot.com")
PASSWORD = os.environ.get("PLATFORM_PASSWORD", "Demo123!")

results: list[tuple[str, str, str]] = []  # (level, check, detail)


def add(level: str, check: str, detail: str = "") -> None:
    results.append((level, check, detail))


def request(method: str, path: str, token: str | None = None, body: dict | None = None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    with urllib.request.urlopen(req, data, timeout=10) as response:
        return response.status, json.load(response)


def main() -> int:
    # 1) API saglik
    try:
        status, health = request("GET", "/health")
        if status == 200 and health["data"]["status"] == "ok":
            add("PASS", "API /health")
        else:
            add("FAIL", "API /health", f"beklenmeyen yanit: {health}")
    except Exception as exc:
        add("FAIL", "API /health", str(exc))
        return report()

    # 2) Web login sayfasi
    try:
        with urllib.request.urlopen(f"{WEB}/login", timeout=10) as response:
            add("PASS" if response.status == 200 else "FAIL", "Web /login")
    except Exception as exc:
        add("FAIL", "Web /login", str(exc))

    # 3) Platform girisi + support/health
    try:
        _, login = request(
            "POST", "/auth/platform-login", body={"email": EMAIL, "password": PASSWORD}
        )
        token = login["data"]["access_token"]
        add("PASS", "Platform girisi")
    except Exception as exc:
        add("FAIL", "Platform girisi", str(exc))
        return report()

    try:
        _, envelope = request("GET", "/platform/support/health", token)
        data = envelope["data"]
    except Exception as exc:
        add("FAIL", "Support health", str(exc))
        return report()
    add("PASS", "Support health")

    config = data.get("config", {})
    production = config.get("environment") == "production"

    # 4) E-posta durumu
    failed = data["failed_email_count"]
    add("PASS" if failed == 0 else "WARN", "Basarisiz e-posta",
        f"{failed} kayit — E-posta Loglari'ndan inceleyin" if failed else "")
    due = data["due_email_retry_count"]
    add("PASS" if due == 0 else "WARN", "Retry bekleyen e-posta",
        f"{due} kayit (scheduler denemeye devam ediyor)" if due else "")

    # 5) Scheduler son kosumlari
    for job, label in (("email_retry", "Scheduler: e-posta retry"),
                       ("notification_cleanup", "Scheduler: bildirim temizligi")):
        run = (data.get("scheduler") or {}).get(job)
        if run is None:
            add("WARN", label, "henuz hic kosmadi — scheduler ayakta mi?")
        elif run["last_status"] == "success":
            add("PASS", label, f"son: {run['last_finished_at']}")
        elif run["last_status"] == "skipped_locked":
            add("PASS", label, "kilitli atlandi (baska instance kostu)")
        else:
            add("WARN", label, f"son kosum HATALI: {run.get('error_message')}")

    # 6) Plan uyarilari + operasyon kuyrugu (bilgilendirme)
    warnings_count = data["plan_warning_count"]
    add("PASS" if warnings_count == 0 else "WARN", "Plan kullanim uyarilari",
        f"{warnings_count} uyari (Platform → Kullanim)" if warnings_count else "")
    add("PASS", "Envanter",
        f"{data['tenant_count']} tenant, {data['active_facility_count']} aktif tesis, "
        f"{data['pending_appointment_count']} bekleyen randevu")

    # 7) Konfigurasyon kontrolleri
    if production and config.get("docs_enabled"):
        add("WARN", "API docs", "production'da ACIK — LOGISLOT_ENABLE_DOCS=false yapin")
    else:
        add("PASS", "API docs", "kapali" if not config.get("docs_enabled") else "acik (dev)")
    if production and config.get("email_provider") == "log_only":
        add("WARN", "E-posta provider", "production'da log_only — SMTP kurun")
    else:
        add("PASS", "E-posta provider", config.get("email_provider", "?"))
    add("PASS" if config.get("rate_limit_enabled") else "WARN", "Rate limit",
        "" if config.get("rate_limit_enabled") else "KAPALI — acin")
    add("PASS" if config.get("scheduler_enabled") else "WARN", "Scheduler config",
        "" if config.get("scheduler_enabled") else "LOGISLOT_SCHEDULER_ENABLED=false")
    if production and PASSWORD == "Demo123!":
        add("WARN", "Demo parolasi", "production'da demo parolayla giris yapilabiliyor")

    # 8) Elle kosulmasi gerekenler (uydurma PASS YOK)
    add("MANUAL", "Migration head", "docker compose exec api alembic current")
    add("MANUAL", "Demo smoke", "python3 scripts/demo_smoke.py")
    add("MANUAL", "Restore smoke", "./scripts/backup_restore_smoke.sh (son 7 gunde)")

    return report()


def report() -> int:
    icons = {"PASS": "✔", "WARN": "⚠", "FAIL": "✘", "MANUAL": "➜"}
    print("\nLogiSlot Pilot Hazirlik Raporu")
    print("=" * 60)
    for level, check, detail in results:
        line = f"{icons[level]} {level:<6} {check}"
        if detail:
            line += f" — {detail}"
        print(line)
    fails = sum(1 for level, _, _ in results if level == "FAIL")
    warns = sum(1 for level, _, _ in results if level == "WARN")
    print("=" * 60)
    print(f"Sonuc: {fails} FAIL, {warns} WARN")
    if fails:
        print("Pilot oncesi FAIL'ler giderilmeli.")
    elif warns:
        print("WARN'lar gozden gecirilmeli; engel degil.")
    else:
        print("Hazir gorunuyor. MANUAL adimlari kosmayi unutmayin.")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
