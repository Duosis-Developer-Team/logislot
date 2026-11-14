# İşlem Süresi Hesaplama

> Müşteri kararı (2026-11 toplantısı): "İşlem süresini tedarikçinin seçmesini doğru bulmuyoruz. Palet miktarı, kategori ve araç tipi seçilince program kendi hesaplasın." Ayrıca: gelen hammadde araçtan bağımsız olarak çok veya az olabilir; sevkiyat tipi (palet, çuval…) de hesaba girer.

Kod: `apps/api/app/services/duration_rules.py` · API: `apps/api/app/routers/duration.py` · Yönetim ekranı: **Yönetim → Süre Kuralları**.

## 1. Girdiler

| Girdi | Kaynağı |
|---|---|
| Araç tipi | Tedarikçinin seçtiği araç; seçmediyse kategorinin varsayılan aracı |
| Ürün kategorisi | Randevu formu |
| Sevkiyat tipi (birim) | Palet · Adet · Kutu · Koli · Çuval · Big Bag · Ton |
| Miktar | Randevu formu (birim cinsinden) |

## 2. Kural

Her kural iki parçadan oluşur:

- **Koşullar:** araç tipi, ürün kategorisi, sevkiyat tipi, miktar aralığı (en az / en çok). Boş bırakılan koşul **"hepsi"** demektir.
- **Hesap:** iki türden biri.
  - **Sabit süre:** `süre = X dk`
  - **Taban + birim başına:** `süre = taban + birim başına dk × miktar`. Aynı araca az ya da çok yük gelebildiği için süreyi miktar belirler.

Her kurala isteğe bağlı **alt/üst sınır** (dk) verilebilir.

## 3. Algoritma

1. **Eşleşme:** aktif kurallar listedeki sırayla taranır; dört koşulu da tutan **ilk** kural uygulanır.
2. **Ham süre:** kuralın hesap türüne göre.
3. **Kırpma:** kuralın alt/üst sınırı.
4. **Yuvarlama:** tesisin adımına **yukarı** (5 / 10 / 15 / 30 dk; 1 = yuvarlama yok). Rampa planı için süre asla aşağı yuvarlanmaz.
5. **Eşleşme yoksa:** ürün kategorisinin taban blokaj süresi uygulanır. Randevu engellenmez; kaynak "kural yok (kategori varsayılanı)" olarak işaretlenir.

Sıra önemlidir. Genel bir kural, kendisinden daha özel bir kuralın üstündeyse özel kural **hiç uygulanmaz**. Ekran bu kuralları uyarıyla gösterir. **"En özel kural üste"** düğmesi, dolu koşul sayısı çok olan kuralları yukarı taşır.

## 4. Modlar (tesis ayarı)

| Mod | Davranış |
|---|---|
| **Tedarikçi seçer** (varsayılan) | Eski davranış; kurallar yalnızca bilgi amaçlı |
| **Sistem önerir** | Hesaplanan süre önceden seçili gelir; tedarikçi kategori sınırları içinde değiştirebilir |
| **Sistem hesaplar** | Tedarikçi süreyi göremez/değiştiremez; sunucu tedarikçinin gönderdiği süreyi **yok sayar** ve kendisi hesaplar. Uygun saatler de bu süreyle aranır |

- Yönetim her modda süreyi elle değiştirebilir. Elle girilen süre kategori sınırlarına tabidir.
- Kuraldan gelen süre kategori/tedarikçi min–maks sınırlarına **takılmaz**, çünkü kuralı yönetim açıkça tanımlamıştır. Tek sınır 24 saattir.
- Randevuda sürenin kaynağı saklanır: `kural`, `kural yok (kategori varsayılanı)` ya da `elle`.

## 5. Örnek kural seti (müşterinin verdiği örnekler)

| Sıra | Araç | Kategori | Birim | Miktar | Hesap |
|---|---|---|---|---|---|
| 1 | Tır | Un | — | — | Sabit 180 dk |
| 2 | Tır | — | Palet | 10–20 | Sabit 90 dk |
| 3 | Kamyon | Yağ | Palet | 1–5 | Sabit 30 dk |
| 4 | Kamyon | Yağ | Palet | 6–10 | Sabit 45 dk |
| 5 | Tır | — | Palet | — | 20 dk + 2,5 dk/palet (en az 30, en çok 150) |
| 6 | — | — | Çuval | — | 10 dk + 0,5 dk/çuval |

## 6. Senaryolar (yuvarlama 15 dk)

| Senaryo | Eşleşen | Hesap | Sonuç |
|---|---|---|---|
| Tır · Un · 12 palet | #1 | sabit | **180 dk** |
| Tır · Un · 2 palet | #1 | sabit (miktardan bağımsız) | **180 dk** |
| Tır · Yağ · 12 palet | #2 | sabit | **90 dk** |
| Tır · Yağ · 3 palet | #5 | 20 + 3×2,5 = 27,5 → alt sınır 30 | **30 dk** |
| Tır · Yağ · 33 palet | #5 | 20 + 33×2,5 = 102,5 → 105 | **105 dk** |
| Kamyon · Yağ · 5 palet | #3 | sabit | **30 dk** |
| Kamyon · Yağ · 7 palet | #4 | sabit | **45 dk** |
| Kamyon · Yağ · 12 palet | — | eşleşme yok | **kategori taban süresi** |
| Kamyonet · Un · 80 çuval | #6 | 10 + 80×0,5 = 50 → 60 | **60 dk** |

> Not: müşterinin örneğindeki "5 palet ve altı" ile "5–10 palet" aralıkları 5'te çakışıyor; yukarıdaki tabloda 1–5 ve 6–10 olarak ayrıldı. Kesin aralıklar müşteriyle netleştirilecek.

## 7. Yönetim ekranı

- **Politika:** mod ve yuvarlama adımı.
- **Kurallar:** ekle / düzenle / sil / sırala / "en özel kural üste"; uygulanmayan kurallar uyarıyla gösterilir.
- **Deneme:** araç, kategori, birim ve miktar gir; sonucu, eşleşen kuralı ve hesap adımlarını gör.
- **Senaryo tablosu:** bir kategori ve birim için araç × miktar matrisi; kural boşlukları (kategori varsayılanına düşen hücreler) bir bakışta görünür.
