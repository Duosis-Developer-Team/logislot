# Source Extract

```text
[Normal] BTA
[Normal] CAKES & BAKES ÜRETİM TESİS
[Normal] Mal Kabul Randevu Sistemi
[Normal] ÖZELLİKLER DOKÜMANI
[Normal] Features / Functional Specification
[Normal] Sürüm 1.0
[Normal] Tarih: 4 Haziran 2026
[Normal] Hazırlayan: Ürün & Geliştirme Ekibi
[Heading 1] İçindekiler
[Heading 1] 1. Giriş
[Normal] Bu doküman, BTA Üretim A.Ş. için geliştirilen Mal Kabul Randevu Sistemi uygulamasının tüm özelliklerini ekran görüntüleri ile destekleyerek detaylandırır.
[Normal] Sistemin temel amacı; fabrikaların tedarikçi mal kabul süreçlerini dijitalleştirmek, rampa (dock) kullanımını optimize etmek, araç bekleme sürelerini en aza indirmek ve tüm randevu trafiğini tek bir merkezden, kurallara dayalı bir şekilde yönetmektir.
[Heading 2] 1.1. Kapsam
[Normal] Uygulama iki ana portaldan ve bunların altındaki modüllerden oluşur:
[List Paragraph] Tedarikçi Portalı — Sahada kullanım için "Mobile-First" tasarlanmış; tedarikçilerin randevu talep ettiği, takip ettiği ve yönettiği mobil arayüz.
[List Paragraph] Yönetim Paneli — Rampa/depo yöneticileri ve sistem yöneticileri için tasarlanmış; randevu onayı, takvim yönetimi, raporlama ve tüm sistem konfigürasyonunu içeren masaüstü arayüz.
[Heading 2] 1.2. Bu Dokümanın Okunması
[Normal] Her özellik; ne işe yaradığı, hangi kullanıcı rolü tarafından kullanıldığı ve ilgili iş kuralları ile birlikte açıklanır. Açıklamaların ardından özelliği gösteren ekran görüntüsü yer alır. Ekran görüntüleri uygulamanın demo sürümünden alınmıştır; veriler örnek amaçlıdır.
[Heading 1] 2. Kullanıcı Rolleri ve Erişim Modeli
[Normal] Sistem, rol bazlı erişim kontrolü (RBAC) ile çalışır. Her kullanıcı bir veya birden fazla role sahip olabilir; yetkiler role bağlı izinler üzerinden belirlenir. Aşağıda PRD ile uyumlu temel roller yer almaktadır.
[Heading 1] 3. Ortak Özellikler
[Heading 2] 3.1. Portal (Rol) Seçim Ekranı
[Normal] Uygulamaya girişte kullanıcı, kullanacağı portalı seçer. Her kart, ilgili portalın kısa açıklamasını ve demo hesap bilgisini gösterir. Seçim tarayıcıda saklanır; böylece kullanıcı bir sonraki girişinde doğrudan kendi portalına yönlendirilir.
[Heading 2] 3.2. Güvenli Kimlik Doğrulama
[Normal] Her iki portal da kullanıcı adı ve şifre ile güvenli giriş sağlar. Hatalı giriş denemelerinde kullanıcıya anlaşılır bir uyarı gösterilir. Tedarikçi ve kurumsal kullanıcılar ayrı giriş ekranlarından doğrulanır; bir portala tanımlı hesap diğer portala giriş yapamaz.
[Heading 1] 4. Tedarikçi Portalı
[Normal] Tedarikçi Portalı, sahadaki tedarikçi ve nakliyecilerin telefon üzerinden kolayca kullanabilmesi için "Mobile-First" yaklaşımıyla tasarlanmıştır. Alt kısımda sabit bir gezinme çubuğu (Randevularım, Yeni Randevu, Profil) bulunur.
[Heading 2] 4.1. Giriş Ekranı
[Normal] Tedarikçi, kendisine tanımlanan hesap bilgileriyle hızlıca giriş yapar. Ekran sade tutulmuş, demo hesap bilgileri kart üzerinde gösterilmiştir.
[Heading 2] 4.2. Randevularım (Ana Ekran)
[Normal] Giriş sonrası tedarikçi, üst kısımda firma bilgisi ve özet sayaçları (Yaklaşan, Bekleyen, Tamamlanan) ile karşılanır. Randevular "Yaklaşan" ve "Geçmiş" sekmelerine ayrılır. Her randevu kartında tarih, saat aralığı, rampa, ürün, miktar ve araç plakası ile birlikte anlık durum rozeti görüntülenir.
[Heading 2] 4.3. Anlık Durum Takibi ve Randevu Detayı
[Normal] Tedarikçi, bir randevu kartına dokunarak tüm detayları görüntüler. Talebin durumu ("Bekliyor", "Onaylandı", "Reddedildi", "Tamamlandı", "İptal") anlık olarak takip edilir. Randevu reddedildiyse red sebebi; firma tarafından saat revize edildiyse eski ve yeni aralık ile revizyon notu detayda gösterilir. Uygun durumdaki (gelecek tarihli, bekleyen veya onaylı) randevular bu ekrandan iptal edilebilir.
[Heading 2] 4.4. Yeni Randevu Oluşturma (3 Adımlı Sihirbaz)
[Normal] Randevu talebi, kullanıcıyı yönlendiren üç adımlı bir sihirbaz ile oluşturulur. İlerleme çubuğu, kullanıcının hangi adımda olduğunu net olarak gösterir.
[Heading 3] Adım 1 — Tarih, Saat ve Süre
[Normal] Tedarikçi önce gün seçer; ardından 30 dakikalık dilimler hâlinde başlangıç saatini belirler. Her saat dilimi, o anki rampa doluluğuna göre renklendirilir:
[List Paragraph] Müsait — boş, seçilebilir.
[List Paragraph] Kısmen dolu — bazı rampalar dolu (sarı uyarı); altındaki noktalar doluluk oranını gösterir.
[List Paragraph] Dolu — tüm rampalar dolu; seçilemez (üzeri çizili).
[Normal] Son olarak işlemin tahmini süresi seçilir. Seçilebilen süreler, tedarikçinin ve seçilen kategorinin minimum/maksimum blokaj limitlerine göre otomatik filtrelenir. Seçimler sonucunda talep edilen saat aralığı özetlenir.
[Heading 3] Adım 2 — Ürün Bilgisi
[Normal] Bu adımda ürün/malzeme adı, kategori, miktar ve birim girilir. Miktar birimleri lojistik standartlarına uygun olarak Palet, Adet, Kutu, Koli seçeneklerinden oluşur; mal kabul süreçlerinde işlevsel olmayan "KG" ibaresi bilinçli olarak kullanılmaz. Tedarikçi yalnızca kendisine tanımlı kategorilerden seçim yapabilir.
[Heading 3] Adım 3 — Araç, Tekrar ve Özet
[Normal] Son adımda araç plakası ve sürücü bilgisi girilir. Düzenli sevkiyatlar için randevu "Tekrarlayan" olarak işaretlenebilir (haftalık, 2 haftada bir, aylık). Ekranın altında talebin özeti gösterilir ve "Randevu Talep Et" ile gönderilir. Tedarikçinin "otomatik onay" yetkisi varsa randevu anında onaylanır; aksi hâlde firma onayına düşer ve yöneticiye bildirim gönderilir.
[Heading 2] 4.5. Profil
[Normal] Profil ekranında tedarikçinin firma adı, kodu, kategorisi, iletişim bilgileri ve otomatik onay durumu görüntülenir. Kullanıcı bu ekrandan oturumu kapatabilir.
[Heading 1] 5. Yönetim Paneli (Kurumsal)
[Normal] Yönetim Paneli; sol gezinme menüsü ile Genel Bakış, Takvim, Randevular, Raporlar ve Yönetim bölümlerine erişim sağlar. Menü, kullanıcının yetkilerine göre dinamik olarak şekillenir — yalnızca izinli olduğu bölümler görüntülenir.
[Heading 2] 5.1. Giriş Ekranı
[Normal] Kurumsal kullanıcılar koyu temalı giriş ekranından doğrulanır.
[Heading 2] 5.2. Genel Bakış (Dashboard)
[Normal] Genel Bakış ekranı, günün operasyonel özetini sunar. Üstte dört istatistik kartı yer alır: Bugünkü randevular, onay bekleyen talepler, bu haftaki toplam randevu ve aktif tedarikçi sayısı. Hemen altında onay bekleyen talepler ve günün programı listelenir; her kayda tıklanarak detay/işlem ekranı açılır.
[Heading 2] 5.3. Bildirimler
[Normal] Üst çubuktaki zil simgesi, okunmamış bildirim sayısını rozet olarak gösterir. Açılan panelde yeni randevu talepleri, tamamlanan randevular ve revizyon onayları listelenir. Bir bildirime tıklamak ilgili randevu detayını açar.
[Heading 2] 5.4. İnteraktif Planlama Takvimi
[Normal] Takvim, rampa doluluğunu kuş bakışı görmeyi sağlar. Günlük görünümde her rampa ayrı bir sütun olarak, randevular ise saat cetveli üzerinde zaman bloklarıyla gösterilir. Bloklar duruma göre renklendirilir (bekleyen, onaylı, tamamlanan). Bloklara tıklanarak randevu işlem ekranı açılır.
[Normal] Haftalık görünüm, yedi günün doluluğunu tek ekranda özetler. Bir güne tıklamak o günün detaylı görünümüne geçiş yapar.
[Heading 2] 5.5. Randevular Listesi
[Normal] Tüm randevular tek bir listede; tedarikçi/ürün araması, tarih filtresi ve durum filtreleri (Tümü, Bekliyor, Onaylandı, Tamamlandı, Reddedildi, İptal) ile süzülebilir. "Bekliyor" filtresinde bekleyen talep sayısı rozetle gösterilir. Her satır tarih/saat, rampa, tedarikçi, ürün, miktar ve durumu içerir.
[Heading 2] 5.6. Randevu Onay İş Akışı
[Normal] Bir randevuya tıklandığında tüm detayların yer aldığı işlem ekranı açılır. Yönetici, randevunun durumuna göre şu aksiyonları alabilir:
[List Paragraph] Onayla — bekleyen talebi onaylar.
[List Paragraph] Reddet — talebi reddeder; tedarikçiye iletilecek red sebebi zorunludur.
[List Paragraph] Revize Et — farklı bir saat ve/veya rampa önererek randevuyu günceller ve onaylar.
[List Paragraph] Tamamla — onaylı randevuyu mal kabul sonrası tamamlandı olarak işaretler.
[List Paragraph] İptal Et — randevuyu iptal eder.
[Normal] Revize akışında yönetici yeni başlangıç saatini, süreyi ve rampayı seçer; tedarikçiye iletilecek bir not ekleyebilir. Tedarikçinin orijinal talebi referans olarak gösterilir. Revizyon sonrası tedarikçi, randevu detayında eski ve yeni aralığı birlikte görür.
[Heading 2] 5.7. Raporlar ve İstatistikler
[Normal] Raporlar ekranı; toplam, tamamlanan, onaylanan ve reddedilen randevu sayılarını; kategoriye göre dağılımı; en aktif tedarikçileri ve rampa kullanım yoğunluğunu görsel grafiklerle özetler. Operasyonel planlama ve performans takibi için kullanılır.
[Heading 1] 6. Yönetim Modülü (Sistem Konfigürasyonu)
[Normal] Yönetim bölümü; İş Kuralları Motorunun beslendiği tüm tanımları içerir. Dört alt sekmeden oluşur: Kategoriler, Rampalar, Tedarikçiler ve Kullanıcılar & Roller. Her sekme, kullanıcının ilgili yetkisi varsa düzenlenebilir.
[Heading 2] 6.1. Kategoriler ve Dinamik Süre Blokajı
[Normal] Ürün kategorileri burada tanımlanır. Her kategori için tedarikçiye görünen ad ve minimum blokaj süresi belirlenebilir. Kalite kontrol süreci uzun olan ürünlerde (örneğin "Soğuk Zincir" — et, donuk, süt) sistem, randevu oluşturulduğunda rampayı otomatik olarak en az belirlenen süre kadar (örn. 60 dakika) bloke eder. Bu, Dinamik Süre Blokajı kuralıdır.
[Normal] Yeni kategori ekleme / düzenleme ekranında ad, tedarikçiye görünen ad, minimum blokaj süresi (dakika) ve açıklama girilir.
[Heading 2] 6.2. Rampa ve Kısıt Yönetimi
[Normal] Tesisteki rampalar; adı, notu (TIR uyumlu, soğuk zincir vb.), aktiflik durumu, çalışma saatleri, sorumlu kullanıcılar ve en önemlisi uygun kategoriler ile tanımlanır. Bir rampaya yalnızca atanmış kategorilerdeki ürünler yönlendirilebilir. Böylece "Un tedarikçisi yalnızca Rampa A’ya yanaşabilir" veya "Soğuk zincir yalnızca Rampa C’ye" gibi kısıtlar uygulanır; ilgili rampa doluysa sistem o ürünü başka rampalara açmaz.
[Heading 3] Kapasite ve İstisna Yönetimi (Takvim Override)
[Normal] Her rampa için standart çalışma düzeni dışında özel durumlar tanımlanabilir. "Kapalı" override’ı belirli bir günü randevuya kapatır (örn. bakım); "Ek/Mesai" override’ı bayram çalışması, acil durum veya fazla mesai için ek gün/slot açar. Bu sayede yöneticiler operasyonu esnek biçimde yönetir.
[Heading 2] 6.3. Tedarikçi Yönetimi
[Normal] Tedarikçi firmalar; iletişim bilgileri, izinli kategoriler, blokaj limitleri (min/maks süre), rezervasyon kotaları (haftalık/aylık) ve onay modeli (otomatik/manuel) ile tanımlanır. Bir tedarikçi yalnızca kendisine izin verilen kategorilerden randevu oluşturabilir; kota dolduğunda sistem yeni talebi engeller. Hesaplar aktifleştirilebilir/pasifleştirilebilir.
[Normal] Tedarikçi ekleme/düzenleme ekranı; firma bilgileri, izinli kategoriler, blokaj ve kota limitleri ile otomatik onay/aktiflik seçeneklerini içerir.
[Heading 2] 6.4. Kullanıcı ve Rol Yönetimi (RBAC)
[Normal] Kurum içi kullanıcılar; ad, kullanıcı adı, e-posta, roller ve (rampa yöneticileri için) yetkili oldukları rampalar ile tanımlanır. Tedarikçi hesapları, tedarikçi tanımlandığında otomatik oluşur.
[Normal] Roller & Yetkiler sekmesinde her rolün sahip olduğu izinler yönetilir. Varsayılan roller düzenlenebilir ancak silinemez. Yeni roller oluşturulabilir ve "rampa bazlı kısıtlama" ile bir rol yalnızca atanmış rampalarda yetkili kılınabilir.
[Normal] Rol düzenleme ekranında izinler tek tek işaretlenerek role atanır.
[Normal] 7. İş Kuralları Motoru (Business Rules Engine)
[Normal] Sistemin merkezinde, randevu taleplerini otomatik değerlendiren ve rampa tahsisini yapan bir kurallar motoru bulunur. Tedarikçi yalnızca kategori seçer; rampa atamasını sistem yapar. Motorun dikkate aldığı başlıca kurallar:
[List Paragraph] Kategori–Rampa Uygunluğu: Randevu yalnızca, seçilen kategoriyi kabul eden rampalara yönlendirilir.
[List Paragraph] Müsaitlik ve Çakışma Önleme: Aynı rampada zaman çakışması olan randevular engellenir; saat dilimleri doluluk durumuna göre tedarikçiye gösterilir.
[List Paragraph] Dinamik Süre Blokajı: Kalite kontrol süresi uzun kategorilerde rampa otomatik olarak minimum belirlenen süre kadar bloke edilir.
[List Paragraph] Çalışma Saatleri ve Override: Rampanın çalışma saatleri, kapalı günleri ve ek mesai tanımları hesaba katılır.
[List Paragraph] Tedarikçi Limitleri: Tedarikçiye özel min/maks blokaj süresi ve haftalık/aylık kotalar uygulanır.
[List Paragraph] Otomatik Onay: Otomatik onay yetkisi olan tedarikçilerin randevuları anında onaylanır; diğerleri yönetici onayına düşer.
[Heading 1] 8. Randevu Durumları (Statü Yaşam Döngüsü)
[Normal] Bir randevu, yaşam döngüsü boyunca aşağıdaki durumlardan geçebilir. Durum, hem tedarikçi hem de yönetici arayüzünde renkli rozetlerle anlık olarak gösterilir.
[Heading 1] 9. Fabrika Ziyareti Raporu
[Normal] Tarih: 9 Haziran 2026, Salı  Saat: 10:00 – 13:00  Yer: Cakes & Bakes Üretim Tesisi — Mal Kabul Sahası
[Normal] Katılımcılar: Ürün & Geliştirme Ekibi, Depo / Rampa Yönetimi
[Normal] Amaç: Mevcut mal kabul sürecini yerinde gözlemlemek; sistem geliştirme öncesinde sahaya özgü kısıt ve ihtiyaçları tespit etmek.
[Heading 2] 9.1. Tespit 1 — Rampa Kapasitesi ve Araç Tipi Kısıtı
[Normal] Tesiste toplam 3 rampa bulunmaktadır. Saha gözleminde aşağıdaki durum tespit edilmiştir:
[Heading 2] 9.2. Tespit 2 — Kalite Kontrol Süresi Randevuya Dahil Edilmiyor
[Normal] Gelen ürüne bağlı olarak kalite kontrol yapılması gerekmekte; bu süre sabit değildir. Ziyaret sırasında tespit edilen tablo:
[Heading 2] 9.3. Tespit 3 — Şehir Dışı Kargo Teslimatlarında Geliş Saati Belirsizliği
[Normal] Şehir dışından kargo ile gelen ürünlerin geliş saatleri taşıyıcı firmaya bağlı olarak değişiyor ve önceden kesin bilinemiyor. Ziyarette tespit edilen tablo:
[Heading 2] 9.4. Genel Değerlendirme ve Sonraki Adımlar
[Normal] Ziyarette tespit edilen 3 maddenin tamamı mevcut sistem mimarisiyle çözümlenebilir niteliktedir. Aşağıdaki özet tablo, tespitlerin hangi sistem bileşenine yansıtılacağını göstermektedir.
[Normal] Tespit edilen 3 maddenin tamamı mevcut sistem mimarisine uygun şekilde kapsama alınmıştır. Uygulama geliştirme sürecinde bu bulgular öncelikli gereksinimler olarak ele alınacaktır.

[TABLE 1]
Rol || Portal || Sorumluluk
Tedarikçi / Nakliyeci || Tedarikçi Portalı || Uygun saat dilimlerinde randevu oluşturur, randevularını takip eder ve gerektiğinde iptal eder.
Rampa / Depo Yöneticisi || Yönetim Paneli || Gelen randevuları takvim üzerinden görür; onaylar, reddeder, revize eder ve tamamlar. Yalnızca atanmış rampalarında yetkilidir.
Sistem Yöneticisi || Yönetim Paneli || Tedarikçi, kategori, rampa, kullanıcı ve rol tanımlarını yapar; tüm sistem konfigürasyonunu yönetir.
İzleyici (Planlama / Satın Alma) || Yönetim Paneli || Takvimi ve randevu durumlarını yalnızca görüntüler; atama veya müdahale yetkisi yoktur.

[TABLE 2]
Akıllı Rampa Yönlendirmesi | Tedarikçi manuel olarak rampa (R1, R2…) seçmez. Yalnızca ürün kategorisini seçer. Sistem, arka plandaki İş Kuralları Motorunu çalıştırarak o kategori için uygun rampaları, kalite kontrol sürelerini ve müsaitliği değerlendirir ve randevuya uygun rampayı otomatik atar. | Ürün kategorisine göre birden fazla rampanın etkilediği durumlar göz önünde bulundurularak atama yapılır.

[TABLE 3]
Durum || Açıklama
Bekliyor || Tedarikçi talebi oluşturdu; yönetici onayı bekleniyor.
Onaylandı || Randevu onaylandı (otomatik veya yönetici tarafından).
Revize Bekliyor || Yönetici farklı saat önerdi; tedarikçinin görüşü/onayı bekleniyor.
Reddedildi || Talep reddedildi; red sebebi tedarikçiye iletildi.
Tamamlandı || Mal kabul gerçekleşti ve randevu kapatıldı.
İptal || Randevu tedarikçi veya yönetici tarafından iptal edildi.

[TABLE 4]
Alan || Gözlem / Tespit
Durum || 1. veya 2. rampaya TIR yanaştığında her iki rampa birden doluyor; yalnızca 3. rampadan mal kabul yapılabiliyor.
Kısıt || 3. rampaya yalnızca kamyonet gibi küçük araçlar yanaşabiliyor; TIR ve büyük kamyon kabul edilemiyor.
Etki || TIR’lı teslimatlar geldiğinde kullanılabilir rampa sayısı 3’ten 1’e düşüyor; araç trafiğinde aksaklık riski oluşuyor.
Sistem Çözümü || Rampa tanımına “araç tipi” kuralı eklenir. 1. ve 2. rampaya TIR yanaştığında 3. rampanın yalnızca kamyonet kabul edeceği kural otomatik devreye girer; yanlış araç türünden randevu alan tedarikçiler uygun slota yönlendirilir (bkz. § 6.2).

[TABLE 5]
Alan || Gözlem / Tespit
Durum || Tedarikçi randevu alırken yalnızca teslimat süresini giriyor; kalite kontrol için gereken ek süre randevuya yansımıyor.
Etki || Rampalar planlanandan uzun süre meşgul kalıyor; ardından gelen araçlar beklemek zorunda kalıyor.
Sistem Çözümü || Ürün kategorisine tanımlanan kalite kontrol süresi, alınan randevunun zaman aralığına otomatik olarak eklenir (+15 dakika). Tedarikçinin seçebileceği minimum süre kalite kontrol süresinin de dahil edilmiş hali olur (minimum süre: 30 dakika + 15 dakika = 45 dakika); kalite kontrol sırasında rampaya başka araç yönlendirilmez (bkz. § 6.1).

[TABLE 6]
Alan || Gözlem / Tespit
Durum || Şehir dışı kargo taşıyıcıları teslimat saatini önceden bildiremiyor; araç bazen randevu saatinden çok önce ya da çok sonra geliyor.
Etki || Takvimde boşluk veya çakışma oluşuyor; sabit randevu saatine uymak güçleşiyor.
Sistem Çözümü || Uygulama yöneticisi, kargo kaynaklı randevuların saatini Yönetim Paneli üzerinden istediği zaman güncelleyebilir. Saat değişikliği kaydedildiğinde ilgili ekibe otomatik olarak e-posta gönderilir (bkz. § 5.6).

[TABLE 7]
# || Tespit || İlgili Sistem Bölümü
1 || TIR’da rampa kapasitesi daralıyor || Rampa ve Kısıt Yönetimi — Araç Tipi Kuralı (§ 6.2)
2 || Kalite kontrol süresi randevuya dahil edilmiyor || Kategoriler ve Dinamik Süre Blokajı (§ 6.1)
3 || Kargo geliş saati belirsizliği || Randevu Onay İş Akışı — Revize ve Otomatik E-posta (§ 5.6)
```
