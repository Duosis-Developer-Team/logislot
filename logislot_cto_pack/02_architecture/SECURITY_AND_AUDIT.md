# Security and Audit

## Temel güvenlik kararları

- Platform kullanıcıları ve tenant kullanıcıları izin modeli olarak ayrıdır.
- Her request authenticated user + active tenant/facility context ile çalışır.
- Facility scope'u olmayan operasyonel endpoint olmamalıdır.
- Kullanıcı sadece yetkili olduğu facility'lerde işlem yapabilir.
- Rampa/depo yöneticisinin işlem yetkisi atanmış rampa listesiyle daraltılır.

## Audit log gerektiren olaylar

- Login/logout/failed login
- Tenant oluşturma/güncelleme/durum değiştirme
- Facility oluşturma/güncelleme/durum değiştirme
- Plan atama/değiştirme
- Kullanıcı/rol/yetki değişiklikleri
- Tedarikçi oluşturma/güncelleme/pasifleştirme
- Kategori/araç kategorisi/rampa/çakışma grubu değişiklikleri
- Randevu oluşturma/onay/red/revize/tamamla/iptal
- Impersonation başlatma/bitirme
- Platform kullanıcısının tenant/facility agregat metriklerine erişimi
- PII içeren operasyonel detaya yükseltilmiş erişim

## AuditLog alanları

- id
- occurred_at
- actor_type: platform_user / tenant_user / supplier_user / system
- actor_id
- tenant_id nullable
- facility_id nullable
- action
- entity_type
- entity_id
- before_json nullable
- after_json nullable
- metadata_json
- ip_address
- user_agent
- impersonation_session_id nullable

## Impersonation ilkesi

- Default kapalı.
- Sadece `platform.impersonate` izni olan kullanıcı başlatabilir.
- Başlatırken neden/not zorunludur.
- UI'da açık impersonation banner'ı görünür.
- Tüm aksiyonlar hem platform aktörü hem impersonated tenant/facility context ile loglanır.
- Impersonation süresi kısa tutulur ve manuel bitirilebilir.

## PII erişim sınırı

Platform dashboard varsayılan olarak yalnızca agregat verir:

- Randevu hacmi
- Aktif rampa sayısı
- Aktif tedarikçi sayısı
- Aktif kullanıcı sayısı
- Bekleyen randevularda karar süresi / SLA
- Son aktivite zamanı

Tedarikçi adı, sürücü adı, telefon, plaka gibi detaylar platform katmanında varsayılan olarak gösterilmez.
