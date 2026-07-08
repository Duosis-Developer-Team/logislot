# Project Rules

## Kaynak kuralları

- Bu pack içindeki tüm kararlar v2.0 dokümanına göre düzenlenmiştir.
- v1.0'dan alınan her unsur, v2.0 tarafından korunuyorsa uygulanır.
- v2.0'da değiştirilen akışlarda v1.0 davranışı referans alınmaz.

## Mimari prensipler

- Multi-tenant yapı ilk günden itibaren uygulanır.
- Tenant, tesis ve operasyonel veri ayrımı veritabanı seviyesinde açık olmalıdır.
- Facility, operasyonel kapsamın merkezidir.
- Platform admin ve tenant admin iki ayrı güvenlik alanıdır.
- Her kritik aksiyon audit log üretir.
- Availability/rule motoru UI içine gömülü değil, backend domain servisidir.

## Ürün prensipleri

- Sahadaki kullanıcı hızlı işlem yapmalı; tedarikçi portalı mobile-first olmalı.
- Yönetim paneli masaüstü/verimlilik odaklı olmalı ama responsive kırılmamalı.
- Konfigürasyon ekranları modern, tutarlı ve kolay anlaşılır olmalı.
- Tedarikçi mümkün olduğunca az karar verir; sistem uygun rampayı arka planda seçer.
- Takvim, operasyonun gerçeklik kaynağıdır: durum rengi + kargo overlay + doluluk sinyali birlikte görünür.

## Kod kalitesi

- Domain servisleri framework bağımsız tutulmalıdır.
- API response/request DTO'ları açık tiplenmelidir.
- Migration dosyaları geri alınabilir mantıkta yazılmalıdır.
- Seed verileri demo ve test için ayrılmalıdır.
- Her sprintte lint/test çalıştırılmalıdır.
