# v2.0 Decision Summary

## Kesin kararlar

- LogiSlot artık çok kiracılı SaaS olarak tasarlanacaktır.
- Hiyerarşi: Tenant -> Facility -> Operational Data.
- Tenant operasyonel veri tutmaz; kimlik/faturalama/plan sarmalayıcısıdır.
- Facility tüm operasyonel konfigürasyonun kapsamıdır.
- Platform/Vendor/Süper-Admin katmanı ayrı güvenlik/izin uzayıdır.
- Tenant içi RBAC korunur.
- Platform izinleri tenant izinleriyle birleşmez.
- Platform varsayılan olarak operasyonel/PII detay görmez.
- Impersonation açık yetki + audit log gerektirir.
- ProductCategory üzerine default vehicle category eklenir.
- VehicleCategory yeni first-class entity'dir.
- Dock üzerine accepted vehicle categories eklenir.
- DockConflictGroup yeni entity'dir; grup üyeliği grup varlığında tutulur.
- Appointment üzerine vehicle category, delivery type ve cargo alanları eklenir.
- Supplier değişmez; araç seçimi supplier seviyesinde değil randevu seviyesindedir.
- Rule engine tesis bazlı konfigürasyon katmanı olarak ele alınır.
- Sert kurallar ve tavsiye kuralları ayrılır.
- Kargo tavsiye/uyarı katmanıdır, engelleyici kural değildir.
- Randevu wizard sırası değişir: ürün/kategori -> araç/teslimat -> tarih/saat/süre.
- Kargo yeni statü değildir.
- Mevcut randevu statüleri korunur.
- Plan/fiyat modeli esnek tutulur; faturalama motoru kapsam dışıdır.
- White-label marka ayarları tenant/facility konfigürasyonunun parçası olacaktır.

## v1.0'dan korunanlar

- Tedarikçi portalı mobile-first.
- Yönetim paneli dashboard/takvim/randevu listesi/rapor/yönetim yapısı.
- Tedarikçi randevularım ve profil ekranları.
- Admin onay/red/revize/tamamla/iptal aksiyonları.
- Revizyon geçmişi ve tedarikçiye eski/yeni aralık gösterimi.
- Kategori bazlı minimum blokaj süresi.
- Rampa kategori uygunluğu.
- Çalışma saatleri ve override.
- Tedarikçi kotaları ve min/max blokaj limitleri.
- Otomatik onay modeli.
- Randevu statüleri.
