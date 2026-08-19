# Tenant veri izolasyonu — mimari ve geçiş runbook'u

## Ne değişti

Önceden tüm müşterilerin operasyonel verisi **tek veritabanında, tek şemada,
aynı tablolarda** duruyordu; ayrım yalnızca uygulama kodundaki `WHERE tenant_id`
koşullarına bağlıydı. Unutulan tek bir filtre = tenant sızıntısı.

Artık her tenant **kendi Postgres şemasına** sahiptir. Bir isteğin oturumu
tenant'ının şemasına bağlanır; başka bir tenant'ın satırı **fiziksel olarak
erişilemez** (başka bir şemadaki başka bir tablodadır), filtre unutulsa bile.

### İki düzlem

| Düzlem | Nerede | Tablolar |
|---|---|---|
| Control-plane | `public` (ortak) | `tenants`, `plans`, `platform_users`, `platform_roles`, `platform_user_roles`, `tenant_datastores`, `principal_directory` |
| Tenant-plane | `t_<tenant-uuid-hex>` (her tenant ayrı) | `facilities`, `docks`, `appointments`, `suppliers`, `tenant_users`, `roles`, `audit_logs`, … (24 tablo) |

Düzlem, modelin `schema` işaretinden **türetilir** (`app/models/__init__.py`
içindeki `control_plane_tables()` / `tenant_plane_tables()`); elle tutulan bir
liste yoktur, yeni model eklendiğinde listeler kendiliğinden doğru kalır.

### Neden ayrı şema, ayrı veritabanı değil

Tenant tabloları `public.tenants` / `public.plans`'a **gerçek foreign key** ile
bağlı kalır (doğrulandı: FK ihlali `IntegrityError` ile reddediliyor, tenant
silinince veri `CASCADE` ile gidiyor). Tenant başına ayrı veritabanı bu
bütünlüğü koparır ve `tenants`/`plans` satırlarının her veritabanına
kopyalanıp senkronlanmasını gerektirirdi — kalıcı bir drift kaynağı. Ayrıca
şema modunda tüm tenant'lar **tek bağlantı havuzunu** paylaşır; 300 tenant ×
havuz = binlerce Postgres bağlantısı sorunu oluşmaz.

**Ayrı veritabanı gerekirse** kapı açık: `tenant_datastores.dsn_alias` dolu
olan tenant kendi veritabanına yönlenir (DSN'ler ayarlarda/secret'ta,
veritabanında **değil**). Kod yolu aynıdır.

## Kritik değişmez (bunu bozmayın)

`schema_translate_map` sözlüğünün **anahtar kümesi** ardışık çağrılarda aynı
kalmalıdır. SQLAlchemy derlenmiş sorgu önbelleğini anahtar kümesine göre tutar;
bir çağrıda `{"control": ...}`, diğerinde `{None: ..., "control": ...}`
kullanmak `InvalidRequestError` fırlatır ve **API tamamen durur**. Bu yüzden
haritayı elle kurmayın — daima `app/core/tenancy_runtime.translate_map()`
kullanın. `tests/test_tenancy.py` bu sözleşmeyi korur.

## Veritabanı seviyesinde yetkilendirme (ikinci savunma hattı)

Şema yönlendirmesi uygulama katmanındadır; bir yönlendirme hatası hâlâ yanlış
veriyi getirebilirdi. Bu yüzden **Postgres'in kendisi de zorluyor**: her tenant
isteği, o transaction boyunca yalnızca kendi şemasına yetkili bir role geçer.

| Kim | Ne görebilir |
|---|---|
| Platform (LogiSlot) admini | Her şey — control-plane rolüyle çalışır, tenant'ları tek tek gezerek okur |
| Tenant kullanıcısı | Yalnızca kendi şeması + `public.plans` (plan adı için) |
| Tenant kullanıcısı → başka tenant şeması | `ERROR: permission denied for schema …` |
| Tenant kullanıcısı → `public.tenants` | `ERROR: permission denied` (diğer müşterilerin kaydını göremez) |

Mekanizma:
- `tr_<tenant-uuid-hex>` rolü: yalnızca kendi şemasına `USAGE` + DML, artı
  `ALTER DEFAULT PRIVILEGES` ile **sonradan eklenecek tablolar**.
- Uygulama rolü `logislot_app` **NOINHERIT**'tir: tenant rollerine üyedir ama
  yetkiyi ancak açıkça `SET ROLE` yapınca kazanır. Rol değişimi atlanırsa istek
  sessizce geniş yetkiyle değil, **hatayla** sonuçlanır (fail-closed).
- `SET LOCAL ROLE` her transaction başında uygulanır ve COMMIT'te kendiliğinden
  düşer — bağlantı havuzu güvenli (doğrulandı).

