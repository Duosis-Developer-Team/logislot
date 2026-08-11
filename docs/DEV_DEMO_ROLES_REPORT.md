# LogiSlot Dev Demo Role Accounts Report

Tarih: 2026-07-09

## 1. Özet

İstenen iki demo hesap — `rampa@cakesbakes.com` (Rampa / Depo Yöneticisi) ve
`izleyici@cakesbakes.com` (İzleyici) — **`logislot-dev` ortamında zaten mevcut
ve doğru yapılandırılmış durumda**. Deploy sırasında koşan `python -m app.seed`
job'ı bu hesapları standart demo setinin parçası olarak (doğru rol, izin seti,
rampa scope ve `must_change_password=false` ile) oluşturmuş; kullanıcının
gördüğü "minimum set" yalnızca eksik listelemeydi. **Yeni seed/repair
gerekmedi**; hesaplar canlı dev'e karşı uçtan uca doğrulandı (login + RBAC +
UI smoke). Prod'a ve Hermes'e dokunulmadı; hiçbir veri değiştirilmedi
(salt-okunur doğrulama; izleyicinin denenen approve isteği 403 ile bloklandı).

## 2. Eklenen / Onarılan Hesaplar

Hiçbir ekleme/onarım GEREKMEDİ — ikisi de mevcut ve sağlıklı:

| Hesap | Parola | must_change | Durum |
|---|---|---|---|
| `rampa@cakesbakes.com` | Demo123! | false | Mevcut, doğru ✔ |
| `izleyici@cakesbakes.com` | Demo123! | false | Mevcut, doğru ✔ |

Korunan mevcut hesaplar: `admin@logislot.com`, `admin@cakesbakes.com`,
`tedarikci@anadoluun.com` (+ marmarasoguk, hizlikargo) — dokunulmadı.

## 3. Roller ve Permission Setleri (canlı `/auth/me` çıktısı)

**rampa@cakesbakes.com** → rol: **Rampa / Depo Yoneticisi**
`appt.view, appt.create, appt.approve, appt.reject, appt.revise,
appt.complete, appt.cancel, calendar.view, report.view`
— İstenmeyen üst-düzey izinler YOK: `user.manage`, `dock.manage`,
`category.manage`, `audit.view`, `platform.*` → hiçbiri.
(Not: `calendar.override` bu rolde yok — rol modeline uygun, prompt "sadece
rol modeline uygunsa" demişti.)

**izleyici@cakesbakes.com** → rol: **Izleyici / Planlama**
`appt.view, calendar.view, report.view` (salt-okunur)
— `appt.create/approve/revise/reject`, `*.manage`, `audit.view`,
`platform.*` → hiçbiri.

## 4. Dock / Facility Scope

- Facility: Cakes & Bakes Üretim Tesisi (BTA tenant) — id `5d3467a4…`.
- **rampa@**: 3 aktif rampaya atanmış — **Rampa 1, Rampa 2, Rampa 3**
  (istenen "en az 1-2 rampa" fazlasıyla karşılanıyor; scope gerçekten
  uygulanıyor).
- **izleyici@**: rampa ataması yok (`assigned_dock_ids=None`) — read-only rol
  için doğru (rampa scope'una gerek yok).

## 5. Uygulanan Seed/Job

Ek job KOŞULMADI. Hesaplar deploy aşamasındaki `logislot-seed` job'ının
(idempotent `app.seed`) ürünü. `ensure_demo_role_accounts` benzeri ayrı bir
komuta gerek kalmadı; mevcut seed zaten idempotent ve bu hesapları doğru
üretiyor. (Seed idempotent olduğundan tekrar koşulsa duplicate üretmez.)

## 6. Login Doğrulaması (canlı dev API, NodePort 30081)

- `rampa@cakesbakes.com` / `Demo123!` → **LOGIN OK**, must_change=false.
- `izleyici@cakesbakes.com` / `Demo123!` → **LOGIN OK**, must_change=false.

## 7. RBAC Doğrulaması (canlı endpoint testleri)

**rampa@**:
| Endpoint | Sonuç | Beklenen |
|---|---|---|
| GET /facilities/{fid}/appointments | 200 | ✔ operasyon görünür |
| GET /facilities/{fid}/users | 403 | ✔ (user.manage yok) |
| GET /facilities/{fid}/audit-logs | 403 | ✔ (audit.view yok) |
| GET /platform/tenants | 403 | ✔ (platform izolasyonu) |

**izleyici@**:
| Endpoint | Sonuç | Beklenen |
|---|---|---|
| GET /facilities/{fid}/appointments | 200 | ✔ görüntüleme |
| GET /facilities/{fid}/reports/summary | 200 | ✔ (report.view) |
| POST .../appointments/{id}/approve | 403 | ✔ read-only (appt.approve yok) |
| GET /facilities/{fid}/users | 403 | ✔ |
| GET /platform/tenants | 403 | ✔ |

## 8. UI Smoke (canlı dev web, NodePort 30080 — Playwright 2/2 geçti)

- **rampa@**: giriş → dashboard; **Takvim** ve **Randevular** nav görünür;
  **Yönetim** (config) linki GÖRÜNMEZ.
- **izleyici@**: giriş → dashboard → Randevular; **"Yeni Randevu"** butonu
  (appt.create) GÖRÜNMEZ; **Yönetim** linki GÖRÜNMEZ (read-only).

## 9. Prod Etkisi

**Prod'a DOKUNULMADI.** `logislot-prod` namespace'i oluşturulmadı, seed
koşulmadı. Yalnızca `logislot-dev`'e (salt-okunur) erişildi. Hermes
namespace'leri (hermes/hermes-dev/hermes-test) ve diğer sistem namespace'leri
etkilenmedi. Hiçbir veri mutasyonu yapılmadı (izleyicinin denenen approve'u
403 ile reddedildi — kayıt değişmedi).

## 10. Bilinen Eksikler / Notlar

- `rampa@` seed'de 3 rampanın hepsine atanmış (2'yle sınırlamak istenirse
  seed'de `assigned_dock_ids` daraltılabilir; mevcut hâli isteği karşılıyor).
- `report.view` hem rampa hem izleyicide var → ikisi de Raporlar ekranını
  görür; izleyici için bu bilinçli read-only rapor erişimidir.
- Kabul kriterlerinin tamamı sağlandı: iki hesap login olabiliyor, doğru
  tenant/facility altında, rampa scoped, izleyici read-only, yetkisiz
  endpoint'ler 403, UI rollere uygun, prod/Hermes etkilenmedi.
