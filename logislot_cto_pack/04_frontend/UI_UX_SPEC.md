# UI/UX Specification

## Marka yönü

LogiSlot modern, premium ve operasyonel güven hissi veren bir SaaS olmalıdır. Tasarım fazla renkli/oyuncak gibi değil; net, hızlı, kurumsal ama güncel olmalıdır.

## Tasarım sistemi

- Tailwind CSS token tabanlı renk sistemi
- shadcn/ui component altyapısı
- Radius: modern ama aşırı yuvarlak olmayan
- Kartlar: net hiyerarşi, hafif shadow/border
- Dark login/admin opsiyonel ama ana panel temiz light-first olabilir
- White-label desteği: tenant/facility logo, ana renk, accent renk

## Temel ekranlar

### Portal seçimi

- Tedarikçi Portalı
- Yönetim Paneli
- Platform Yönetimi

Demo aşamasında kartlar kullanılabilir; production'da login route ayrışabilir.

### Tedarikçi Randevularım

- Firma adı
- Özet sayaçlar: yaklaşan, bekleyen, tamamlanan
- Sekmeler: Yaklaşan / Geçmiş
- Randevu kartı: tarih, saat, ürün, miktar, araç kategorisi, plaka, durum rozeti
- Detay drawer/page

### Yeni Randevu Wizard

v2.0 sırası kesin:

1. Ürün ve kategori
2. Araç ve teslimat tipi
3. Tarih, saat, süre + özet

Adım 3 slot UI:

- 30 dk dilimler
- Müsait / Kısmen dolu / Dolu
- Kargo seçiliyse kaba pencere UI
- Duration selector kategori/tedarikçi limitlerine göre filtreli

### Yönetim Dashboard

- Bugünkü randevular
- Onay bekleyen talepler
- Bu haftaki toplam
- Aktif tedarikçi sayısı
- Onay bekleyenler listesi
- Günün programı

### Takvim

Günlük görünüm:

- Rampalar sütun
- Saat cetveli satır
- Randevular blok
- Durum rengi
- Kargo overlay/rozet/border
- Blok tıklayınca işlem paneli

Haftalık görünüm:

- Gün bazlı doluluk özeti
- Kargo uyarısı olan günler ayrıca işaretlenir

### Randevular Listesi

- Arama: tedarikçi, ürün, plaka
- Filtre: tarih, durum, teslimat tipi, rampa, kategori
- Bekliyor rozet sayısı
- Table row click -> detail

### Yönetim ekranları

Ortak pattern:

- Header + açıklama + create button
- Search/filter
- Data table
- Edit drawer/modal
- Active/passive switch
- Delete yerine ilk sürümde pasifleştirme tercih edilebilir

Ekranlar:

- Kategoriler
- Araç Kategorileri
- Rampalar
- Rampa Çakışma Grupları
- Tedarikçiler
- Kullanıcılar & Roller
- Marka/White-label ayarları

## Takvim renk/overlay kuralı

Durum rengi ana sinyaldir:

- Bekliyor
- Onaylandı
- Revize Bekliyor
- Reddedildi
- Tamamlandı
- İptal

Kargo overlay ikinci sinyaldir:

- Statü rengini değiştirmez.
- Blok üzerine icon/rozet/border/pattern ekler.
- Gün/rampa hücresinde uyarı gösterebilir.

## Responsive beklenti

- Supplier portal: 360px width dahil kusursuz.
- Admin panel: tablet ve desktop iyi; mobile'da temel gezinme kırılmamalı.
- Takvim mobile'da yatay scroll veya sade liste alternatifi sunabilir.
