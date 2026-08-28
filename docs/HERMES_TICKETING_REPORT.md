# Hermes Ticket Hub Entegrasyonu — LogiSlot (consumer) Raporu

Tarih: 2026-08-25 · Branch: `dev` · Sözleşme: `hermes-logislot-ticketing-cto-pack-v1.0`

## 1. Ne yapıldı

LogiSlot artık Hermes/Duosis'in **canonical Ticket Hub**'ına bağlı bir **consumer**dır:

- Müşteri (yönetim + tedarikçi) destek talebi açar, yanıtlar, yeniden açar, kapatır.
- Platform Yöneticisi her müşteri hesabı için **tek** hedef Hermes ekibini seçer.
- Merkezî durum Hermes'ten **imzalı webhook** + **periyodik mutabakat** ile gelir.
- Giden komutlar **transactional outbox** ile taşınır; ağ kesintisi veri kaybettirmez.

LogiSlot **canonical destek sistemi değildir**: status/resolution alanları yalnızca
doğrulanmış Hermes olayından ya da snapshot'tan yazılır.

## 2. Mimari sınırlar (uygulandı)

| Sınır | Nasıl sağlandı |
|---|---|
| Hermes DB'ye erişim yok | Yalnızca `app/integrations/hermes_support_client.py` (HTTP + JSON). Hermes modeli/FK'si import edilmez. |
| Servis kimliği tarayıcıya çıkmaz | Token yalnızca backend'de; katalog/validate/upload hep backend üzerinden. `tests/test_ticketing_attachments.py` bunu doğrular. |
| İç notlar müşteriye çıkmaz | Üç katman: Hermes public event sözleşmesi, `assert_customer_safe()` reddi, `visibility = 'public'` CHECK kısıtı. |
| Müşteri grup seçmez | `GET /tickets/config` grup **kimliği** döndürmez; create gövdesi `extra="forbid"` ile grup alanını reddeder. |
| Platform ticket içeriği görmez | `/platform/ticket-routing` yalnızca durum + sayaç döner. |
| Attachment DB'de değil | Yalnızca metadata; imzalı URL **saklanmaz**, 307 ile anlık yönlendirilir. |
| Yıkıcı migration yok | Tüm migration'lar additive; `DROP/TRUNCATE/broad DELETE` yok. |

## 3. Değişen/eklenen dosyalar

### Backend — yeni
```
app/integrations/{__init__,hermes_contract,hermes_support_client,hermes_support_signing}.py
app/models/{ticketing_control,ticketing}.py
app/schemas/ticketing.py
app/services/{ticket_service,ticket_projection_service,ticket_routing_service}.py
app/routers/{tickets,platform_ticketing,hermes_support_webhook}.py
app/maintenance/{ticket_delivery,ticket_reconciliation,ticket_inbox}.py
app/models/ticketing_ddl.py            (iki alembic zincirinin PAYLASTIGI DDL)
alembic/versions/b7e2d94c1f30_ticketing_control_plane.py
alembic_tenant/versions/0003_support_ticket_tables.py
alembic_tenant/versions/0004_ticket_role_permissions.py
tests/contracts/hermes_support_v1/**  (18 fixture + MANIFEST.json + README)
tests/{hermes_stub,test_ticketing_contract,test_ticketing_api,test_ticketing_webhook,
       test_ticketing_delivery,test_ticketing_attachments,test_ticketing_platform,
       test_ticketing_migrations,test_ticketing_scheduler}.py
```

### Backend — değişen
`app/core/{config,enums,metrics,permissions}.py`, `app/main.py`,
`app/maintenance/scheduler.py`, `app/models/__init__.py`, `app/routers/users.py`,
`app/seed.py`, `app/services/onboarding.py`, `app/tenancy/deps.py`, `pyproject.toml`
(`httpx` artık **çalışma zamanı** bağımlılığı).

