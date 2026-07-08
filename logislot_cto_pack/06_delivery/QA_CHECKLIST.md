# QA Checklist

## Smoke

- API `/health` OK
- Web açılıyor
- Login akışları çalışıyor
- Seed data yükleniyor

## Security

- Tenant A kullanıcısı Tenant B verisini göremiyor
- Facility A kullanıcısı Facility B verisini göremiyor
- Supplier başka supplier randevusunu göremiyor
- Platform user default operasyonel detay göremiyor
- Permission olmayan menü görünmüyor
- Permission olmayan API 403 dönüyor

## Appointment

- Pending appointment create
- Auto-approved appointment create
- Reject requires reason
- Revise stores old/new values
- Complete only approved appointment
- Cancel flow works
- Recurring marker stored; expansion ayrı sprint ise açıkça belirtilir

## Availability

- Full slot selectable değil
- Partial slot doğru gösteriliyor
- Category min duration uygulanıyor
- Supplier max duration uygulanıyor
- Closed dock görünmüyor
- Extra hours görünür
- Vehicle category incompatible dock elenir
- Conflict group sibling dock'u bloke eder
- Cargo advisory warning döner

## UI

- Supplier mobile 360px kontrol
- Admin desktop 1440px kontrol
- Calendar overflow yok
- Config modals/drawers tutarlı
- Kargo overlay ve status renkleri birlikte okunuyor
- White-label renkleri temel componentlere uygulanıyor