> **Superuser her şeyi bypass eder.** Uygulama superuser (`logislot`) ile
> bağlandığı sürece bu GRANT'lar ETKİSİZDİR. Ayrı veritabanı kullanmak da bu
> sorunu çözmez — güvenlik sınırı kap (şema/DB) değil, bağlanılan roldür.
> Bu yüzden son adım `LOGISLOT_DATABASE_URL`'i `logislot_app`'e çevirmektir.

```bash
# Rolleri kur (uygulama rolü + mevcut tenant rolleri)
python scripts/bootstrap_db_roles.py --print-dsn   # planı gör
python scripts/bootstrap_db_roles.py --apply
# ...sonra LOGISLOT_DATABASE_URL'i logislot_app kullanıcısına çevirip API'yi yeniden başlat.
# DDL (migration/provisioning) için ayrı yetkili bağlantı: LOGISLOT_ADMIN_DATABASE_URL
```

## Geçiş durumu ve geri dönüş

`tenant_datastores`'ta `ready` kaydı **olmayan** tenant, eski ortak yerleşimde
(`public`) çalışmaya devam eder. Yani bu değişiklik, taşınmamış tenant'lar için
**davranışsal olarak no-op**'tur. Taşıma tenant tenant yapılır.

Backfill kaynak satırları **silmez** — doğrulama bitene kadar eski veri
yerinde durur.

> **Kesme anı tek yönlüdür:** `--activate` sonrası yazmalar yeni şemaya gider.
> O andan sonra geri dönmek, yeni şemadaki değişikliklerin geri taşınmasını
> gerektirir. Aktivasyonu düşük trafikli bir pencerede yapın.

## Runbook

```bash
# 0) Ne yapılacağını gör (hiçbir şey değiştirmez)
python -m app.tenancy.backfill plan

# 1) Kopyala ama YÖNLENDİRME (istekler eski yerleşimde kalır)
python -m app.tenancy.backfill run --slug bta

# 2) Sayımları gözden geçir, sonra kesme anı
python -m app.tenancy.backfill run --slug bta --activate

# 3) Tüm tenant'lar taşındıktan sonra geri düşüşü KAPAT
#    (provisioning'i atlanmış tenant sessizce ortak tablolara yazamasın)
LOGISLOT_TENANT_DATASTORE_REQUIRED=true

# Şema migration'ları (deploy akışında otomatik)
alembic upgrade head                          # control-plane
python -m app.tenancy.migrations upgrade      # her tenant şeması
python -m app.tenancy.migrations status

# Gerçek Postgres'te uçtan uca izolasyon doğrulaması (tek kullanımlık DB)
python scripts/verify_tenant_isolation.py
```

`verify_tenant_isolation.py`'yi **canlı API pod'unun içinde çalıştırmayın** —
pod 512Mi limitindedir ve exec süreci OOM ile öldürülür. Aynı imajla ayrı bir
pod açın.

## Şema değişikliği nasıl yapılır

- Control-plane tablosu değişiyorsa → `alembic/` zincirine revizyon ekleyin.
- Tenant-plane tablosu değişiyorsa → `alembic_tenant/` zincirine ekleyin;
  deploy sırasında her tenant şemasında çalışır.
- Tablo **hem** eski ortak yerleşimde (henüz taşınmamış tenant'lar `public`'te)
  **hem de** taşınmış tenant şemalarında yaşıyorsa revizyon **iki zincire de**
  gerekir: `alembic/` `public` kopyasını, `alembic_tenant/` her tenant şemasını
  günceller.

**Tuzak (2026-08'de bir kez ısırdı):** Alembic'in `op.add_column("x", ...)`
işlemi `ALTER TABLE` ifadesini **şemasız** render eder ve `schema_translate_map`
bunu **çevirmez** — harita yalnızca `Table`/`MetaData`'dan üretilen SQL'e
uygulanır. Bu yüzden `alembic_tenant/env.py`, migration transaction'ı boyunca
`SET LOCAL search_path TO "<tenant şeması>"` uygular (listede `public` bilerek
yoktur: nitelenmemiş bir DDL ortak şemayı sessizce değiştirmektense hata
vermelidir). Tenant revizyonlarında tablo adlarını **şemasız** yazın; o satırı
env.py'den kaldırmayın.

Yeni tenant şemaları migration'lar baştan oynatılarak değil, o anki model
durumundan `create_all` ile yaratılır ve tenant zincirinin head'ine damgalanır.

## Login yönlendirmesi

`tenant_users` artık tenant şemasında olduğundan "bu e-posta hangi tenant'a
ait" sorusu `public.principal_directory` ile yanıtlanır. Bu dizin, tablolar
bölündükten sonra da **global e-posta benzersizliğini** korur (eskiden
`tenant_users.email UNIQUE` sağlıyordu). Yalnızca yönlendirme bilgisi tutar;
parola özeti ve kişisel alanlar tenant şemasında kalır.

Token'lara `tid` claim'i eklenir. Claim'i taşımayan **eski token'lar** dizin
üzerinden çözülür — deploy anında elde token'ı olan kullanıcıların oturumu
düşmez.