### Web — yeni
```
src/lib/api/{tickets,platform-ticketing}.ts
src/components/tickets/{ticket-status-badge,diagnostics,attachment-dropzone,
                        ticket-create-drawer,ticket-detail,tickets-page}.tsx
src/app/(admin)/admin/tickets/page.tsx
src/app/(supplier)/supplier/tickets/page.tsx
src/app/(platform)/platform/ticket-routing/page.tsx
```
Değişen: 3 portal layout'u (nav), `settings/users` (izin kataloğu),
`platform/support` (entegrasyon kartları + "Sistem Sağlığı" adı),
`lib/api/{client,types}.ts`, `packages/shared/src/index.ts`.

### Mobile
`src/api/{tickets,platform-ticketing}.ts`, `src/components/tickets.tsx`,
`app/{admin,supplier}/tickets.tsx`, `app/platform/ticket-routing.tsx`,
3 layout + 2 menü + tedarikçi profili.

### Ops
`.env.example`, `docker-compose.yml`, `k8s/base/{configmap,secret.example}.yaml`,
`k8s/overlays/dev/configmap-patch.yaml`, `e2e/18-tickets.spec.ts`.

## 4. Veri modeli

**Control-plane** (`public`): `ticket_routing_configs` (tenant başına tek aktif grup,
`route_version` optimistic kilit), `hermes_group_catalog_cache` (otorite **değil**),
`ticket_webhook_inbox` (`event_id` UNIQUE → replay idempotent).

