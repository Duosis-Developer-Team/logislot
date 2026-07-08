# Implementation Roadmap

## Sprint 0 — Repo & Foundation

Amaç:

- Monorepo kurulumu
- Next.js + Tailwind + shadcn/ui
- FastAPI + PostgreSQL + Alembic
- Docker Compose
- Base auth scaffolding

Çıktılar:

- apps/web çalışır
- apps/api çalışır
- `/health`
- DB connection
- İlk migration altyapısı

## Sprint 1 — SaaS Core & RBAC

Amaç:

- Tenant/facility modelini ilk günden kurmak
- Platform user/role ve tenant user/role ayrımını yapmak
- Facility membership context

Çıktılar:

- Tenant/facility CRUD backend
- Platform login
- Tenant login
- Active facility selector
- Permission-aware frontend shell

## Sprint 2 — Catalogs & Docks

Amaç:

- Product categories
- Vehicle categories
- Docks
- Accepted product/vehicle category relations
- Working hours/overrides

Çıktılar:

- Admin config ekranları
- Seed data
- Backend CRUD + tests

## Sprint 3 — Suppliers & Basic Appointments

Amaç:

- Supplier records/accounts
- Supplier login/profile
- v2 wizard steps 1-2 skeleton
- Appointment model/lifecycle temel

Çıktılar:

- Supplier kendi kategorilerini görür
- Appointment oluşturma backend endpoint başlangıcı
- Pending/approved status auto/manual ayrımı

## Sprint 4 — Availability & Rule Engine

Amaç:

- Rule engine'i doğru yazmak
- Slots, compatible docks, conflict prevention
- Supplier wizard step 3

Çıktılar:

- Availability evaluate endpoint
- 30 dk slot UI
- Smart dock assignment
- Unit test matrix

## Sprint 5 — Conflict Groups & Cargo Advisory Layer

Amaç:

- DockConflictGroup model/CRUD
- Conditional conflict rules
- Cargo delivery type
- Calendar advisory overlay

Çıktılar:

- Rampa çakışma grupları admin ekranı
- Kargo wizard davranışı
- Takvimde kargo overlay
- Tests

## Sprint 6 — Management Calendar & Lifecycle Actions

Amaç:

- Takvim günlük/haftalık görünüm
- Appointment detail/action drawer
- Approve/reject/revise/complete/cancel
- Notifications/email abstraction

Çıktılar:

- Yönetici operasyon akışı uçtan uca
- Revizyon geçmişi
- Tedarikçi detayında eski/yeni aralık görünür

## Sprint 7 — Reports, Platform Usage & Plans

Amaç:

- Dashboard/reports
- Platform usage/health metrics
- Plan/rate-card CRUD/assignment

Çıktılar:

- Tenant/facility agregat metrikleri
- Plan atama ekranları
- Faturalama motoru yok

## Sprint 8 — White-label, Polish & QA

Amaç:

- Branding settings
- UI polish
- Responsive QA
- Security hardening
- E2E demo

Çıktılar:

- Logo/renk ayarı
- Tutarlı config UI
- Test raporu
- Demo senaryosu
