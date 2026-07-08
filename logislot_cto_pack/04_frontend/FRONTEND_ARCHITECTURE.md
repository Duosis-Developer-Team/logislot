# Frontend Architecture

## Next.js yapı önerisi

```text
apps/web/src/
  app/
    (auth)/
      login/
      supplier-login/
      platform-login/
    (supplier)/
      supplier/
        appointments/
        appointments/new/
        profile/
    (tenant)/
      app/
        dashboard/
        calendar/
        appointments/
        reports/
        admin/
          categories/
          vehicle-categories/
          docks/
          dock-conflict-groups/
          suppliers/
          users-roles/
          branding/
    (platform)/
      platform/
        tenants/
        facilities/
        usage/
        plans/
  components/
    layout/
    ui/
    calendar/
    appointments/
    admin/
    supplier/
  lib/
    api/
    auth/
    permissions/
    formatting/
    validators/
```

## Route groups

### Auth

- Portal seçimi opsiyonel olabilir.
- Tedarikçi, tenant kullanıcı ve platform kullanıcı login ekranları ayrı veya tek login + role yönlendirmesi şeklinde tasarlanabilir.

### Supplier portal

Mobile-first:

- Alt tab bar: Randevularım, Yeni Randevu, Profil
- Kart tabanlı randevu listeleri
- 3 adımlı wizard
- Büyük touch target'lar

### Tenant/admin panel

Desktop-first ama responsive:

- Sidebar + topbar
- Facility switcher
- Notification bell
- Permission-aware navigation
- Takvim ve yönetim ekranları geniş layout

### Platform panel

- Ayrı route namespace `/platform`
- Farklı görsel vurgu, tenant paneliyle karışmamalı
- Agregat metrik odaklı

## State yönetimi

- Server state: TanStack Query
- Form state: React Hook Form + Zod
- Auth/session: secure cookie veya token storage stratejisi backend kararına göre
- UI state: URL search params + küçük Zustand store

## Component prensipleri

- Takvim blokları statü rengini ve kargo overlay'ini birlikte desteklemeli.
- Config editörleri aynı pattern'i kullanmalı: liste + filtre + create/edit modal/drawer.
- Wizard adımları yeniden kullanılabilir olmalı ama iş kuralları frontend'e gömülmemeli.
- Tüm tarih/saat gösterimleri facility timezone'a göre formatlanmalı.

## API client

- OpenAPI'den generated client tercih edilir.
- Değilse `lib/api/client.ts` içinde typed fetch wrapper kullan.
- Her request active facility context header veya path param ile gitmeli.

Örnek header:

- `X-Facility-Id`

Bu değer backend tarafından kullanıcının membership'i ile doğrulanmalıdır.
