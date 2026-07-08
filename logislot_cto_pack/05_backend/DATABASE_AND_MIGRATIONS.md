# Database and Migrations

## PostgreSQL kararları

- UUID primary keys
- timestamptz kullan
- Soft delete yerine çoğu config entity için `is_active/status` kullan
- JSONB sadece esnek politika/branding/trigger gibi alanlarda kullan; çekirdek ilişkiler relational kalmalı
- Unique constraint'ler tenant/facility scope ile kurulmalı

## Kritik constraint örnekleri

- Tenant display/commercial name opsiyonel unique olmayabilir; slug gerekiyorsa unique.
- Facility name tenant içinde unique olabilir.
- ProductCategory name facility içinde unique.
- VehicleCategory name facility içinde unique.
- Dock name facility içinde unique.
- Supplier code facility içinde unique.
- Appointment tarih/saat çakışması sadece DB constraint ile tam çözülemez; rule engine gerekir.

## Migration sırası

1. SaaS core: tenant, facility, plan
2. Auth/RBAC: platform users/roles, tenant users, memberships, roles
3. Catalogs: product categories, vehicle categories
4. Docks: docks, accepted category relations, working/overrides
5. Conflict groups
6. Suppliers
7. Appointments and revisions
8. Notifications/audit logs
9. Seeds

## Seed data

Demo seed:

- Tenant: BTA / Cakes & Bakes
- Facility: Cakes & Bakes Üretim Tesisi
- Product categories: Soğuk Zincir, Unlu Mamul Hammaddesi, Ambalaj, Genel
- Vehicle categories: TIR, Kamyon, Kamyonet, Kargo/Parsel Aracı, Frigorifik Araç
- Docks: Rampa 1, Rampa 2, Rampa 3
- Conflict group: Rampa 1-2 Bitişik Blok, TIR tetik koşullu
- Suppliers: otomatik onaylı ve manuel onaylı örnekler
- Users: sistem admin, rampa yöneticisi, izleyici
- Appointments: pending, approved, cargo, completed örnekleri

## BTA v1 -> v2 migration hedefi

- Global varsayılan kayıtlar tek tenant/facility scope'una taşınır.
- Eski plaka alanı korunur.
- Araç kategorisi bilinmeyen eski kayıtlarda kategori default'u uygulanır veya `Genel/TIR` seed default atanır.
- Kargo bilgisi olmayan eski randevular `delivery_type=standard` olur.
