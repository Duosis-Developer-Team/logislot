# Product Specification — LogiSlot v2.0

## Ürün tanımı

LogiSlot, fabrikaların ve depo tesislerinin mal kabul randevu süreçlerini dijitalleştiren SaaS platformudur. Sistem, tedarikçilerden gelen randevu taleplerini iş kurallarıyla değerlendirir, uygun rampaları otomatik belirler, yöneticilere takvim üzerinden operasyonel kontrol sağlar ve tenant/facility bazlı konfigürasyon ile farklı fiziksel tesislere uyarlanabilir.

## Ana kullanıcı grupları

1. Tedarikçi / Nakliyeci
2. Rampa / Depo Yöneticisi
3. Sistem Yöneticisi
4. İzleyici / Planlama / Satın Alma
5. Platform Yöneticisi / Vendor Admin

## Ana portallar

### Tedarikçi Portalı

- Mobile-first tasarım.
- Randevularım, Yeni Randevu, Profil ana navigasyonu.
- Tedarikçi sadece kendi randevularını görür.
- Randevu oluştururken sadece kendisine izin verilen kategorileri seçer.
- Tedarikçi manuel rampa seçmez.
- Bekleyen/onaylı gelecek randevularını iptal edebilir.

### Yönetim Paneli

- Kurumsal kullanıcılar için masaüstü odaklı panel.
- Dashboard, Takvim, Randevular, Raporlar, Yönetim modülleri.
- Menü yetkilere göre şekillenir.
- Rampa/depo yöneticisi sadece atanmış rampalarında işlem yapar.
- Sistem yöneticisi tesis konfigürasyonlarını yönetir.

### Platform Yönetim Paneli

- SaaS sağlayıcının kendi personeli içindir.
- Tenant/tesis dizini, kullanım/sağlık metrikleri ve plan atama ekranlarını içerir.
- Operasyonel/PII veri erişimi varsayılan olarak yoktur.

## v2.0'ın ana farkları

| Alan | v1.0 | v2.0 |
|---|---|---|
| Müşteri modeli | Tek örtük fabrika | Tenant -> Facility hiyerarşisi |
| Platform yönetimi | Yok | Vendor/Süper-Admin katmanı |
| Araç bilgisi | Serbest metin plaka | Plaka + birinci sınıf araç kategorisi |
| Rampa ilişkileri | Her rampa bağımsız | Rampa çakışma grupları |
| Kargo | Revize ile yönetilen istisna | Teslimat tipi + takvim uyarı katmanı |
| Sihirbaz sırası | Zaman -> Ürün -> Araç | Ürün -> Araç/Teslimat -> Zaman |
| Fiyatlandırma | Yok | Esnek plan/rate-card veri modeli, faturalama motoru yok |

## Başarı kriterleri

- Tedarikçi 3 adımda doğru randevu talebi oluşturabilir.
- Zaman adımında görünen müsaitlik, ürün + araç + rampa çakışma grupları hesaba katılarak gerçek müsaitliktir.
- Yönetici takvimde durum renklerini ve kargo uyarılarını aynı anda görebilir.
- Sistem yöneticisi kod değişmeden tesis bazlı araç kategorisi, kategori, rampa, tedarikçi, rol ve çakışma grubu yönetebilir.
- Platform yöneticisi tenant/tesis kullanım sağlığını görebilir ama operasyonel detaylara varsayılan olarak erişemez.
