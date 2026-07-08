# v1.0 Context Notes

Bu dosya v1.0 dokümanından gelen bağlamı özetler. v2.0 ile çelişirse uygulanmaz.

## v1.0 ürün yapısı

- İki ana portal vardı: Tedarikçi Portalı ve Yönetim Paneli.
- Tedarikçi Portalı mobile-first tasarlanmıştı.
- Yönetim Paneli dashboard, bildirim, takvim, randevu listesi, raporlar ve yönetim modülünden oluşuyordu.

## v1.0 tedarikçi wizard

Eski sıra:

1. Tarih, saat ve süre
2. Ürün bilgisi
3. Araç, tekrar ve özet

v2.0'da bu sıra değişmiştir. Yeni sıra zorunludur:

1. Ürün ve kategori
2. Araç ve teslimat tipi
3. Tarih, saat ve süre

## v1.0 iş kuralları

- Kategori-rampa uygunluğu
- Müsaitlik ve çakışma önleme
- Dinamik süre blokajı
- Çalışma saatleri ve override
- Tedarikçi limitleri
- Otomatik onay

Bu kurallar v2.0'da korunur ve facility-scoped hale gelir.

## Saha tespitleri

### Tespit 1 — Rampa kapasitesi ve araç tipi

- 1. veya 2. rampaya TIR yanaştığında ikisi birden etkileniyor.
- 3. rampa küçük araçlara uygun.
- v2.0 çözümü: hardcode araç tipi kuralı değil; araç kategorisi + dock accepted vehicle categories + dock conflict groups.

### Tespit 2 — Kalite kontrol süresi

- Kalite kontrol süresi randevu süresine dahil edilmiyordu.
- v2.0 çözümü: kategori minimum blokaj süresi mekanizması korunur; örneğin +15 dk kategoriye yansır.

### Tespit 3 — Şehir dışı kargo belirsizliği

- Kargo geliş saati kesin bilinmiyor.
- v1.0 çözümü revize/e-posta idi.
- v2.0 çözümü: teslimat tipi cargo + takvim uyarı katmanı + varış sonrası mevcut revize akışı.
