# User Flows

## Tedarikçi: Randevu oluşturma v2.0

### Adım 1 — Ürün ve kategori

Tedarikçi girer/seçer:

- Ürün/malzeme adı
- Kategori
- Miktar
- Birim: Palet, Adet, Kutu, Koli

Sistem arka planda çözer:

- Kategoriye bağlı minimum blokaj süresi
- Kategoriye bağlı varsayılan araç kategorisi
- Tedarikçiye izinli kategori mi?
- Uygun rampa adayları

Tedarikçi rampa seçmez.

### Adım 2 — Araç ve teslimat tipi

Tedarikçi girer/seçer:

- Araç kategorisi: kategori varsayılanından otomatik gelir, değiştirilebilir.
- Plaka: serbest metin olarak korunur.
- Sürücü adı/telefonu: v1.0 akışından korunur.
- Teslimat tipi: `standard` veya `cargo`.

Kargo seçilirse:

- Saat yerine kaba pencere toplanır: sabah / öğleden sonra / tüm gün.
- Kesin slot taahhüdü yoktur.

### Adım 3 — Tarih, saat ve süre

Tedarikçi seçer:

- Gün
- 30 dakikalık başlangıç slotu
- Tahmini süre

Slot görünümü:

- Müsait
- Kısmen dolu
- Dolu

Bu slotlar ürün, araç kategorisi, rampa kategori uyumu, rampa araç uyumu, çakışma grupları, çalışma saatleri, override, tedarikçi min/maks limitleri ve kota kontrolleri hesaba katılarak gösterilir.

### Özet ve gönderim

Özet içeriği:

- Tarih/aralık veya kargo pencere bilgisi
- Ürün
- Kategori
- Miktar/birim
- Araç kategorisi
- Plaka/sürücü
- Teslimat tipi
- Tekrarlama bilgisi varsa

Gönderim sonucu:

- Tedarikçinin otomatik onay yetkisi varsa `Onaylandı`.
- Yoksa `Bekliyor`.

## Yönetici: Randevu işlem akışı

Bir randevu detayında durumuna göre şu aksiyonlar görünür:

- Onayla
- Reddet
- Revize Et
- Tamamla
- İptal Et

### Revize

Yönetici yeni başlangıç, süre ve rampa önerir/seçer. Revizyon notu ekleyebilir. Sistem eski ve yeni aralığı saklar. Tedarikçiye bildirim/e-posta gönderilir.

### Kargo varışı

Kargo fiilen geldiğinde yeni statü veya yeni modal yoktur. Mevcut `Revize Et` akışı kullanılır. Yönetici randevuyu gerçek geliş saatine göre revize eder.

## Sistem yöneticisi: Konfigürasyon

- Tenant/facility bağlamında çalışır.
- Ürün kategorileri + varsayılan araç kategorisi.
- Araç kategorileri.
- Rampalar + kabul edilen ürün kategorileri + kabul edilen araç kategorileri.
- Rampa çakışma grupları.
- Tedarikçiler + izinli kategoriler + limit/kota + otomatik onay.
- Kullanıcılar/roller/yetkiler.
- White-label marka ayarları.

## Platform yöneticisi: SaaS operasyonu

- Tenant oluşturur/düzenler.
- Tenant'a facility ekler.
- Plan/fiyat profili atar.
- Kullanım/sağlık metriklerini izler.
- Destek için gerektiğinde loglanan impersonation başlatır.
