# Roles and Permissions

## İki ayrı izin uzayı

LogiSlot'ta iki ayrı izin uzayı vardır:

1. Platform izinleri: SaaS sağlayıcı personeli içindir.
2. Tenant/facility izinleri: Müşteri organizasyonu içindeki kullanıcılar içindir.

Bu iki uzay birleştirilmez. Tenant Sistem Yöneticisi platform izinlerini göremez/veremez. Platform kullanıcısı da otomatik olarak tenant operasyonel verisine erişemez.

## Platform rolleri

### Platform Yöneticisi / Vendor Admin

Sorumluluklar:

- Tenant dizinini yönetir.
- Facility dizinini tenant'lar arası görür.
- Kullanım/sağlık metriklerini inceler.
- Plan/fiyat profili atamalarını görüntüler/değiştirir.
- Gerekirse açık ve loglanan impersonation ile destek erişimi yapar.

Örnek izinler:

- `platform.tenant.view`
- `platform.tenant.manage`
- `platform.facility.view`
- `platform.analytics.view`
- `platform.plan.view`
- `platform.plan.assign`
- `platform.impersonate`

## Tenant/facility rolleri

### Sistem Yöneticisi

- Tesis içi tüm konfigürasyonu yönetir.
- Kategori, araç kategorisi, rampa, çakışma grubu, tedarikçi, kullanıcı ve rol tanımlarını yapar.

Örnek izinler:

- `category.manage`
- `vehicle_category.manage`
- `dock.manage`
- `dock_conflict_group.manage`
- `supplier.manage`
- `user.manage`
- `role.manage`
- `report.view`
- `calendar.override`

### Rampa / Depo Yöneticisi

- Takvimde randevuları görür.
- Sadece yetkili olduğu rampalarda onay/red/revize/tamamla/iptal işlemi yapar.

Örnek izinler:

- `appt.view`
- `appt.approve`
- `appt.reject`
- `appt.revise`
- `appt.complete`
- `appt.cancel`

### İzleyici / Planlama / Satın Alma

- Takvimi ve randevu durumlarını salt okunur görür.
- Müdahale yetkisi yoktur.

Örnek izinler:

- `appt.view`
- `calendar.view`
- `report.view`

### Tedarikçi / Nakliyeci

- Kendi randevularını oluşturur, takip eder ve uygun durumda iptal eder.
- Sadece kendi tedarikçi hesabına bağlı kayıtları görür.

Örnek izinler:

- `supplier_portal.appointment.create`
- `supplier_portal.appointment.view_own`
- `supplier_portal.appointment.cancel_own`
- `supplier_portal.profile.view`

## Rampa bazlı kısıtlama

Rampa/depo yöneticilerinde kullanıcıya atanmış rampa listesi olabilir. İşlem yapılırken sadece rol izni değil, rampa scope kontrolü de yapılmalıdır.

## Facility context

Tenant içi kullanıcı birden fazla facility'ye yetkili olabilir. UI giriş sonrası aktif facility seçimi veya header switcher sağlamalıdır. Tüm API çağrılarında aktif facility context zorunludur.
