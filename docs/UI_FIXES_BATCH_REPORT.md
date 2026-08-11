# LogiSlot — UI Fixes Batch Report

**Tarih:** 2026-07-09
**Kapsam:** Yalnızca kod + `logislot-dev` deploy/doğrulama. Prod'a ve Hermes namespace'lerine dokunulmadı.
**Branch:** `dev` (`aa99c53`)

Kullanıcının bildirdiği 8 madde giderildi.

---

## 1. Bildirim toggle yazının önünü kapatıyordu
`Switch` bileşeni **etiket SOLDA / kontrol SAĞDA** (`justify-between`) desenine geçirildi — etiket ve toggle ayrı flex öğeleri, artık üst üste binmiyor. Bildirim Tercihleri dialogundaki tüm satırlar tam okunuyor (Panel / E-posta / Randevu onaylandığında …).

## 2. Tema düğmesi tek tıkla geçsin (menü yok)
`ThemeToggle` açılır menü yerine **tek tıkla anında light ↔ dark** geçen tek butona dönüştü (güneş/ay animasyonlu; aria-label "Karanlık/Aydınlık moda geç"). Kalıcılık (localStorage) korunuyor.

## 3. Randevu detayı: blur'lu sağ drawer → ortalı premium modal
Yeni `components/ui/modal.tsx` (ortalı, sticky başlık + kaydırılabilir gövde, mobilde bottom-sheet, backdrop-blur, fade/scale animasyon). `AppointmentDrawer` artık bu **ortalı modalı** kullanıyor — sol taraf blur'lu tuhaf görünüm gitti.

## 4. Takvimde ok butonları
Metin "← Önceki / Sonraki →" yerine premium **ChevronLeft / ChevronRight ok butonları**; her tık gün (günlük) veya hafta (haftalık) ileri/geri götürüyor. "Bugün" ve Günlük/Haftalık korundu.

## 5. White-label kaldırıldı (9 kart)
Admin Yönetim'deki "Marka / White-Label" kartı, `/admin/settings/branding` sayfası, `apply-branding` bileşeni, `lib/api/branding` ve `04-branding` e2e testi silindi. Admin/tedarikçi layoutları sade `LogiSlotLogo` kullanıyor. **Yönetim artık 9 kart** (doğrulandı).

## 6. Kod-adı (underscore) sızıntıları
E-posta loglarında ham kodlar (`appointment_approved`, `log_only`, `sent` …) yerine Türkçe etiketler — yeni `lib/email-labels.ts` (template/status/provider haritaları + bilinmeyenler için humanize). Hem E-posta Logları sayfasında hem randevu modalında uygulandı.

## 7. Logo → ana sayfa
Kabuktaki (sidebar/topbar/drawer) LogiSlot logosu artık portalın ana sayfasına (ilk nav öğesi: admin→Genel Bakış, platform→Tenant Dizini, tedarikçi→Randevularım) **link** (doğrulandı: logo→home OK).

## 8. Login: yan kartlar + light gradient
- Ortam çipleri (Otomatik onay / Doluluk %72 / 08:30 Rampa) kaldırıldı.
- Ortadaki giriş kartı aynı kaldı; **SOL ve SAĞ'a iki büyük animasyonlu operasyon kartı** eklendi: sol "Bugünkü rampa akışı" (rampa slotları + %72 doluluk), sağ "Haftalık doluluk" (7 çubuklu mini grafik + Onaylanan/Bekleyen özet). Float animasyonlu, tema-uyumlu, xl+ ekranda.
- **Light modda beyaz→mavi gradient** (dümdüz beyaz değil); dark modda navy gradient korundu.

---

## Testler / Doğrulama

- `tsc --noEmit` ✅, `lint:web` ✅ (0 uyarı), `build:web` ✅ (branding route kaldırıldı → 33 sayfa).
- **E2E (canlı dev): 16/16 passed.** Portal seçici artık `role="radio"`, tema tek-tık, parola göster/gizle çakışması exact-match ile giderilmişti; tüm login/nav/çıkış/tema akışları geçiyor.
- **Görsel QA (canlı dev):** bildirim dialogu (toggle taşması yok), randevu modalı (ortalı), takvim okları, ayarlar (9 kart), logo→home, login (light+dark yan kartlar + gradient) — hepsi doğrulandı.

## Dev Deploy

`image_tag=dev-aa99c53`. `logislot-api` + `logislot-web` rollout oldu; health ok; seed çalışmadı (demo verisi korundu). `logislot-scheduler` yine 120s içinde hazır raporlamadı (tekrarlayan geçici cluster zamanlama hıçkırığı; UI/API etkilenmez).

## Prod Etkisi

**Prod'a dokunulmadı.** `logislot-prod` apply yok, prod seed yok, Hermes namespace'lerine dokunulmadı.

## Not

Underscore kod-adı taraması yapıldı; kategoriler/araçlar tablosu "Ad" (kod) + "Görünen Ad" sütunlarını **bilinçli** birlikte gösteriyor (admin config), roller `display_name` kullanıyor. Net ham-kod sızıntısı e-posta loglarındaydı ve etiketlendi. Başka bir yerde ham kod görürsen ekran/sayfa söyle, o alanı da haritalayayım.
