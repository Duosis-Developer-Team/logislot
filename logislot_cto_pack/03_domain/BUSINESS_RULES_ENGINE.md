# Business Rules Engine v2.0

## Amaç

Business Rules Engine, randevu oluşturma ve müsaitlik gösterme sırasında tüm tesis bazlı konfigürasyonları tek yerde değerlendirir. UI içinde dağınık kural yazılmamalıdır.

## Kural aileleri

### 1. Kategori-Süre Kuralları — korunur

- ProductCategory.min_block_minutes randevu süresinin alt limitini etkiler.
- Kalite kontrol gibi ek süreler kategori minimum blokajına yansıtılır.
- Bu mekanizma v1.0'dan korunur; gereksiz yeni kural modeli yapılmaz.

### 2. Araç-Rampa Uyumluluğu — yeni sert kural

Değerlendirme:

1. Araç kategorisi çözülür.
   - Tedarikçi override verdiyse o kullanılır.
   - Yoksa product category default vehicle category kullanılır.
2. Uygun rampalar filtrelenir.
   - Rampa ürün kategorisini kabul etmeli.
   - Rampa araç kategorisini kabul etmeli.
   - Dock.accepted_vehicle_categories boşsa tüm araç kategorilerini kabul eder.

Sonuç: Uygun olmayan rampaya randevu yerleştirilemez.

### 3. Rampa Çakışma Grupları — yeni sert kural

Bir rampa için zaman aralığı kontrol edilirken:

- Rampa aktif bir conflict group üyesiyse grup kardeş rampaları da kontrol edilir.
- relation_type `mutual_block` ise birinin doluluğu diğerini kapatır.
- relation_type `shared_capacity` ise kapasite ortak kabul edilir; ilk sürümde mutual_block gibi davranabilir ama model ayrık kalmalıdır.
- relation_type `conditional` ise trigger_condition eşleştiğinde uygulanır.
- Örnek trigger: yalnızca vehicle_category = TIR olduğunda Rampa 1 ve Rampa 2 birbirini bloke eder.

### 4. Bilgilendirme/Uyarı Katmanı — yeni tavsiye kuralı

- Hiçbir şeyi engellemez.
- Otomatik yerleştirme yapmaz.
- Takvimde rozet/overlay/border ile sinyal üretir.
- Amiral örnek: kargo randevusu olan gün/rampa için planlamacıya boşluk bırakma uyarısı.

## Availability evaluation input

```ts
{
  tenantId,
  facilityId,
  supplierId,
  productCategoryId,
  vehicleCategoryId,
  deliveryType,
  date,
  requestedStart,
  durationMinutes,
  cargoWindow?
}
```

## Availability evaluation output

```ts
{
  slots: [
    {
      start,
      end,
      status: "available" | "partial" | "full",
      candidateDockIds: [],
      blockingReasons: [],
      advisoryWarnings: []
    }
  ]
}
```

## Randevu oluşturma algoritması

1. Auth context'ten tenant/facility doğrula.
2. Supplier aktif mi ve facility scope doğru mu kontrol et.
3. Supplier selected category için yetkili mi kontrol et.
4. Vehicle category çöz.
5. Duration değerini kategori min + supplier min/max + cargo min block ile doğrula.
6. Quota kontrolü yap.
7. Candidate docks bul:
   - active dock
   - product category accepted
   - vehicle category accepted
   - working hours/override uygun
   - conflict group uygun
   - existing appointments ile çakışmıyor
8. Candidate yoksa hata dön.
9. Dock assignment stratejisi uygula:
   - En az dolu uygun rampa
   - veya deterministik ilk uygun rampa
   - Sonradan optimize edilebilir; ama tedarikçiye manuel seçim yok.
10. Supplier auto approval varsa status `approved`, yoksa `pending`.
11. Notification/audit log üret.

## Sert kural ihlali hata kodları

- `SUPPLIER_CATEGORY_NOT_ALLOWED`
- `SUPPLIER_QUOTA_EXCEEDED`
- `DURATION_BELOW_CATEGORY_MINIMUM`
- `DURATION_OUTSIDE_SUPPLIER_LIMITS`
- `NO_COMPATIBLE_DOCK`
- `DOCK_OUTSIDE_WORKING_HOURS`
- `DOCK_CLOSED_BY_OVERRIDE`
- `DOCK_TIME_CONFLICT`
- `DOCK_CONFLICT_GROUP_BLOCKED`

## Tavsiye warning kodları

- `CARGO_DAY_WARNING`
- `CARGO_WINDOW_OVERLAP`
- `HIGH_DOCK_UTILIZATION`
