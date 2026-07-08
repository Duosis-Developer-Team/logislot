# Appointment Lifecycle

## Statüler

| Status | Türkçe | Açıklama |
|---|---|---|
| pending | Bekliyor | Tedarikçi talebi oluşturdu; yönetici onayı bekliyor. |
| approved | Onaylandı | Randevu otomatik veya yönetici tarafından onaylandı. |
| revision_pending | Revize Bekliyor | Yönetici farklı saat önerdi; tedarikçinin görüşü/onayı bekliyor. |
| rejected | Reddedildi | Talep reddedildi; red sebebi tedarikçiye iletildi. |
| completed | Tamamlandı | Mal kabul gerçekleşti ve randevu kapatıldı. |
| cancelled | İptal | Randevu tedarikçi veya yönetici tarafından iptal edildi. |

## Kargo notu

Kargo yeni statü değildir. `delivery_type = cargo` olan randevu, yukarıdaki statü yaşam döngüsünü aynen kullanır. Kargo yalnızca planlama/takvimde uyarı overlay'i üretir.

## Aksiyon matrisi

| Mevcut durum | Tedarikçi | Yönetici |
|---|---|---|
| pending | iptal edebilir | onayla, reddet, revize et, iptal et |
| approved | gelecek tarihliyse iptal edebilir | revize et, tamamla, iptal et |
| revision_pending | kabul/red akışı opsiyonel; ilk sürümde detayda görür | revizeyi güncelleyebilir, iptal edebilir |
| rejected | görüntüler | görüntüler |
| completed | görüntüler | görüntüler |
| cancelled | görüntüler | görüntüler |

## Revizyon geçmişi

Her revizyon saklanır:

- eski başlangıç/bitiş
- eski rampa
- yeni başlangıç/bitiş
- yeni rampa
- revizyon notu
- revize eden kullanıcı
- tarih

## Bildirimler

Bildirim üretilecek olaylar:

- Yeni randevu talebi
- Randevu onaylandı
- Randevu reddedildi
- Randevu revize edildi
- Randevu tamamlandı
- Randevu iptal edildi
- Kargo uyarılı randevu eklendi/güncellendi

## E-posta

v1.0 saha tespitine göre revizyon sonrası ilgili ekibe otomatik e-posta davranışı korunur. İlk sürümde e-posta provider abstraction kurulmalı; gerçek provider env ile bağlanabilir olmalıdır.
