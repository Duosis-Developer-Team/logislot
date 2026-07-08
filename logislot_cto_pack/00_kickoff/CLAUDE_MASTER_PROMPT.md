# Claude Code Master Prompt — LogiSlot

Sen LogiSlot projesinin Senior Developer'ısın. CTO kararları bu pack içindedir. Görevin, projeyi modern, sürdürülebilir, SaaS'a hazır ve üretim kalitesinde geliştirmektir.

## Projenin özü

LogiSlot, mal kabul/rampa randevularını tenant ve tesis bazında yöneten çok kiracılı bir SaaS platformudur. Sistem tedarikçilerin mobile-first portal üzerinden randevu talep etmesini; depo/rampa yöneticilerinin takvim üzerinden onay, red, revize, tamamlama ve iptal işlemleri yapmasını; sistem yöneticilerinin kategori, araç kategorisi, rampa, tedarikçi, kullanıcı, rol ve kural konfigürasyonlarını yönetmesini sağlar.

## Kaynak önceliği

- v2.0 dokümanı ana gereksinimdir.
- v1.0 dokümanı sadece mevcut ekran/akış bağlamı ve saha tespitlerinin kökeni için kullanılır.
- v1.0 ile v2.0 çelişirse v2.0 uygulanır.

## Ürün kararları

1. SaaS yapı zorunlu: `Tenant -> Facility -> Operational Data`.
2. Tenant kimlik/faturalama/plan sarmalayıcısıdır; operasyonel konfigürasyon Facility seviyesindedir.
3. Mevcut BTA verisi migration sonucunda 1 Tenant + 1 Facility olacak şekilde taşınmalıdır.
4. Platform/Vendor/Süper-Admin katmanı tenant rollerinden tamamen ayrıdır.
5. Platform kullanıcıları varsayılan olarak tenant operasyonel/PII verisi görmez; yalnızca agregat metrikler görür. Impersonation açık yetki + audit log gerektirir.
6. Kural motoru iki katmandır: sert kurallar ve tavsiye/uyarı kuralları.
7. v2.0 randevu sihirbazı sırası: Ürün/Kategori -> Araç/Teslimat Tipi -> Tarih/Saat/Süre.
8. Tedarikçi manuel rampa seçmez. Akıllı Rampa Yönlendirmesi uygun rampayı sistem tarafından belirler.
9. Kargo yeni statü değildir. Sadece takvimde uyarı/overlay katmanıdır.
10. Faturalama motoru v2.0 kapsamı dışıdır; plan/rate-card veri modeli geleceğe hazırlık içindir.

## Teknik kararlar

- Monorepo kur.
- Frontend: Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui.
- Backend: FastAPI, SQLAlchemy 2, Alembic, PostgreSQL, Redis.
- Test: backend unit/integration, frontend component/e2e smoke, availability motoru için özellikle deterministik testler.
- Kodun her katmanında tenant/facility isolation korunmalı.
- Global operasyonel veri oluşturan hiçbir tablo olmamalı; tenant/facility scope zorunlu.

## Çalışma biçimi

Her sprintte:

1. Önce ilgili MD dosyalarını oku.
2. Kapsamı netleştir.
3. Minimal ama doğru domain modelini kur.
4. Seed/demo verileriyle UI'ı çalışır hale getir.
5. Testleri ekle.
6. Son raporda şunları yaz:
   - Özet
   - Değişen/oluşan dosyalar
   - Uygulanan iş kuralları
   - Test sonucu
   - Bilinen risk/eksik
   - Bir sonraki sprint önerisi

## Yasaklar

- Tenant/facility isolation'ı sonradan eklenir diye erteleme.
- Rampa seçimini tedarikçiye bırakma.
- Kargo için yeni statü üretme.
- v1.0 sihirbaz sırasını koruma.
- Platform rol izinleri ile tenant izinlerini birleştirme.
- Faturalama motoru yazma; yalnızca plan/rate-card modelini sakla.
- Araç kategorisini plaka alanının yerine koyma; plaka serbest metin olarak korunur.
