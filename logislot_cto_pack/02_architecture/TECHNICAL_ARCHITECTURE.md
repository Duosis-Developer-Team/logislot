# Technical Architecture

## Hedef mimari

LogiSlot, çok kiracılı SaaS gereksinimi nedeniyle baştan tenant/facility izolasyonu düşünülerek tasarlanmalıdır. Önerilen yapı:

```text
logislot/
  apps/
    web/                 # Next.js frontend
    api/                 # FastAPI backend
    worker/              # async jobs: mail, notifications, scheduled checks
  packages/
    shared/              # shared types/openapi client/generated schemas if needed
    config/              # eslint/tsconfig/prettier shared config
  infra/
    docker/
    compose/
  docs/
```

## Frontend

- Next.js App Router
- TypeScript strict
- Tailwind CSS
- shadcn/ui
- React Hook Form + Zod
- TanStack Query
- TanStack Table
- Calendar UI custom or FullCalendar only if needed
- Route groups:
  - `(auth)`
  - `(supplier)`
  - `(tenant-admin)`
  - `(platform)`

## Backend

- FastAPI
- SQLAlchemy 2 async or sync with clear service layer
- Alembic migrations
- PostgreSQL 16
- Redis for cache, locks, background jobs
- Pydantic v2 schemas
- JWT access/refresh auth
- OpenAPI generated client for frontend optional

## Core backend layers

```text
api/
  app/
    main.py
    core/          # config, security, db session, logging
    auth/          # login, tokens, password hashing
    platform/      # platform tenant/facility/plan endpoints
    tenancy/       # tenant/facility context helpers
    users/         # users, roles, permissions
    suppliers/     # supplier records/accounts
    catalogs/      # product categories, vehicle categories
    docks/         # docks, working hours, overrides, conflict groups
    appointments/  # appointments, lifecycle, availability
    rules/         # rule engine/domain services
    reports/       # analytics and dashboards
    notifications/ # in-app/mail notifications
    audit/         # audit logging
```

## Tenancy strategy

V2.0 için en pratik ve hızlı strateji: shared database + shared schema + `tenant_id`/`facility_id` kolonları.

Neden:

- İlk SaaS sürümü için operasyonel olarak basit.
- Tenant/facility filtreleri uygulama ve DB constraint seviyesinde uygulanabilir.
- Raporlama ve platform agregasyonları kolaydır.

Kurallar:

- Tenant tablosu en üst seviye.
- Facility tablosu tenant'a bağlı.
- Operasyonel tabloların çoğunda `tenant_id` ve `facility_id` bulunur.
- Tenant/facility ID API'den körlemesine alınmaz; authenticated context ve erişim kontrolüyle doğrulanır.
- Platform agregat endpointleri operasyonel detay döndürmez.

## Güvenlik

- Password hashing: Argon2 veya bcrypt.
- JWT: short-lived access, rotating refresh.
- Tenant kullanıcıları ve platform kullanıcıları ayrı namespace veya user_type ile ayrılır.
- Impersonation session ayrı context olarak loglanır.
- PII erişimi audit log üretir.
- API'de her endpoint için permission dependency vardır.

## Background jobs

İlk sürümde gerekli işler:

- E-posta gönderimi
- Bildirim dağıtımı
- Recurring appointment expansion
- Health/usage metric materialization opsiyonel
- Audit/event processing opsiyonel

## Observability

- Structured logs
- Request ID
- Audit logs
- Error boundary UI
- Backend exception handling
- Health endpoints: `/health`, `/ready`
