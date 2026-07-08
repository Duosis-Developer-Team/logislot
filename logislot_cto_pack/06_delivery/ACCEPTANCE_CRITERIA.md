# Acceptance Criteria

## Global

- Tüm operasyonel veri tenant/facility scope'ludur.
- Facility isolation ihlali testlerde yakalanır.
- Platform izinleri tenant izinlerinden ayrıdır.
- Tüm kritik aksiyonlar audit log üretir.

## Supplier portal

- Mobile-first kullanılır.
- Randevu wizard sırası v2.0'a uygundur.
- Tedarikçi sadece izinli kategorileri görür.
- Araç kategorisi kategori default'u ile dolar, değiştirilebilir.
- Plaka ve sürücü alanları korunur.
- Tedarikçi manuel rampa seçmez.
- Kargo seçimi kaba pencere akışı başlatır.
- Auto approval tedarikçide randevu anında onaylanır.
- Manual approval tedarikçide randevu bekliyor durumuna düşer.

## Rule engine

- Ürün kategori uyumu uygulanır.
- Araç-rampa uyumu uygulanır.
- Rampa çakışma grubu uygulanır.
- Tetik koşullu conflict group yalnız koşul eşleştiğinde çalışır.
- Kargo uyarısı slotu engellemez.
- Çalışma saatleri ve override uygulanır.
- Tedarikçi kota ve min/max süre limitleri uygulanır.

## Yönetim paneli

- Dashboard özet kartları çalışır.
- Takvim durum renklerini gösterir.
- Kargo overlay statü renginden bağımsız görünür.
- Randevu onay/red/revize/tamamla/iptal akışları çalışır.
- Revizyon eski/yeni aralığı saklar.
- Bildirim paneli ilgili randevuya götürür.

## Admin config

- Kategorilerde varsayılan araç kategorisi alanı vardır.
- Araç kategorileri ayrı ekrandır.
- Rampalarda kabul edilen ürün kategorileri ve araç kategorileri vardır.
- Boş accepted vehicle list tüm araçları kabul eder.
- Conflict group üyeliği grup varlığında tutulur.
- Tedarikçide izinli kategoriler, kota, min/max süre ve otomatik onay vardır.
- Kullanıcı/rol ekranları permission-aware çalışır.

## Platform panel

- Tenant listelenir/oluşturulur/güncellenir.
- Facility listelenir/oluşturulur/güncellenir.
- Kullanım/sağlık metrikleri agregat görünür.
- Plan/rate-card oluşturulur ve atanır.
- Operasyonel detay/PII varsayılan görünmez.
