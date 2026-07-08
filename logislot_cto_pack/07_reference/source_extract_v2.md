# Source Extract

```text
[] LOGISLOT
[] Akıllı Mal Kabul & Rampa Randevu Platformu
[] Mal Kabul Randevu Sistemi
[] SaaS Ürün & Mimari Dokümanı
[] Product & Architecture Specification (SaaS)
[] Sürüm 2.0
[] Tarih: 8 Temmuz 2026
[] Hazırlayan: Ürün & Geliştirme Ekibi
[] Bu doküman, Sürüm 1.0'ın (4 Haziran 2026) devamı niteliğindedir ve onu değiştirmez.
[Heading 1] İçindekiler
[Heading 1] 1. Giriş
[] LogiSlot Mal Kabul Randevu Sistemi, fabrikaların tedarikçi mal kabul süreçlerini dijitalleştiren; rampa (dock) kullanımını optimize eden, araç bekleme sürelerini azaltan ve tüm randevu trafiğini kurallara dayalı tek merkezden yöneten bir platformdur. Sürüm 1.0, tek bir müşteri (BTA / Cakes & Bakes Üretim Tesisi) için geliştirilen bir front-end prototip ve fonksiyonel spesifikasyondu.
[Heading 2] 1.1. v1.0'dan v2.0'a: Neden SaaS Dönüşümü?
[] Günün sonunda alınan stratejik karar nettir: sistem, tek bir müşteriye özel bir prototip olmaktan çıkıp birden fazla müşteriye satılabilen bir servise (SaaS — Software as a Service) dönüşecektir. Bu, sadece yeni özellik eklemek değil, ürünün temel mimarisini yeniden çerçevelemek anlamına gelir:
[List Paragraph] Çok kiracılılık (multi-tenant): Birden fazla bağımsız müşteri (tenant) aynı platformda, verileri birbirinden yalıtılmış şekilde barındırılır.
[List Paragraph] Alt hesaplar: Bir müşterinin birden fazla fabrikası/tesisi olabilir; her tesis ayrı ayrı görülebilir, ayırt edilebilir ve fiyatlandırılabilir olmalıdır.
[List Paragraph] Modüler / konfigüre edilebilir kurallar: Her tesis fiziksel olarak farklıdır; her müşteri için ayrı geliştirme yapmak sürdürülebilir değildir. Elimizdeki her şey dinamik, modüler ve kendi içinde konfigüre edilebilir olmalıdır.
[List Paragraph] Platform yönetimi: Ürünün sahibi olarak bizim de tüm müşterileri inceleyebileceğimiz, analiz edebileceğimiz ve fiyatlandırabileceğimiz bir üst katmana ihtiyacımız vardır.
[] Buna paralel olarak, saha kullanımı ve müşteri talepleri doğrultusunda dört yeni işlevsel ihtiyaç da bu sürümde ele alınmaktadır: araç kategorisi, kargo teslimat akışı, konfigüre edilebilir rampa ilişkileri ve konfigürasyon arayüzlerinin iyileştirilmesi.
[Heading 2] 1.2. Kapsam
[] Bu doküman, hedef v2.0 sisteminin bütününü ürün ve mimari seviyesinde tanımlar. Odak; hangi varlıkların (entity) var olduğu, aralarındaki ilişkiler, her katmanın hangi konfigürasyonlara ihtiyaç duyduğu ve gereken ekran/akışlardır. Doküman bilinçli olarak belirli bir teknoloji yığınına (backend framework, veritabanı motoru), API sözleşmelerine veya kod/şema detayına girmez — bunlar mühendislik tasarımına bırakılmıştır.
[Heading 2] 1.3. v1.0 ile İlişki: Korunanlar ve Değişenler
[] v2.0, v1.0'ın üzerine eklemeli (additive) olarak inşa edilir. Halihazırda çalışan hiçbir işlev yeniden tasarlanmaz; yalnızca genişletilir. Aşağıdaki tablo temel farkları özetler.
[Heading 2] 1.4. Bu Dokümanın Okunması
[] Her bölüm; ilgili kavramın ne işe yaradığını, hangi varlıkları/alanları içerdiğini ve ilgili iş kurallarını açıklar. Yeni özellikler, kod tabanındaki mevcut desenlere (mevcut kategori editörü, takvim renk haritaları, üç adımlı sihirbaz vb.) referansla anlatılır; böylece geliştirme ekibi neyin yeniden kullanılacağını ve neyin ekleneceğini net görebilir.
[Heading 1] 2. SaaS Mimari Modeli (Çok Kiracılı Yapı)
[Heading 2] 2.1. Genel Yapı: Tenant → Tesis → Operasyon
[] v2.0 mimarisi üç katmanlı bir sahiplik hiyerarşisi üzerine kurulur:
[List Paragraph] Tenant (Ana Müşteri Hesabı): Platformun sattığı en üst düzey müşteri. Operasyonel veri tutmaz; yalnızca kimlik, faturalama ve plan bilgisini taşır.
[List Paragraph] Tesis / Alt Hesap (Facility): Bir tenant'a bağlı fiziksel mal kabul lokasyonu (fabrika, depo, mal kabul sahası). Tüm operasyonel konfigürasyon bu seviyede yaşar.
[List Paragraph] Operasyonel Veri: Kategoriler, rampalar, tedarikçiler, kullanıcılar ve randevular — hepsi bir tesise bağlıdır.
[Heading 2] 2.2. Tenant (Ana Müşteri Hesabı)
[] Alanlar: ticari unvan, görünen ad, durum (deneme / aktif / askıda / ayrılmış), oluşturulma tarihi, birincil iletişim ve fatura kişileri, varsayılan dil/saat dilimi, atanmış plan, notlar.
[] İlişki: Bir tenant, bir veya birden fazla tesisin üstündedir. Rol, kategori, rampa, tedarikçi ve randevu gibi tüm operasyonel konfigürasyon bir tesise, tesis de bir tenant'a bağlıdır. Böylece tenant yalnızca kimlik/faturalama/plan sarmalayıcısı olarak kalır.
[Heading 2] 2.3. Tesis / Alt Hesap (Facility)
[] Tesis, v1.0'daki örtük "tek fabrika" varsayımının yerine geçen açık ve tekrarlanabilir birimdir. Alanlar: bağlı tenant, ad, adres/lokasyon, saat dilimi, durum (aktif/pasif), varsayılan çalışma profili (yeni rampalar oluşturulurken uygulanan varsayılan çalışma saatleri) ve opsiyonel plan override (bir tesisin, tenant varsayılanından farklı bir plana sahip olabilmesi — havalimanı senaryosunda fiyatlandırmanın tesis bazlı olabilmesi için).
[] En büyük yapısal değişiklik budur: Mevcut tüm varlıklar (Kategori, Rampa, Tedarikçi, Kullanıcı, Randevu) artık bir tesis kimliği taşır ve global değil, tesis kapsamlı hale gelir. v1.0'da tek bir örtük tesis varken, v2.0'da tesis açık ve her tenant için tekrarlanabilirdir.
[Heading 2] 2.4. Plan ve Fiyatlandırma Profili
[] Plan varlığı, hiçbir ticari modeli sabitlemeyecek şekilde bilinçli olarak soyut tasarlanmıştır. Alanlar:
[List Paragraph] Ad ve kapsam: Plan tenant seviyesinde mi yoksa tesis seviyesinde mi geçerli (hem sabit-per-tenant hem per-tesis modelleri desteklenir).
[List Paragraph] Faturalama birimi: Açık uçlu bir etiket — sabit / randevu-başı / aktif-rampa-başı / tesis-başı / karma. Bu bir etikettir, zorlayıcı mantık değildir.
[List Paragraph] Ölçülebilir boyutlar listesi: Platformun ölçebileceği sayılabilir metriklerin genel listesi (oluşturulan randevu, tamamlanan randevu, aktif rampa, aktif tedarikçi, aktif kullanıcı). Liste olarak tutulur; böylece gelecekteki fiyatlandırma herhangi bir alt kümeyi seçebilir.
[List Paragraph] Rate-card (ücret kartı): Jenerik yapı — {boyut, birim fiyat, dahil kota, aşım kuralı}. Finans ekibi asıl rakamları veri modeli değişmeden sonradan tanımlayabilir.
[List Paragraph] Geçerlilik tarihleri ve durum: Plan değişiklikleri/yükseltmeleri zaman içinde yönetilebilir (taslak/aktif/emekli).
[Heading 2] 2.5. Mevcut (v1.0) Verinin Dönüşümü
[] Mevcut BTA verisinin (tek örtük tesis) v2.0'da ne olacağı belirsiz bırakılmaz: mevcut kurulum, tek bir tenant ve o tenant'a bağlı tek bir tesis haline gelir. Tüm mevcut kategori, rampa, tedarikçi, kullanıcı ve randevu kayıtları bu tesise bağlanır. Bu bir veri taşıma (migration) konusudur; ancak mimari, sonuç durumunu net biçimde tarif eder.
[Heading 1] 3. Platform Yönetim Katmanı (Vendor / Süper-Admin)
[Heading 2] 3.1. Neden Yeni Bir Katman Gerekiyor?
[] v1.0'daki en yetkili rol "Sistem Yöneticisi"dir ve bu rol tenant/tesis kapsamlıdır — yani en üst rol bile tek bir müşterinin verisi içinde çalışır. Platform sahibi olarak bizim, tüm tenant'ların üstünde duran; hiçbir müşterinin rol listesinin parçası olmayan ve kendi izin uzayına sahip yeni bir katmana ihtiyacımız vardır. Bu katman analiz, müşteri sağlığı takibi ve (ileride) faturalama gözetimi için gereklidir.
[Heading 2] 3.2. Platform Rolleri ve İzin Modeli
[List Paragraph] PlatformUser: Yapısal olarak tenant kullanıcısına paralel; ancak bir tenant/tesise değil, doğrudan platform işletmecisine (SaaS sağlayıcının kendi personeline) bağlıdır.
[List Paragraph] PlatformRole: Kendi izin uzayına sahiptir (örn. platform.tenant.görüntüle / yönet, platform.faturalama.görüntüle, platform.analiz.görüntüle, platform.impersonate). Bu izinler tenant seviyesindeki izin listesinden yapısal olarak ayrıdır ve birleştirilmez — böylece bir tenant Sistem Yöneticisi platform izinlerini asla göremez veya veremez, tersi de geçerlidir.
[Heading 2] 3.3. Platform Ekranları
[List Paragraph] Tenant dizini: Tüm müşterileri listeleme/arama; her tenant'ın tesis listesine, durumuna, planına ve iletişim bilgilerine inebilme.
[List Paragraph] Tesis dizini (tenant'lar arası): Destek/operasyon için tenant'tan bağımsız tüm tesisleri görebilme.
[List Paragraph] Kullanım / sağlık metrikleri: Tenant ve tesis bazında randevu hacim trendi, aktif rampa/tedarikçi sayısı, aktivite güncelliği, onay SLA'sı (bekleyen randevularda karar süresi). Bu metrikler, Plan'ın ölçülebilir boyutlarıyla aynı sözlüğü kullanır; böylece analiz görünümü ile faturalama modeli tek bir dil konuşur.
[List Paragraph] Plan/fiyat görünümü: Tenant/tesis bazında atanmış plan, geçerlilik tarihleri ve plan atamasını değiştirme (fatura hesaplamaz — o gelecek kapsam).
[Heading 2] 3.4. Veri Erişim İlkesi
[Heading 1] 4. Kullanıcı Rolleri ve Erişim Modeli (RBAC v2.0)
[] Sistem, rol bazlı erişim kontrolü (RBAC) ile çalışmaya devam eder. v1.0'ın tenant içi rolleri korunur; üzerlerine platform katmanı eklenir. Aşağıdaki tablo bütünleşik modeli özetler.
[] Tenant seviyesindeki izinler (appt.view, appt.approve, category.manage, dock.manage, supplier.manage, user.manage, report.view, calendar.override) v1.0'daki gibi korunur. Platform izinleri bunlardan tamamen ayrı bir uzayda tutulur.
[Heading 1] 5. Alan Modeli Genişletmeleri
[] Bu bölüm, v2.0'ın getirdiği yeni kavramları ve mevcut varlıklara yapılan eklemeli değişiklikleri tanımlar. Tüm değişiklikler eklemelidir; mevcut alanlar korunur.
[Heading 2] 5.1. Araç Kategorisi
[] Bugün araç yalnızca serbest-metin bir plakadır. v2.0, ürün kategorisiyle aynı seviyede birinci sınıf bir Araç Kategorisi kavramı getirir. Tesis kapsamlıdır ve mevcut Kategori varlığının şekline yakındır. Alanlar: ad (örn. TIR, Kamyon, Kamyonet, Kargo/Parsel Aracı), görünen ad, açıklama, fiziksel not (örn. "uzun şasi, geri manevra alanı gerekir" — bilgilendirici, v2.0'da zorlayıcı kural alanı değil).
[Heading 2] 5.2. Ürün Kategorisi → Varsayılan Araç Eşlemesi
[] Mevcut Kategori varlığına varsayılan araç kategorisi alanı eklenir. Bu, minimum blokaj süresinin (minBlockMin) kategori üzerinde yaşamasıyla birebir aynı mantıktır — aynı konfigürasyon yüzeyi, aynı editör ekranı. Örneğin "Soğuk Zincir" (et, donuk, süt) kategorisi geldiğinde varsayılan olarak frigorifik/soğutuculu araç; genel varsayılan ise TIR olabilir.
[List Paragraph] Randevu seviyesinde override: Randevuya bir araç kategorisi alanı eklenir; oluşturma anında ürün kategorisinin varsayılanından doldurulur, ancak mal getiren tarafça (tedarikçi) değiştirilebilir (bkz. Bölüm 7). Mevcut serbest-metin plaka alanı fiziksel plaka için olduğu gibi korunur; araç kategorisi eklemedir, yerine geçmez.
[List Paragraph] Rampa uyumluluğu: Rampaya "kabul edilen araç kategorileri" listesi eklenir (mevcut kategori-uygunluk listesiyle aynı şekil/ruh); böylece bir rampa "yalnızca Kamyonet ve Kargo kabul ederim, TIR etmem" diyebilir. Bu, saha tespiti #1'deki 3. rampa kısıtını genel biçimde formüle eder.
[Heading 2] 5.3. Rampa İlişki / Çakışma Grupları
[] Saha tespiti #1'in genelleştirilmiş cevabıdır: "rampaya araç kuralını hardcode et" yaklaşımının yerine konfigüre edilebilir bir yapı gelir. Örnek senaryo: bu fabrikada üç rampa var; ikisi yan yana, biri dışarıda. 1. veya 2. rampaya TIR yanaştığında ikisi birden bloke oluyor.
[] Alanlar: tesis, ad (örn. "Rampa 1-2 Bitişik Blok"), ilişki tipi (karşılıklı-bloke = birini işgal etmek diğerini tamamen kapatır; paylaşımlı-kapasite = iki rampa tek fiziksel kapasiteyi paylaşır; koşullu = yalnızca bir koşulda çakışır), üye rampalar (2+), tetik koşulu (örn. yalnızca araç kategorisi = TIR ise — böylece aynı grup varlığı, başka tesisler için araçtan bağımsız "her zaman çakış" senaryosunu da destekler), aktif/pasif.
[] İlişki: Müsaitlik/çakışma kontrol mantığı, bir rampaya randevu yerleştirilirken o rampa aktif bir çakışma grubunun üyesiyse, aynı zaman penceresi için gruptaki kardeş rampaları da kontrol eder.
[Heading 2] 5.4. Kargo / Teslimat Tipi
[] Yeni bir varlık değil, Randevu üzerine eklenen yeni alanlardır (tam akış için bkz. Bölüm 8): teslimat tipi (standart | kargo) ve kargo seçildiğinde kaba beklenen pencere (sabah/öğleden sonra/tüm gün — taahhüt edilen kesin slot DEĞİL) ile kargo minimum blokaj süresi (tesis bazlı varsayılan, örn. 90 dk; randevu bazında admin tarafından düzenlenebilir).
[Heading 2] 5.5. Varlık İlişkileri Özeti
[] Ayrıca tüm operasyonel varlıklar bir tesis kimliği kazanır ve global değil tesis kapsamlı hale gelir.
[Heading 1] 6. İş Kuralları Motoru v2.0 (Tesis Bazlı Konfigürasyon)
[] v1.0'da uygunluk, çakışma kontrolü, süre kuralları, çalışma saatleri, kotalar ve otomatik onay bileşenler arasına dağılmış satır-içi mantıktı. v2.0, bunları tek bir mantıksal Tesis Kuralları Konfigürasyonu katmanı olarak çerçeveler. Dört kural ailesi, her tesis için ayrı ayrı konfigüre edilebilir (kod dağıtımıyla değil).
[Heading 2] 6.1. Temel Fikir: Sert Kurallar vs. Tavsiye Kuralları
[Heading 2] 6.2. Kategori-Süre Kuralları (Korunur)
[] Kategorinin minimum blokaj süresi mekanizması aynen kalır; yalnızca admin arayüzü iyileştirilir (bkz. Bölüm 9). Yeni bir kural şekli gerekmez. Saha tespiti #2 (kalite kontrol süresinin randevuya dahil edilmesi — kategoriye +15 dk eklenmesi) tam olarak bu mevcut mekanizmayla karşılanır. Uygulayıcıların bu kısmı gereğinden fazla mühendislememesi için doküman bunu "olduğu gibi taşınır" diye açıkça belirtir.
[Heading 2] 6.3. Araç-Rampa Uyumluluğu (Yeni — Sert Kural)
[] Rampanın kabul edilen araç kategorileri ile ürün kategorisinin varsayılan araç kategorisi tarafından yönetilir. Randevu oluşturma anında değerlendirme sırası:
[List Paragraph] Araç kategorisi çözümlenir — tedarikçi override verdiyse o, yoksa kategori varsayılanı.
[List Paragraph] Uygun rampalar filtrelenir: kategori uygunluğu VE araç kategorisi uygunluğu sağlayan rampalar (boş "kabul edilen araç" listesi = tüm araç tiplerini kabul → mevcut rampalarla geriye uyumluluk).
[] Bu bir sert/engelleyici kuraldır: uygun olmayan bir rampaya randevu yerleştirilemez.
[Heading 2] 6.4. Rampa Çakışma Grupları (Yeni — Sert Kural)
[] Rampa İlişki varlığı tarafından yönetilir. Değerlendirme: bir rampa için belirli bir zaman penceresinde müsaitlik kontrol edilirken, o rampanın karşılıklı-bloke veya paylaşımlı-kapasite tipli aktif bir çakışma grubunda birlikte yer aldığı her diğer rampa da kontrol edilir; tetik koşulu tanımlıysa (örn. yalnızca araç kategorisi = TIR), koşul eşleşiyorsa uygulanır. Bu da sert/engelleyici bir kuraldır ve saha tespiti #1'i genelleştirir — bir sonraki tesisin farklı fiziksel yerleşimi kodla değil, admin tarafından konfigüre edilir.
[Heading 2] 6.5. Bilgilendirme / Uyarı Katmanı (Yeni — Tavsiye Kuralı)
[] Deterministik olarak kurallanamayan durumlar için (kargo amiral örnek; ancak doküman bunu genel bir konfigüre edilebilir katman olarak çerçeveler). Bu katmandaki bir kural hiçbir şeyi engellemez veya otomatik yerleştirmez — yalnızca koşulu sağlandığında görsel/bildirim sinyali katar (örn. bu günde bu rampada teslimat tipi = kargo olan bir randevu var). "Sert kural vs. tavsiye kuralı" ayrımını öne çıkarmak, bu dokümanın vurgulaması gereken temel mimari fikirdir.
[] Dört ailenin tamamı tesis seviyesi konfigürasyon kayıtları olarak tanımlanır (tenant veya global değil), çünkü ürün sahibinin çerçevesi (her tesis farklıdır) doğal kapsamın Tesis olduğunu gösterir; Tenant yalnızca faturalama/kimlik sarmalayıcısıdır.
[Heading 1] 7. Tedarikçi Portalı — Yenilenen Randevu Sihirbazı
[Heading 2] 7.1. Adım Sıralaması Değişikliği ve Gerekçesi
[] v1.0 sihirbazının sırası şuydu: Adım 1 Tarih/Saat/Süre → Adım 2 Ürün → Adım 3 Araç. v2.0'da sıra tersine çevrilir: önce ürün ve araç, sonra zaman.
[Heading 2] 7.2. Adım 1 — Ürün ve Kategori
[] Tedarikçi önce ürün/malzeme adı, kategori, miktar ve birimi girer. Miktar birimleri lojistik standartlarına uygundur (Palet, Adet, Kutu, Koli). Tedarikçi yalnızca kendisine tanımlı kategorilerden seçebilir. Kategori seçimi; varsayılan araç kategorisini, uygun rampaları ve minimum süre kurallarını arka planda çözümler (Akıllı Rampa Yönlendirmesi — tedarikçi manuel rampa seçmez).
[Heading 2] 7.3. Adım 2 — Araç ve Teslimat Tipi
[List Paragraph] Araç kategorisi seçici: Adım 1'deki ürün kategorisinden çözümlenen varsayılanla önceden doludur, ancak değiştirilebilir. Örneğin soğuk zincir varsayılanı frigorifik TIR iken, bu sevkiyat daha küçük bir soğutuculu kamyonetle yapılıyorsa tedarikçi bunu buradan seçebilir.
[List Paragraph] Araç plakası ve sürücü: Mevcut serbest-metin plaka ve sürücü alanları korunur.
[List Paragraph] Teslimat tipi seçici: "Standart Randevu" veya "Kargo (Belirsiz Varış)". Kargo seçimi, bir sonraki adımın (zaman) davranışını değiştirir (bkz. Bölüm 8).
[Heading 2] 7.4. Adım 3 — Tarih, Saat ve Süre
[] Tedarikçi gün seçer; ardından 30 dakikalık dilimler halinde başlangıç saatini belirler. Her saat dilimi, o anki rampa doluluğuna göre renklendirilir (Müsait / Kısmen dolu / Dolu). Araç ve ürün önceden sabitlendiği için gösterilen doluluk, uygun rampalar ve çakışma grupları hesaba katılmış gerçek müsaitliktir. Son olarak işlemin tahmini süresi seçilir; seçilebilir süreler, tedarikçinin ve kategorinin min/maks blokaj limitlerine göre otomatik filtrelenir.
[Heading 2] 7.5. Özet ve Talep
[] Kapanışta talebin özeti gösterilir. Mevcut özet bloğu (Tarih/Aralık/Ürün/Miktar/Araç) korunur; araç kategorisi için bir satır eklenir. Düzenli sevkiyatlar için randevu "Tekrarlayan" (haftalık / 2 haftada bir / aylık) işaretlenebilir. "Randevu Talep Et" ile gönderilir; tedarikçinin otomatik onay yetkisi varsa anında onaylanır, aksi halde yönetici onayına düşer.
[Heading 1] 8. Kargo Akışı — Uçtan Uca
[] Kargo, v1.0'daki saha tespiti #3'ün (şehir dışı kargo geliş saati belirsizliği) ötesine geçen yeni bir nüanstır. Kargolar kesin bir saat diliminde gelmez — gün içinde bir zamanda gelir ve geldiğinde bir rampayı asgari ~1-2 saat bloke eder. Bunun ne zaman olacağını kesin bilemeyiz; bu yüzden katı deterministik bir kural yazamayız. Çözüm, engellemek değil görünürlük/farkındalık sağlamaktır.
[Heading 2] 8.1. Tedarikçi Tarafı
[] Sihirbazın 2. adımında (Araç ve Teslimat Tipi) tedarikçi "Kargo (Belirsiz Varış)" seçebilir. Bu durumda 3. adım kesin saat yerine kaba bir pencere (sabah / öğleden sonra / tüm gün) toplayacak şekilde davranır. Kargo, araç kategorisinden ayrı, bağımsız bir parametredir — tedarikçi "ben kargoyum" diyebilir.
[Heading 2] 8.2. Takvimde Görselleştirme (Uyarı Katmanı)
[] Mevcut durum renk-kodlama deseni (takvimdeki statü arka plan/kenarlık haritaları) yeniden kullanılır; ancak üzerine ikinci bir görsel boyut eklenir. Teslimat tipi = kargo olan bir randevunun bulunduğu gün/rampa hücresi, randevunun onay durumundan bağımsız olarak farklı bir dolgu/rozet/kenarlık ile işaretlenir. Amaç: planlamacı takvime bakınca "Perşembe, Rampa 2 — kargo gelebilir, boşluk bırak" mesajını, oraya başka randevu koymadan önce görebilsin.
[Heading 2] 8.3. Varış ve Onay/Revize Akışı (Değişmez)
[] Kargo aracı fiilen geldiğinde, mevcut randevu işlem ekranındaki "Revize Et" aksiyonu bugünküyle birebir aynı şekilde kullanılır — rampa yöneticisi saat aralığını gerçek varışa göre düzenler; sistem revizyon geçmişini, eski/yeni aralığı ve revizyon notunu zaten olduğu gibi tutar; saha tespiti #3'teki "ilgili ekibe otomatik e-posta" davranışı geçerli ve değişmez kalır. Doküman açıkça belirtir: kargo yalnızca varış-öncesi bir görünürlük katmanı ekler; varış-sonrası admin akışı zaten uygulanmış olan Onayla / Revize Et / Reddet / Tamamla / İptal setidir — yeni statü yok, yeni modal yok.
[Heading 2] 8.4. Kota ve Raporlama Etkisi
[] Kargo randevuları, tedarikçi kotalarına ve raporlara herhangi bir randevu gibi dahil edilir (özel muafiyet yok). Onları ayıran tek şey planlama hassasiyeti ve görsel muameledir, iş muhasebesi değil.
[Heading 1] 9. Yönetim Modülü — Konfigürasyon Ekranları v2.0
[] Yönetim bölümü, iş kuralları motorunu besleyen tüm tanımları içerir. v2.0'da mevcut sekmelere (Kategoriler, Rampalar, Tedarikçiler, Kullanıcılar & Roller) araç kategorileri ve rampa çakışma grupları eklenir.
[Heading 2] 9.1. Kategoriler (Varsayılan Araç Eklendi)
[] Mevcut ürün-kategori editörü ekranına tek bir yeni alan eklenir — "Varsayılan Araç Kategorisi" açılır listesi — mevcut minimum blokaj süresi alanının yanına, aynı etiket/ipucu desenini izleyerek. Böylece kategori konfigürasyonu, ürün-kategori ve araç-varsayılan ayarını iki ayrı yere bölmeden tek bir birleşik ekran olarak kalır.
[Heading 2] 9.2. Araç Kategorileri (Yeni Ekran)
[] Mevcut Kategori yönetim ekranıyla yapısal olarak paralel yeni bir "Araç Kategorileri" admin ekranı eklenir; aynı editör-modal şeklini (ad, görünen ad, açıklama) artı araç-kategorisine özgü alanları (fiziksel not) yeniden kullanır. Bu, mevcut kategori editörünün değiştirilmesi değil, kardeş bir ekrandır.
[Heading 2] 9.3. Rampalar (Kabul Edilen Araçlar + Çakışma Grubu)
[List Paragraph] Kabul edilen araç kategorileri: Mevcut rampa editörüne, kategori-uygunluk listesinin yanına yeni bir çoklu seçim eklenir; geriye uyumluluk için varsayılan olarak tümü (boş liste) kabul edilir.
[List Paragraph] Çakışma grubu yönetimi: Rampalar arası ilişkiler (karşılıklı-bloke / paylaşımlı-kapasite / koşullu), üye rampalar ve tetik koşulu buradan tanımlanır. Grup üyeliği, çift yönlü senkron hatalarından kaçınmak için grup varlığında tutulur; rampa üzerine ayrı bir alan olarak değil.
[Heading 2] 9.4. Arayüz Tasarımı ve Markalaşma (White-Label)
[] Ek olarak, konfigürasyon arayüzleri (kategori, rampa, tedarikçi ekranları) görsel olarak iyileştirilecek; yeni araç-kategorisi ve çakışma-grubu ekranlarıyla tutarlı, tek ve modern bir konfigürasyon deneyimi hedeflenecektir. Bu iyileştirme yeni mantık getirmez.
[Heading 1] 10. Randevu Durumları (Statü Yaşam Döngüsü)
[] Randevu durumları v1.0'dan korunur ve değişmez. Durum, hem tedarikçi hem yönetici arayüzünde renkli rozetlerle anlık gösterilir. Kargo, yeni bir statü eklemez; yalnızca varış-öncesi görsel bir uyarı katmanı ekler.
[Heading 1] 11. Riskler ve Kararlar
[] Aşağıdaki noktalar, dokümanın tek parça hedef-durum kurgusuna rağmen, uygulama sırasında dikkat edilmesi gereken bağımlılıklar ve açık kararlardır.
[] Bu doküman, onaylanan v2.0 planından üretilmiştir ve Sürüm 1.0 dokümanını değiştirmez. Detaylı görsel tasarım, veri taşıma planı ve mühendislik tasarımı ayrı çalışmalar olarak ele alınacaktır.

[TABLE 1]
Sürüm notu — Fiyatlandırma: Ticari fiyatlandırma modeli (sabit abonelik, kullanım bazlı veya karma) henüz kesinleşmemiştir. Bu nedenle Plan/Fiyat veri modeli, hangi model seçilirse seçilsin uyarlanabilecek şekilde esnek ve agnostik tasarlanmıştır. Fiili fatura hesaplama motoru bu sürümün kapsamı dışındadır.

[TABLE 2]
Konu || v1.0'da Durum || v2.0'da Durum
Kategori bazlı süre blokajı || Mevcut (minimum blokaj süresi + admin ekranı) || Korunur; sadece arayüz cilası
Operatör saat kontrolü || Mevcut (Onayla/Reddet/Revize/Tamamla/İptal) || Aynen korunur, değişmez
Takvim renk-kodlaması || Duruma göre renkli bloklar || Korunur; üzerine kargo uyarı katmanı eklenir
Araç bilgisi || Sadece serbest-metin plaka || Yeni: birinci sınıf Araç Kategorisi kavramı
Rampa ilişkileri || Her rampa bağımsız (ilişki yok) || Yeni: konfigüre edilebilir çakışma grupları
Kiracı / müşteri || Yok — tüm veri tek fabrikaya global || Yeni: Tenant → Tesis hiyerarşisi
Platform yönetimi || Yok || Yeni: Vendor/Süper-Admin katmanı

[TABLE 3]
Havalimanı analojisi: Bir havalimanı işletmecisini düşünelim — birden fazla lokasyonu ve her lokasyonda mal kabul alanları vardır. İşletmeci = Tenant; her lokasyon = Tesis (alt hesap). Bunları ayrı ayrı görebilmemiz, ayırt edebilmemiz ve ayrı ayrı fiyatlandırabilmemiz gerekir. Yapı tam olarak bunu karşılar.

[TABLE 4]
Tasarım ilkesi: Plan bir politika kabıdır, faturalama motoru değildir. v2.0 mimarisi yalnızca "neyin, nasıl ölçüleceği"nin veri şeklini tanımlar. Gelecekteki bir faturalama modülünün okuyabileceği yapı bugün var olmalıdır; ancak fiili fatura/metre hesaplaması bu sürümün kapsamı dışındadır.

[TABLE 5]
İlke — Varsayılan olarak en az yetki: Platform katmanı, varsayılan olarak bir tenant'ın operasyonel verisine veya kişisel verilere (PII) erişemez; yalnızca agregat sayıları görür. Destek amaçlı erişim (impersonation), yalnızca açıkça verilmiş ve loglanan bir yetkiyle mümkündür. Tam denetim-loglama mekaniği mühendislik detayıdır; ancak bu ilke bir gereksinim olarak baştan belirtilmelidir.

[TABLE 6]
Rol || Katman / Kapsam || Sorumluluk
Platform Yöneticisi (Vendor) || Platform (tüm tenant'lar üstü) || Tenant/tesis yönetimi, kullanım analizi, plan atama, müşteri sağlığı. Operasyonel veriye varsayılan erişim yok.
Sistem Yöneticisi || Tenant / Tesis || Tesis içi tedarikçi, kategori, araç kategorisi, rampa, kullanıcı ve rol tanımlarını yapar; tüm tesis konfigürasyonunu yönetir.
Rampa / Depo Yöneticisi || Tesis (atanmış rampalar) || Randevuları takvimde görür; onaylar, reddeder, revize eder, tamamlar. Yalnızca atanmış rampalarında yetkilidir.
İzleyici (Planlama / Satın Alma) || Tesis (salt okunur) || Takvimi ve randevu durumlarını yalnızca görüntüler; müdahale yetkisi yoktur.
Tedarikçi / Nakliyeci || Tesis (kendi randevuları) || Uygun akışta randevu oluşturur, takip eder, gerektiğinde iptal eder.

[TABLE 7]
Varlık || Değişim || Not
Tenant || Yeni || Kimlik + faturalama + plan sarmalayıcısı
Tesis (Facility) || Yeni || Tüm operasyonel konfigürasyonun kapsamı
Plan / Fiyat Profili || Yeni || Esnek, agnostik politika kabı
Araç Kategorisi || Yeni || Ürün kategorisiyle aynı seviyede, tesis kapsamlı
Rampa Çakışma Grubu || Yeni || Konfigüre edilebilir rampa ilişkileri
Kategori || Ekleme || + varsayılan araç kategorisi (minBlockMin korunur)
Rampa (Dock) || Ekleme || + kabul edilen araç kategorileri; çakışma grubu üyeliği
Randevu || Ekleme || + araç kategorisi, teslimat tipi, kargo alanları
Tedarikçi || Değişmez || Araç seçimi ziyaret bazlı → randevu seviyesinde
Kullanıcı / Rol || Değişmez (tenant içi) || Üzerine platform katmanı eklenir (Bölüm 3-4)

[TABLE 8]
v2.0'ın öne çıkardığı temel mimari fikir: Kurallar iki katmana ayrılır. Sert kurallar bir şeyi engeller veya otomatik yerleştirir (araç-rampa uyumu, çakışma grupları). Tavsiye/uyarı kuralları hiçbir şeyi engellemez; yalnızca görsel/bildirim sinyali üretir. Bu ayrım, "bazı kısıtlar otomatikleştirilemez, ama görünürlük yine de değerlidir" sorusunun genellenebilir cevabıdır — kargo günü bunun amiral örneğidir; gelecekteki öngörülemez senaryolar da bu katmanı yeniden kullanır.

[TABLE 9]
Adım || v1.0 || v2.0
1 || Tarih, Saat ve Süre || Ürün Bilgisi (kategori)
2 || Ürün Bilgisi || Araç ve Teslimat Tipi
3 || Araç, Tekrar ve Özet || Tarih, Saat, Süre + Özet

[TABLE 10]
Neden bu değişiklik? Araç ve ürün, zamandan önce sabitlendiğinde, zaman adımındaki doluluk göstergeli takvim zaten rampa uygunluğu ve çakışma grubu değerlendirmesini içerir — yani gösterilen müsaitlik gerçek müsaitliktir. Bu, önceki tasarımdaki açık riski (Adım 3'te araç değişince Adım 1'de seçilen rampanın geçersizleşmesi) yapısal olarak ortadan kaldırır; geri dönüp yeniden doğrulama gerekmez.

[TABLE 11]
Uygulama notu: Kargo uyarısı, statü rengini değiştirmez; onun üzerine bir rozet/örtü (overlay) olarak eklenir. İki sinyal — onay durumu ve kargo tavsiyesi — görsel olarak bir arada bulunmalıdır. Bu, mevcut renk haritasının yanına ikinci bir arama (lookup) haritası eklenerek yapılabilir. Ayrıca gün içinde en az 1-2 saatlik esnek boşluk bırakma davranışı, sabit bir rezerve slot yerine bu farkındalık üzerinden teşvik edilir.

[TABLE 12]
Tasarım notu: SaaS bağlamında arayüz tasarımı yenilenecek ve kiracı bazlı markalaşma (white-label) desteklenecektir. Her tenant/tesis için logo, renk paleti ve marka öğeleri konfigüre edilebilir olacaktır. Kod tabanında halihazırda bulunan markalaşma/tweaks paneli bu yapının temeli olarak genişletilecek; marka ayarları tenant/tesis konfigürasyonunun bir parçası haline gelecektir. Detaylı görsel tasarım ayrı bir çalışma olarak ele alınacaktır.

[TABLE 13]
Durum || Açıklama
Bekliyor || Tedarikçi talebi oluşturdu; yönetici onayı bekleniyor.
Onaylandı || Randevu onaylandı (otomatik veya yönetici tarafından).
Revize Bekliyor || Yönetici farklı saat önerdi; tedarikçinin görüşü/onayı bekleniyor.
Reddedildi || Talep reddedildi; red sebebi tedarikçiye iletildi.
Tamamlandı || Mal kabul gerçekleşti ve randevu kapatıldı.
İptal || Randevu tedarikçi veya yönetici tarafından iptal edildi.

[TABLE 14]
Konu || Açıklama / Karar
Tenant/Tesis temeli önce gelir || Tesis-kapsamlı tüm konfigürasyonlar (araç kategorisi, çakışma grubu, uyarı katmanı) Tenant/Tesis modeline dayanır. İki kez veri taşımadan kaçınmak için bu, yapısal temeldir.
Mevcut verinin dönüşümü || Mevcut BTA verisi = 1 Tenant + 1 Tesis. Bu net biçimde belirtilir, belirsiz bırakılmaz.
Müsaitlik kontrolünün tek noktaya toplanması || Bugün dağınık olan uygunluk mantığının tek bir değerlendirilebilir konfigürasyon yüzeyine toplanması başlı başına bir mimari iştir; dört kural ailesi kavramsal olarak tek bir değerlendirme girişine ihtiyaç duyar.
Sihirbaz sıralaması (ÇÖZÜLDÜ) || Ürün+araç önce, zaman sonra sıralamasıyla, araç değişiminin rampa uygunluğunu bozması riski yapısal olarak ortadan kalktı. Ayrı bir karar gerekmez.
Kargo uyarısının benimsenmesi || Tavsiye niteliğinde olduğu için değeri, planlamacıların uyarıyı fark edip saygı göstermesine bağlıdır. Gelecekte, kargo-uyarılı slota standart randevu koyarken engellemeyen bir onay diyaloğu değerlendirilebilir (v2.0'da zorunlu değil).
Plan/fiyat — faturalama motorsuz || Ölçülebilir boyutlar ve rate-card, gelecekteki bir faturalama modülü için depolama şekilleridir; çalışan bir fatura sistemi değildir. Kapsam sınırı net çizilir.
Platform veri erişim sınırı || İlke olarak yazılır: varsayılan olarak tenant operasyonel/PII verisine erişim yok; yalnızca agregat metrikler; destek için açık ve loglanan yükseltilmiş erişim gerekir.
```