**Tenant-plane** (her tenant kendi şemasında): `support_ticket_projections`
(`id` = `source_ticket_id`, retry'da değişmez), `support_ticket_message_projections`
(yalnız public; CHECK kısıtı), `support_ticket_attachment_projections`,
`support_ticket_outbox` (`command_id` = Idempotency-Key).

### Migration kimlikleri
- Control: `a1c9d4e07b31` → **`b7e2d94c1f30`** (tek head)
- Tenant: `0002_supplier_cargo_enabled` → `0003_support_ticket_tables` →
  **`0004_ticket_role_permissions`** (tek head)

Rol izni eşitlemesi **iki zincirde birden** yapılır: taşınmış tenant'lar için tenant
zinciri, henüz taşınmamış (ortak `public` yerleşimindeki) kayıtlar için control zinciri.
Biri diğerinin kapsamını görmez; ikisi de gereklidir.

## 5. Güvenilirlik

| Senaryo | Davranış |
|---|---|
| Hermes erişilemez | Talep yerelde commit; outbox 10s→30s→2dk→10dk→30dk→2sa (jitterli) yeniden dener |
| Yanıt kayboldu | **Aynı** Idempotency-Key ile tekrar → Hermes aynı ticket'ı döner, duplicate yok |
| `route_stale` | Retry fırtınası yok: komut beklemeye alınır, route tazelenince **yeni** key + **aynı** `source_ticket_id` ile gönderilir |
| `idempotency_conflict` | Doğrudan dead-letter; yeni ticket üretilmez |
| Webhook kayboldu | `ticket_reconciliation` (15 dk) snapshot çeker |
| Sırasız olay | `aggregate_version > current+1` → uygulanmaz, `sync_gap` işaretlenir, snapshot onarır |
| Olay tekrarı | `event_id` UNIQUE + `uuid5(event_id, alıcı)` bildirim kimliği → tek bildirim |
| Projeksiyon commit sonrası çökme | Olay tekrar işlenir, version kontrolüyle no-op |

## 6. İzinler

- Tenant: `ticket.view` / `ticket.create` / `ticket.comment` / `ticket.view_all`
  (create/comment/view_all → view bağımlılığı backend'de zorlanır)
- Supplier: `supplier_portal.ticket.{view_own,create,comment_own}` — `view_all` **yok**
- Platform: `platform.ticket_routing.{view,manage}`,
  `platform.ticket_integration_health.view` (manage → view)

Sistem Yöneticisi tamamını, Rampa/Depo Yöneticisi `view_all` hariç hepsini alır.
İzleyici rolü ticket izni **almaz** (bilinçli).

## 7. Konfigürasyon / secret

ConfigMap: `LOGISLOT_HERMES_SUPPORT_BASE_URL`, `…_APPLICATION_CODE`,
`…_WEBHOOK_KEY_ID`, `…_TIMEOUT_SECONDS`, `…_CATALOG_TTL_SECONDS`,
`LOGISLOT_TICKETING_ENABLED`, `LOGISLOT_TICKET_*_INTERVAL_SECONDS`.

Secret (repoya **konmaz**): `LOGISLOT_HERMES_SUPPORT_TOKEN`,
`LOGISLOT_HERMES_SUPPORT_WEBHOOK_SECRET`, `…_WEBHOOK_SECRET_PREVIOUS`.

Webhook sırrı boşsa uç nokta **fail-closed** çalışır (her isteği 401 ile reddeder).

## 8. Sözleşme pariteti

`apps/api/tests/contracts/hermes_support_v1/` iki repoda **birebir aynıdır**.
`MANIFEST.json` her fixture'ın SHA-256 özetini tutar; `test_ticketing_contract.py`
diski manifest ile karşılaştırır. Tek taraflı bir alan değişikliği her iki tarafta
testi kırar. Hermes bu dizini kendi test ağacına kopyalar.

## 9. Kod incelemesi sonrası düzeltilenler

Uygulama bittikten sonra `/code-review high` koşuldu; bulguların tamamı giderildi:

| Bulgu | Düzeltme |
|---|---|
| Control migration tenant tablolarını `public`'e kurmuyordu → taşınmamış tenant'ta her ticket ucu 500 | DDL `app/models/ticketing_ddl.py`'ye çıkarıldı; **iki zincir de** aynı fonksiyonu çağırır (test: `test_both_chains_use_the_same_ticket_ddl`) |
| `HermesApiError` `ApiError` değildi → Hermes yapılandırılmamışken ham 500 | `register_hermes_error_handler` ile standart zarf (503 geçici / 502 kalıcı) |
| Mesaj benimseme, eşleşmeyen metinle **orijinal açıklamayı eziyordu** | Yalnızca `is_pending` satırlar benimsenir; ilk açıklama korunur |
| `requeue_orphan_creates` dead-letter'a düşmüş create'i diriltiyordu | Create komutu **varsa** (durumu ne olursa olsun) yeniden üretilmez |
| Advisory kilit ilk commit'te düşüyor → çift dispatcher | Outbox `FOR UPDATE SKIP LOCKED` ile atomik sahiplenilir |
| Snapshot hataları `last_sync_at` ilerletmiyordu → açlık | Başarısızlıkta da ilerletilir (round-robin) |
| `sync_gap` + remote kimliği yok → sonsuza kadar onarılmaz | Bosluklu ticket `by-source` ile onarılır |
| `add_public_reply` ek dosya sahiplik/bağlılık kontrolü yoktu | Create ile ortak `_claim_attachments` |
| Toplam ek boyutu yalnızca ilan ediliyordu | Sunucuda zorlanır (`TICKET_ATTACHMENT_TOTAL_LIMIT`) |
| Create sonrası drawer unmount → başarı paneli hiç çizilmiyor | `createdId` ile drawer kapanınca detaya geçilir |
| `confirmClose` / `reopen` / route `test` / indirme hatasız yutuluyordu | Web + mobile'da try/catch + görünür hata |
| Route drawer aynı tenant'ta yeniden senkronlanmıyordu | Tenant başına `key` ile remount |
| Platform route listesi istemcide filtreleniyordu (sayfalı uç) | Arama/durum sunucuya taşındı + "ilk N gösteriliyor" uyarısı |
| Ek dosya indirme 401 yenilemesini atlıyordu | `authorizedFetch` (tek-uçuş refresh) |
| `.log` dosyaları hiç eklenemiyordu (boş MIME) | `resolveMimeType` uzantı geri düşüşü + `accept` listesi |
| Dropzone anahtarı çakışabiliyordu | Süreç ömürlü sayaç |
| Arama her tuşta istek atıp listeyi karartıyordu | 300 ms debounce + `keepPreviousData` |
| `tenant_slug` detay yanıtında yoktu | Backend'e eklendi |

### Dev deploy'da yakalanan ek regresyon

İlk push'ta dev migration job'ı `ModuleNotFoundError: No module named 'alembic_shared'`
ile düştü. Sebep: paylaşılan DDL üst seviyede yeni bir paket olarak açılmıştı, ama
imaj yalnızca `app`, `alembic`, `alembic_tenant`, `scripts` dizinlerini kopyalar ve
`pyproject.toml` yalnızca `app*` paketlerini kurar. Yerelde (cwd `apps/api`) çalışıyor,
imajda çalışmıyordu.

Düzeltme: modül `app/models/ticketing_ddl.py`'ye taşındı — modelin **yanına**, ki
birebir aynı kalması gereken iki dosya yan yana dursun. Ayrıca
`test_migrations_only_import_modules_that_ship_in_the_image` eklendi: Dockerfile'ın
`COPY` satırlarını okuyup migration'ların import ettiği birinci-taraf modüllerin
imaja girdiğini doğrular (negatif senaryoyla test edildi — gerçekten kırmızı veriyor).

İkinci deploy denemesi de düştü:
`IdentifierError: Identifier 'fk_support_ticket_message_projections_ticket_id_support_ticket_projections' exceeds maximum length of 63 characters`.

Adlandırma sözleşmesinin (`fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s`)
bu tablo adları için ürettiği ad Postgres'in 63 karakter sınırını aşıyor. SQLAlchemy
**modelde** adı sessizce kısaltıp sonuna hash ekliyor (`..._support_4aab`), elle yazılan
**migration** ise aynı adı üretemiyor ve hata veriyor. SQLite identifier uzunluğu
sınırlamadığı için testler bunu göremiyordu.

Düzeltme: dört uzun FK'ye **hem modelde hem DDL'de birebir aynı kısa ad** verildi
(`fk_support_ticket_messages_ticket_id` vb.). Guard'lar:
`test_model_and_migration_produce_identical_constraint_names` (model ile migration
adları birebir eşleşmeli, sessiz kısaltma yasak) ve
`test_every_table_compiles_against_postgres`. İkisi de negatif senaryoyla sınandı.

## 9b. Hermes uygulamasının sözleşmeden saptığı yerler

Üçü de canlı olarak doğrulandı. Fixture'lar **tek taraflı değiştirilmedi**;
LogiSlot sözleşmeye uyar ve gereken yerde geçici uyum katmanı taşır.

| Uç | Sözleşme | Hermes | LogiSlot'ta ne var |
|---|---|---|---|
| `POST /support/routes/validate` | `{application_code, contract_version, group_id, source_tenant_id}` (`route_validate_request.json`) | `{source_tenant:{id}, group_id}`; diğer alanlar 422 "Extra inputs are not permitted" | Önce kanonik gövde; yalnızca `validation_error` gelirse bir kez uyum gövdesi |
| `POST /support/attachments/sessions` → `upload_url` | "short-lived-presigned-url", `required_headers` ile tarayıcı **doğrudan** yükler (bölüm 5) | Normal entegrasyon ucu: `Authorization: Bearer <servis token>` ister, preflight'ta `Access-Control-Allow-Origin` **yok** | Baytlar LogiSlot üzerinden geçer (`PUT /tickets/attachments/{id}/content`); hiçbir yere yazılmaz |
| `route.route_version` (create) | — (kimin sayacı olduğu yazılı değil) | Hermes kendi sürümünü tutar; başka bir sayı → `route_stale` | Hermes'in sürümü ayrı kolonda (`hermes_route_version`), doğrulama yanıtından alınır ve `route_stale`'de otomatik tazelenir |
| `aggregate_version` (olaylar) | monoton artar (fixture: status 2, mesaj 3) | `status_changed` ve `public_message_added` **aynı** sürümü aldı (2) | Eklemeli olaylar (mesaj/ek) sürüm kapısına tabi değil; kendi kimlikleriyle idempotent |
| `GET /support/tickets/by-source/{id}` | yalnızca path (bölüm 7) | `?source_tenant_id=` zorunlu; yoksa 422 | İstemci tenant kapsamını gönderir |
| Hata kodları | bölüm 240'taki liste | `validation_error`, `support_not_configured` listede yok | İkisi de tanınır ve kullanıcıya anlaşılır metin üretir |

Hermes gerçek bir presigned URL döndürmeye başlarsa proxy gereksizleşir:
`create_attachment_session` içinde `upload_url` satırı Hermes'in verdiğine
döner, istemci akışı aynı kalır.

**Not:** MinIO kümenin içinde (`minio.hermes-test.svc.cluster.local:9000`) ve
dışarıdan erişilebilir değil; presigned bir S3 URL'i de bugün tarayıcıdan
çalışmazdı. Karşı tarafın ya MinIO'yu CORS ile yayına alması ya da `/content`
ucunu upload'a özel kısa ömürlü bir token kabul edecek hale getirmesi gerekir.

## 10. Bilinen sınırlar

1. ~~Hermes dev endpoint'i yok~~ **ÇÖZÜLDÜ (28 Ağu 2026).** Her iki ortam da canlı
   Hermes'e bağlı ve doğrulandı:

   | | dev | prod |
   |---|---|---|
   | Hermes kurulumu | `hermes-dev` | `hermes-test` |
   | Base URL | `http://core-service.hermes-dev.svc.cluster.local/api/integrations/v1` (küme içi) | `https://hermes.duosis.com/api/integrations/v1` |
   | Client ID | `ba6d802a-…` | `8efe5764-…` |

   Doğrulananlar: (a) S2S `GET /support/routing-groups` → 200, gerçek gruplar
   (prod'da "Logislot Support Team" dahil); (b) Hermes'in kendi webhook secret'ı
   ile imzalanmış olay → 200, bozuk imza → 401. Token ve webhook secret cluster
   secret'ında, repoda DEĞİL; base URL ve client_id gizli değil ve overlay'de
   durmak ZORUNDA (aşağı bkz.).

   **Kalan tek adım karşı tarafta:** Hermes'in LogiSlot'un callback adresini
   (`https://api.logislot.io/integrations/hermes-support/v1/events`) kayıtlı
   tutması. LogiSlot ucu hazır ve fail-closed; gerçek uçtan uca akış bir tenant
   + kayıtlı route gerektirir.

   **TUZAK — deploy config'i ezer:** `deploy.yml` `kubectl apply -k` çalıştırır,
   bu configmap'i de uygular. Base URL/client_id cluster'a elle girilmişti ve
   overlay'de boş duruyordu; bir deploy dev'in base URL'ini silmiş, entegrasyon
   sessizce kapanmıştı (Platform ekranı "Hermes yapılandırılmadı" gösterir, hata
   vermez — bu yüzden fark edilmedi). Değerler artık overlay'de.
2. **Mobile ek dosya yükleme yok** — bilinçli erteleme, parite matrisine işlendi.
3. **E2E paketi bu makinede koşturulamadı** (Docker çalışmıyor); `e2e.yml` yalnızca
   PR/manuel tetikte koşar, `dev`'e push'ta koşmaz.
4. **Attachment malware taraması Hermes'in sorumluluğu.** LogiSlot yalnızca
   `scan_status` görüntüler ve `clean` olmayan dosyanın indirilmesini engeller.
