from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LOGISLOT_", env_file=".env", extra="ignore")

    app_name: str = "LogiSlot API"
    environment: str = "development"
    database_url: str = "postgresql+asyncpg://logislot:logislot@localhost:5433/logislot"
    secret_key: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_minutes: int = 60 * 24 * 7
    cors_origins: list[str] = ["http://localhost:3000"]
    # Portal linki (e-posta sablonlarindaki yonlendirme adresi)
    public_web_url: str = "http://localhost:3010"
    # E-posta saglayicisi: log_only (varsayilan) | smtp
    email_provider: str = "log_only"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "LogiSlot"
    smtp_use_tls: bool = True
    smtp_timeout_seconds: int = 10
    # Parola politikasi: /auth/change-password'da uygulanir. Gecici parolalar
    # must_change_password ile ilk giriste degistirilmek zorunda oldugundan
    # kalici her parola politikadan gecmis olur (karar, Sprint 9 raporu).
    password_min_length: int = 10
    password_require_special: bool = True
    # Guvenlik
    rate_limit_enabled: bool = True
    login_rate_limit_attempts: int = 10  # IP+email basina / 60 sn
    create_rate_limit_attempts: int = 20  # supplier randevu create / 60 sn
    # API docs: production'da LOGISLOT_ENABLE_DOCS=false ile kapatin
    enable_docs: bool = True
    # --- Tenant veri izolasyonu (sema-basina-tenant) ---
    # Her tenant kendi Postgres semasinda yasar; control-plane (tenants,
    # plans, platform_users, ...) veritabaninin varsayilan semasindadir.
    #
    # GECIS SOZLESMESI: control.tenant_datastores'ta 'ready' kaydi OLMAYAN
    # tenant, eski ortak yerlesimde calismaya devam eder. Tum tenant'lar
    # tasindiktan sonra asagidaki bayrak true yapilir ve bu geri dusus
    # KAPANIR — boylece provisioning'i atlanmis bir tenant sessizce ortak
    # tablolara yazmak yerine hata verir.
    tenant_datastore_required: bool = False
    # DDL (sema/rol olusturma, migration) icin ayri ve YETKILI baglanti.
    # Bos ise database_url kullanilir. Uretimde ayri tutulmasi onerilir:
    # boylece calisma zamani rolunun DDL yetkisi hic olmaz.
    admin_database_url: str = ""
    # Uygulamanin calisma zamaninda kullandigi dusuk yetkili rol adi.
    # Tenant rolleri bu role UYE yapilir; rol NOINHERIT oldugundan yetki
    # yalnizca acikca SET ROLE yapilinca kazanilir (fail-closed).
    app_db_role: str = "logislot_app"
    # Ayni anda acik tutulan tenant engine sayisi (LRU). Yalnizca AYRI
    # veritabani kullanan tenant'lar icin engine acilir; sema modundaki
    # tenant'lar tek havuzu paylasir.
    tenant_engine_cache_size: int = 16
    # Ayri veritabani kullanan tenant'lar icin takma ad -> DSN haritasi.
    # DSN'ler parola icerdiginden veritabaninda DEGIL, secret'ta tutulur;
    # tenant_datastores.dsn_alias yalnizca buradaki anahtari isaret eder.
    tenant_database_dsns: dict[str, str] = {}

    # --- Gozlemlenebilirlik: Prometheus/Drake (bkz. LOGISLOT_METRICS.md) ---
    # /metrics AYRI bir portta yayinlanir; uygulama portu (8000) NodePort ile
    # disariya aciktir ve metrikler kumeden cikmamalidir.
    metrics_enabled: bool = True
    metrics_port: int = 9464
    metrics_project: str = "logislot"
    # DIKKAT: bu ALAN yukaridaki `environment` DEGILDIR ve onunla
    # doldurulmamalidir. Drake KATALOG ANAHTARINI bekler (dev | prod);
    # `environment` ise development | production tutar. Sozlesme dokumaninin
    # "en olasi hata" dedigi yer tam olarak burasi, bu yuzden ayri alan.
    # Deger her iki overlay'in configmap patch'inde ACIKCA verilir ve CI
    # (ci.yml -> manifests) prod overlay'inin "prod" urettigini dogrular.
    #
    # Varsayilan bilerek "unknown": gecerli bir ortam adi DEGIL. Eskiden
    # "dev" idi ve bu sessiz bir tuzakti — patch'i unutulmus bir prod
    # kurulumu environment="dev" yayinlar, prod panolari bos kalir VE prod
    # trafigi dev'in rakamlarina karisirdi. "unknown" ile hata yalnizca
    # kendi ortamini etkiler ve grafikte hemen gorunur.
    metrics_environment: str = "unknown"
    # Drake'in servis anahtari (.drake/project.yaml ile birebir ayni olmali).
    metrics_service: str = "logislot-api"

    # --- Hermes Ticket Hub entegrasyonu ---
    # Hermes canonical destek sistemidir; LogiSlot yalnizca consumer'dir.
    # Bu ayarlarin HICBIRI tarayiciya (NEXT_PUBLIC_*) verilmez.
    #
    # base_url BOS ise entegrasyon "yapilandirilmamis" sayilir: ticket
    # olusturma yerelde CALISMAYA DEVAM eder (outbox birikir), Hermes'e
    # gonderim denenmez ve platform sagligi bunu acikca gosterir. Sessiz
    # basarisizlik yerine gorunur bir "yapilandirilmadi" durumu tercih edildi.
    hermes_support_base_url: str = ""
    #: Bu LogiSlot kurulumunun Hermes'teki immutable application kodu.
    hermes_support_application_code: str = "logislot"
    hermes_support_client_id: str = ""
    #: Backend-to-backend service token. YALNIZCA secret'tan gelir.
    hermes_support_token: str = ""
    #: Gelen webhook imzasinin dogrulandigi paylasilan sir (HMAC-SHA256).
    hermes_support_webhook_secret: str = ""
    #: Rotasyon sirasinda ikinci (eski/yeni) anahtar kisa sure kabul edilir.
    hermes_support_webhook_secret_previous: str = ""
    hermes_support_webhook_key_id: str = "v1"
    #: Imzali govdedeki timestamp bu pencerenin disindaysa istek REDDEDILIR.
    hermes_support_webhook_tolerance_seconds: int = 300
    #: Webhook govde siniri; asan istek okunmadan reddedilir.
    hermes_support_webhook_max_body_bytes: int = 262144
    hermes_support_timeout_seconds: float = 8.0
    #: Grup katalogu onbellek omru (platform ekrani her acilista Hermes'e
    #: gitmesin diye). Cache OTORITE DEGILDIR; save/create dogrulamasi
    #: her zaman uzak servise sorar.
    hermes_support_catalog_ttl_seconds: int = 300
    #: LogiSlot'un Hermes'e bildirdigi callback taban adresi (yalnizca
    #: dokumantasyon/health amacli; Hermes kendi config'inden cagirir).
    hermes_support_callback_base_url: str = ""

    # --- Ticket ozelligi ---
    #: Kapaliyken tenant/tedarikci ticket uclari 404 gibi degil, acik bir
    #: "ozellik kapali" yaniti dondurur ve nav gizlenir (rollback yolu).
    ticketing_enabled: bool = True
    ticket_attachment_max_files: int = 5
    ticket_attachment_max_file_size_bytes: int = 15_728_640  # 15 MB
    ticket_attachment_max_total_bytes: int = 52_428_800  # 50 MB
    #: Outbox teslimat dongusu; webhook gecikme hedefi 60 sn oldugundan kisa.
    ticket_outbox_interval_seconds: int = 20
    ticket_reconciliation_interval_seconds: int = 900
    ticket_inbox_recovery_interval_seconds: int = 300
    #: Bir komut bu kadar denemeden sonra dead-letter'a duser (bkz. 06/2).
    ticket_outbox_max_attempts: int = 10

    # Maintenance scheduler (Sprint 11): email retry + bildirim temizligi
    scheduler_enabled: bool = True
    email_retry_interval_seconds: int = 300
    notification_cleanup_interval_seconds: int = 86400
    notification_retention_days: int = 90


@lru_cache
def get_settings() -> Settings:
    return Settings()
