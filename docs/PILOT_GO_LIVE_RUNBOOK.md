# LogiSlot — Pilot Go-Live Runbook

> Amaç: Tek bir pilot tenant'ı (fabrika + tedarikçileri) sıfırdan canlıya almak.
> Tüm komutlar bu repo kökünden (`LogiSlot/`) çalıştırılır ve **gerçektir** —
> her biri bu runbook yazılırken koşulmuştur.

## 0) Ön Koşullar

| Gereksinim | Sürüm | Kontrol |
|---|---|---|
| Docker + Compose | 24+ | `docker compose version` |
| Node.js (yalnızca E2E/geliştirme) | 20+ | `node -v` |
| Python (yalnızca smoke script) | 3.11+ | `python3 -V` |

Portlar: **web 3010, API 8010, PostgreSQL 5433** (host tarafı; 8000/3000/5432
genelde dolu olduğu için bilinçli kaydırıldı).

## 1) Ortam Değişkenleri

`.env.example` → `.env` kopyalayın ve **pilotta mutlaka** şunları değiştirin:

```bash
cp .env.example .env
```

| Değişken | Varsayılan | Pilot için |
|---|---|---|
| `LOGISLOT_SECRET_KEY` | `dev-secret-change-me` | **DEĞİŞTİRİN** — `openssl rand -hex 32` |
| `LOGISLOT_DATABASE_URL` | compose içi PG | Yönetilen PG kullanılacaksa güncelleyin |
| `LOGISLOT_CORS_ORIGINS` | `["http://localhost:3010"]` | Gerçek portal domain(ler)i |
| `LOGISLOT_ENABLE_DOCS` | `true` | **`false`** (Swagger'ı kapatır) |
| `LOGISLOT_RATE_LIMIT_ENABLED` | `true` | `true` kalsın |
| `LOGISLOT_EMAIL_PROVIDER` | `log_only` | Gerçek e-posta için **`smtp`** (aşağıdaki SMTP bölümü) |
| `LOGISLOT_SMTP_HOST` + `LOGISLOT_SMTP_FROM_EMAIL` | boş | `smtp` seçildiyse **zorunlu** — boşsa gönderimler `failed` loglanır |
| `LOGISLOT_PUBLIC_WEB_URL` | `http://localhost:3010` | E-postalardaki portal linki; gerçek domain |
| `LOGISLOT_PASSWORD_MIN_LENGTH` | `10` | Kalıcı parola politikası (change-password'da uygulanır) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8010` | API'nin dışa açık adresi |

> Not: compose dosyası bu değerlerden bazılarını kendi içinde sabitler;
> pilot sunucusunda `docker-compose.yml` içindeki `LOGISLOT_SECRET_KEY` ve
> `LOGISLOT_CORS_ORIGINS` değerlerini de aynı şekilde güncelleyin.

## 2) Kurulum ve İlk Açılış

```bash
# 1. Stack'i ayağa kaldır (db -> api -> web)
docker compose up -d --build

# 2. Şema migrasyonları (alembic, konteyner içinde)
docker compose exec api alembic upgrade head

# 3. Demo/seed verisi (idempotent — ikinci koşuşta "Seed atlandi" der)
docker compose exec api python -m app.seed

# 4. Sağlık kontrolü
curl -s http://localhost:8010/health
# {"success":true,"data":{"status":"ok","service":"logislot-api"},...}
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010/login   # 200
```

## 2.1) Staging Profili

```bash
cp .env.staging.example .env.staging       # degerleri sunucuda doldurun (gercek secret repoya girmez)
docker compose -f docker-compose.yml -f docker-compose.staging.yml --env-file .env.staging up -d --build
docker compose -f docker-compose.yml -f docker-compose.staging.yml exec api alembic upgrade head
```

Staging farkları: `LOGISLOT_ENVIRONMENT=production` (demo parolalar
reddedilir), docs kapalı, restart policy + healthcheck'ler, SMTP/public URL
env'den. Doğrulama aynı: `demo_smoke.py` + `npx playwright test` +
`./scripts/backup_smoke.sh` (E2E_BASE_URL/E2E_API_URL ile hedefleyin).

## 3) Demo Hesaplar (seed)

Tüm parolalar: `Demo123!` — **pilotta ilk iş olarak değiştirin/yenilerini açın.**

| Portal | E-posta | Rol / Özellik |
|---|---|---|
| Platform | `admin@logislot.com` | Platform yöneticisi (vendor) |
| Yönetim | `admin@cakesbakes.com` | Sistem Yöneticisi (tüm izinler) |
| Yönetim | `rampa@cakesbakes.com` | Rampa Yöneticisi (R1-R2 scope) |
| Yönetim | `izleyici@cakesbakes.com` | İzleyici (salt okunur) |
| Tedarikçi | `tedarikci@anadoluun.com` | Otomatik onaylı |
| Tedarikçi | `tedarikci@marmarasoguk.com` | Manuel onay akışı |
| Tedarikci | `tedarikci@hizlikargo.com` | Kargo teslimatı, haftalık kota 2 |

## 3.1) SMTP Kurulumu (opsiyonel ama pilotta önerilir)

Varsayılan `log_only` provider e-posta GÖNDERMEZ; her şey `email_logs`
tablosuna yazılır ve panelden görülür. Gerçek gönderim için:

```bash
# .env (veya compose environment) icinde:
LOGISLOT_EMAIL_PROVIDER=smtp
LOGISLOT_SMTP_HOST=smtp.sirketiniz.com
LOGISLOT_SMTP_PORT=587
LOGISLOT_SMTP_USERNAME=noreply@sirketiniz.com
LOGISLOT_SMTP_PASSWORD=***
LOGISLOT_SMTP_FROM_EMAIL=noreply@sirketiniz.com
LOGISLOT_SMTP_USE_TLS=true
LOGISLOT_PUBLIC_WEB_URL=https://portal.sirketiniz.com
docker compose up -d api   # yeniden baslat
```

Davranış garantileri:
- SMTP hatası **randevu akışını asla bozmaz** — onay/revize yine tamamlanır,
  e-posta `email_logs`'a `failed` + hata mesajıyla yazılır.
- Eksik SMTP konfigürasyonunda API yine açılır; gönderimler `failed` olur
  (sorun email-logs ekranında görünür kalır).
- Doğrulama: bir randevuyu onaylayın → Yönetim → randevu drawer'ındaki
  e-posta loglarında `provider: smtp`, `status: sent` görün.

**Retry / yeniden gönderim:**
- Failed e-postalar **Yönetim → E-posta Logları** sayfasından tekil veya
  (user.manage ile) **toplu** yeniden gönderilir; randevu drawer'ında da
  tekil "Tekrar Gönder" vardır. En fazla 3 deneme; lifecycle TEKRAR
  ÇALIŞMAZ, yalnızca e-posta gider.
- **Sprint 11'den itibaren otomatik**: compose'daki `scheduler` servisi
  5 dakikada bir retry işler, 24 saatte bir bildirim temizliği yapar.
  İzleme: `docker compose logs -f scheduler`. Elle tetikleme hâlâ mümkün:

```bash
docker compose exec api python -m app.maintenance.process_email_retries --limit 50
```

## 3.2) Parola Politikası ve İlk Giriş Akışı

- **Geçici parolayla açılan her hesap** (yeni kullanıcı, ilk yönetici,
  parola reset'i) ilk girişte **parola değiştirmek zorundadır**: login olur,
  `/change-password` sayfasına yönlendirilir; diğer tüm API çağrıları
  403 `PASSWORD_CHANGE_REQUIRED` döner.
- Kalıcı parola politikası: en az 10 karakter, harf + rakam + özel karakter
  (`LOGISLOT_PASSWORD_MIN_LENGTH` / `LOGISLOT_PASSWORD_REQUIRE_SPECIAL`).
- `LOGISLOT_ENVIRONMENT=production` iken `Demo123!` gibi yaygın/demo
  parolalar kalıcı parola olarak REDDEDİLİR (demo ortamı etkilenmez).

## 3.3) Operasyon Akışları (Sprint 10)

- **Admin adına randevu**: Yönetim → Randevular → **Yeni Randevu** — telefonla
  arayan tedarikçi için admin randevu açar; tedarikçi kuralları (izinli
  kategori/kota/süre limitleri) aynen uygulanır, randevu **onaylı** doğar,
  tedarikçiye bildirim + e-posta gider. Tekrarlayan seri de açılabilir.
- **Seri toplu revize**: Yönetim → Seriler → **Seriyi Revize Et** — gelecekteki
  tüm randevular aynı saate kayar (all-or-nothing); randevular tedarikçi
  onayı için "Revize Bekliyor" olur.
- **Bildirim tercihleri**: sağ üstteki ayar simgesi (admin) / Profil sayfası
  (tedarikçi) — panel ve e-posta bildirimleri + event bazlı e-posta
  anahtarları. Revize panel bildirimi kritik olduğundan kapatılamaz.
- **Plan kullanım uyarıları**: Platform → Kullanım & Sağlık — plan
  `included_quota` eşikleri (%80/%100/%120) uyarı üretir; randevu oluşturmayı
  ASLA engellemez, fatura hesaplamaz. **Tenant admin** kendi uyarısını
  dashboard banner'ında görür (`report.view`).
- **Seri toplu onay** (Sprint 11): Yönetim → Seriler → **Seriyi Onayla** —
  gelecekteki revize bekleyen randevular topluca onaylanır; onay anında
  çakışmalar yeniden kontrol edilir (all-or-nothing).
- **Denetim izleri** (Sprint 11): Yönetim → Denetim İzleri (`audit.view`
  izni; mevcut kurulumlarda migration sistem rolüne otomatik ekler).
  Parola/token alanları maskelenir.
- **Rapor exportu** (Sprint 11): Raporlar sayfasında "Özet CSV" ve
  "Randevu Detay CSV" (plaka/sürücü PII'si bilinçli DAHİL DEĞİL);
  Platform → Kullanım'da "Usage CSV" (PII'siz).
- **Pilot destek paneli**: Platform → Destek — başarısız e-posta, retry
  kuyruğu, bekleyen/revize randevu, plan uyarısı sayaçları (agregat) ve
  **scheduler son koşum durumu** (kayıt yoksa "henüz koşmadı" gösterilir).
- **Platform denetim izleri** (Sprint 12): Platform → Denetim İzleri —
  yalnızca platform/system aktörlü kayıtlar (tenant/tesis/plan işlemleri);
  tenant operasyonel audit'i tesise özel ekranda kalır (PII izolasyonu).
- **Tedarikçi seri görünümü** (Sprint 12): tedarikçi Randevularım'da
  "Tekrarlayan Randevular" bölümünü görür; **kendi serisinin gelecekteki
  randevularını sebep girerek iptal edebilir** (tamamlanmışlara dokunulmaz;
  adminlere tek özet bildirim düşer).
- **Takvim kısayolu** (Sprint 12): takvimde boş bir saate tıklanınca
  "Yeni Randevu" drawer'ı tarih/saat/rampa ön-dolu açılır (drag-and-drop
  bilinçli ertelendi — yanlış revize riski).

## 4) Doğrulama — Smoke ve E2E

```bash
# 18 adımlık API smoke (login -> config -> randevu -> onay -> bildirim -> temizlik)
python3 scripts/demo_smoke.py
# beklenen: "✔ Tum adimlar basarili (18/18)."

# 6 kritik tarayıcı akışı (Playwright, headless; hata anında ekran görüntüsü alır)
npm install && npx playwright install chromium   # ilk kez
npx playwright test
# beklenen: "7 passed"
```

```bash
# Yedek smoke: pg_dump alinir, dosya + pg_restore --list okunabilirligi dogrulanir
./scripts/backup_smoke.sh          # KEEP_DUMP=1 ile dump dosyasi birakilir

# PILOT HAZIRLIK RAPORU: canli API'ye karsi PASS/WARN/FAIL listesi
python3 scripts/pilot_readiness.py
# hedef ortam: LOGISLOT_BASE_URL / LOGISLOT_WEB_URL / PLATFORM_EMAIL / PLATFORM_PASSWORD
```

Farklı ortama karşı koşmak için: `E2E_BASE_URL=https://portal.example.com E2E_API_URL=https://api.example.com npx playwright test`

CI: `.github/workflows/e2e.yml` compose stack'i kurup demo smoke + Playwright
koşar (manuel `workflow_dispatch` + PR tetiklemeli).

## 5) Pilot Tenant'ı Açma (gerçek akış)

UI ile (önerilen): `http://localhost:3010/login` → **Platform Yönetimi** →
`admin@logislot.com`:

1. **Tenant Dizini → Yeni Tenant** — görünen ad, slug (otomatik), durum `trial`.
2. **Tesis Dizini → Yeni Tesis** — tenant seç, ad/saat dilimi gir,
   **"Varsayılan konfigürasyonu kur"** işaretli bırak (3 araç kategorisi,
   "Genel" ürün kategorisi, Rampa 1, 3 sistem rolü kurulur) ve
   **"İlk tesis yöneticisini oluştur"** bölümünü doldur (ad + e-posta;
   geçici parola otomatik üretilir). Başarı ekranındaki geçici parolayı
   kopyalayın — **bir daha gösterilmez**. Yönetici ilk girişte parolasını
   değiştirmek zorundadır.
3. (Alternatif / fallback) İlk yöneticiyi komutla açmak isterseniz:

```bash
docker compose exec api python - <<'EOF'
import asyncio, uuid
from sqlalchemy import select
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import Facility, FacilityMembership, Role, TenantUser

FACILITY_NAME = "Pilot Tesis"          # 2. adımda verdiğiniz ad
ADMIN_EMAIL   = "yonetici@pilot.com"   # pilot yöneticisinin e-postası
ADMIN_NAME    = "Pilot Yönetici"
TEMP_PASSWORD = "PilotGecici1!"        # ilk girişte değiştirtin

async def main():
    async with SessionLocal() as db:
        facility = (await db.execute(select(Facility).where(Facility.name == FACILITY_NAME))).scalar_one()
        role = (await db.execute(select(Role).where(Role.facility_id == facility.id, Role.name == "Sistem Yoneticisi"))).scalar_one()
        user = TenantUser(tenant_id=facility.tenant_id, name=ADMIN_NAME, email=ADMIN_EMAIL,
                          password_hash=hash_password(TEMP_PASSWORD), default_facility_id=facility.id,
                          must_change_password=True)  # ilk giriste degistirme zorunlu
        db.add(user); await db.flush()
        db.add(FacilityMembership(tenant_user_id=user.id, tenant_id=facility.tenant_id,
                                  facility_id=facility.id, roles=[role]))
        await db.commit()
        print(f"OK: {ADMIN_EMAIL} / {TEMP_PASSWORD}")

asyncio.run(main())
EOF
```

4. Pilot yöneticisi girer → geçici parolayı değiştirir → **Ayarlar**'dan kategorileri/rampaları gerçek
   düzene getirir → **Tedarikçiler**'den tedarikçi + portal hesabı açar
   (geçici parola ekranda gösterilir).

## 6) Pilot Demo Senaryosu (15 dk)

1. Tedarikçi girişi → **Yeni Randevu** → 3 adımlı sihirbaz → slot seç → talep.
2. (Opsiyonel) Aynı sihirbazda **"Tekrarlayan randevu oluştur"** → haftalık × 4
   → tarih önizlemesi → tek talep, 4 randevu (biri uymazsa hiçbiri açılmaz).
3. Yönetim girişi → zilde bildirim → **Randevular → Bekliyor** → Onayla/Revize.
4. **Takvim** gün/hafta görünümünde randevuyu ve kargo tavsiye bloklarını göster.
5. **Raporlar**: özet, SLA, kategori kırılımı.
6. Platform girişi → **Kullanım & Sağlık**: PII içermeyen agregat metrikler.

## 7) Go-Live Kontrol Listesi

- [ ] `LOGISLOT_SECRET_KEY` değişti (dev anahtarı değil)
- [ ] `LOGISLOT_ENVIRONMENT=production` (yaygın/demo parolaları engeller)
- [ ] `LOGISLOT_ENABLE_DOCS=false`
- [ ] CORS listesi yalnızca gerçek domain(ler)
- [ ] E-posta: `smtp` mi `log_only` mı karar verildi; smtp ise test e-postası `sent`
- [ ] Demo hesap parolaları değişti veya hesaplar pasifleştirildi
- [ ] İlk yöneticiler ilk girişlerini yaptı (must_change_password kalmadı)
- [ ] `alembic upgrade head` çalıştı, `alembic current` = head
- [ ] `python3 scripts/demo_smoke.py` 18/18
- [ ] `npx playwright test` 7/7 (CI'da e2e + ci workflow'ları yeşil)
- [ ] Failed e-posta "Tekrar Gönder" ile test edildi (SMTP kullanılıyorsa)
- [ ] Bildirim tercihleri varsayılanları gözden geçirildi
- [ ] Plan kullanım uyarıları kontrol edildi (Platform → Kullanım + tenant banner)
- [ ] **`python3 scripts/pilot_readiness.py` → 0 FAIL; WARN'lar gözden geçirildi**
- [ ] **Scheduler ayakta ve son koşum başarılı** (Platform → Destek → Scheduler)
- [ ] **Gerçek restore smoke geçti** (`./scripts/backup_restore_smoke.sh`)
- [ ] Denetim izleri ekranı erişilebilir (audit.view)
- [ ] E-posta Logları ekranında failed=0 veya gözden geçirildi
- [ ] Rapor CSV exportu denendi
- [ ] Platform → Destek paneli kontrol edildi
- [ ] Platform → Denetim İzleri erişilebilir (platform.audit.view)
- [ ] Tedarikçi seri görünümü/iptali bir pilot tedarikçisiyle denendi
- [ ] Host yedek cron'u kuruldu (yukarıdaki örnek) + haftalık restore smoke
- [ ] `./scripts/backup_smoke.sh` başarılı + ilk yedek alındı (aşağıda §8)
- [ ] Bildirim temizliği zamanlandı (cron):
      `docker compose exec api python -m app.maintenance.cleanup_notifications --days 90`
      (okunmamışları asla silmez; önce `--dry-run` ile deneyin)

## 8) Yedekleme ve Geri Yükleme

```bash
# Yedek (compose içindeki PG'den, host'a sıkıştırılmış dump)
docker compose exec -T db pg_dump -U logislot -d logislot -Fc > backup_$(date +%Y%m%d_%H%M).dump

# Geri yükleme (DİKKAT: mevcut şemayı düşürür)
docker compose exec -T db pg_restore -U logislot -d logislot --clean --if-exists < backup_YYYYMMDD_HHMM.dump
```

**Karar (Sprint 12)**: otomatik yedek scheduler'a EKLENMEDİ — güvenli saklama
volume'u/hedefi ortama bağlı olduğundan konteyner içinden dump almak yanlış
güven verir. Bunun yerine host cron'u kullanın (gerçekten koşan yedek):

```cron
# Host crontab -e (ornek): her gece 02:00 yedek + 14 gun saklama
0 2 * * * cd /opt/logislot && docker compose exec -T db pg_dump -U logislot -d logislot -Fc > /var/backups/logislot/backup_$(date +\%Y\%m\%d).dump && find /var/backups/logislot -name "backup_*.dump" -mtime +14 -delete
# Haftada bir gercek restore provasi:
0 3 * * 1 cd /opt/logislot && ./scripts/backup_restore_smoke.sh
```
`./scripts/backup_smoke.sh` dump'ın alınabildiğini ve `pg_restore --list` ile
okunabildiğini doğrular. **Gerçek restore provası** için (Sprint 11):

```bash
./scripts/backup_restore_smoke.sh
# dump'i GECICI logislot_restore_smoke veritabanina restore eder,
# tablo/tenant/tesis/alembic dogrulamasi yapar ve test DB'yi siler.
# ANA VERITABANINA ASLA restore/drop YAPMAZ.
```

## 9) Rollback

```bash
# Uygulama rollback'i: önceki imaj/commit'e dön
git checkout <onceki-tag-veya-commit>
docker compose up -d --build api web

# Şema rollback'i — DİKKAT: alembic downgrade veri KAYBETTİREBİLİR
# (ör. appointment_series tablosu düşer, seri bağları silinir).
# Önce MUTLAKA yedek alın; mümkünse downgrade yerine yedekten dönün.
docker compose exec api alembic downgrade -1
```

Kural: **veri içeren tabloları düşüren migration'larda rollback = yedekten
geri yükleme**; `downgrade` yalnızca boş/yeni tablolarda güvenlidir.

## 10) MVP Sınırları (pilotta bilinçli eksikler)

- **E-posta**: `smtp` provider hazır (düz metin şablonlar); HTML şablon ve
  kuyruk/retry yok — hata anında `failed` loglanır, otomatik yeniden denenmez.
- **Tekrarlayan seri**: toplu **iptal** var (future_only); seri-bazlı toplu
  revize yok. Admin on-behalf create'te tekrarlama desteklenmez (açık 422).
- **Kargo + tekrarlayan** birleşimi desteklenmez (422 döner).
- **Dosya/logo yükleme**: yalnızca URL ile logo.
- **Parola**: politika var (min 10 + harf/rakam/özel); SSO/2FA yok.
- **Rate limit** bellek içi — tek API instance varsayımı; yatay ölçeklemede
  Redis'e taşınmalı.
- Takvim sürükle-bırak yok; revize drawer üzerinden yapılır.

## 11) Sorun Giderme

| Belirti | Muhtemel neden / çözüm |
|---|---|
| Web 3010 açılmıyor | `docker compose logs web` — build arg `NEXT_PUBLIC_API_URL` yanlışsa yeniden build |
| API 401 döngüsü yok ama sık düşme | Erişim token'ı 30 dk; portal tek-uçuş refresh yapar. Saat kayması varsa sunucu NTP kontrol edin |
| `DOCK_TIME_CONFLICT` beklenmedik | Çakışma grubu yapılandırmasını (Ayarlar → Çakışma Grupları) kontrol edin |
| Seed tekrar koşmuyor | Bu normaldir (idempotent): "Seed atlandi" mesajı verir |
| PG bağlantı hatası | `docker compose ps` → db healthy mi; 5433 host portu çakışıyor olabilir |
