# Test Strategy

## Backend unit tests

Öncelik rule engine'dedir.

Test edilmesi gerekenler:

- Supplier sadece izinli kategoriden randevu oluşturabilir.
- Kategori default vehicle category doğru çözülür.
- Supplier override vehicle category verebilir.
- Dock product category compatibility filtreler.
- Dock vehicle category compatibility filtreler.
- Empty accepted vehicle categories = all accepted.
- Working hours dışı slot reddedilir.
- Closed override günü slot reddedilir.
- Existing appointment çakışması reddedilir.
- Conflict group mutual block diğer rampayı da bloke eder.
- Conditional conflict sadece trigger eşleşince çalışır.
- Cargo warning availability output'ta advisory olarak döner ama slotu engellemez.
- Supplier quota exceeded hata verir.
- Auto approval supplier için appointment approved oluşur.
- Manual approval supplier için pending oluşur.

## API integration tests

- Auth/login
- Facility context access
- Supplier appointment create/list own isolation
- Tenant user cannot access another facility
- Platform user cannot see operational detail by default
- Appointment approve/reject/revise/complete/cancel
- Audit log creation

## Frontend tests

- Smoke: login -> dashboard
- Supplier wizard happy path
- Vehicle category değişince availability yeniden çağrılır
- Cargo seçince UI kaba pencereye döner
- Calendar renders status + cargo overlay
- Permission-aware nav hides unauthorized items

## E2E demo scenario

1. Platform admin tenant/facility görür.
2. Tenant admin kategori, araç kategorisi, rampa ve conflict group ayarını görür.
3. Supplier randevu talep eder.
4. Sistem uygun rampa atar.
5. Rampa yöneticisi randevuyu onaylar.
6. Calendar'da randevu görünür.
7. Kargo randevusu calendar overlay üretir.
8. Yönetici kargo geldiğinde revize eder.
9. Audit log oluşur.
