# API Specification

Bu dosya endpoint taslağıdır. Claude Code uygularken OpenAPI şemalarını üretmeli ve frontend'i bu sözleşmeyle bağlamalıdır.

## Auth

- `POST /auth/login`
- `POST /auth/supplier-login`
- `POST /auth/platform-login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

## Tenant/facility context

- `GET /me/facilities`
- `POST /me/active-facility`

## Platform

- `GET /platform/tenants`
- `POST /platform/tenants`
- `GET /platform/tenants/{tenant_id}`
- `PATCH /platform/tenants/{tenant_id}`
- `GET /platform/facilities`
- `POST /platform/tenants/{tenant_id}/facilities`
- `PATCH /platform/facilities/{facility_id}`
- `GET /platform/usage`
- `GET /platform/plans`
- `POST /platform/plans`
- `PATCH /platform/plans/{plan_id}`
- `POST /platform/plan-assignments`
- `POST /platform/impersonation/start`
- `POST /platform/impersonation/stop`

## Catalogs

- `GET /facilities/{facility_id}/categories`
- `POST /facilities/{facility_id}/categories`
- `PATCH /facilities/{facility_id}/categories/{id}`
- `GET /facilities/{facility_id}/vehicle-categories`
- `POST /facilities/{facility_id}/vehicle-categories`
- `PATCH /facilities/{facility_id}/vehicle-categories/{id}`

## Docks

- `GET /facilities/{facility_id}/docks`
- `POST /facilities/{facility_id}/docks`
- `PATCH /facilities/{facility_id}/docks/{id}`
- `GET /facilities/{facility_id}/dock-overrides`
- `POST /facilities/{facility_id}/dock-overrides`
- `GET /facilities/{facility_id}/dock-conflict-groups`
- `POST /facilities/{facility_id}/dock-conflict-groups`
- `PATCH /facilities/{facility_id}/dock-conflict-groups/{id}`

## Suppliers

- `GET /facilities/{facility_id}/suppliers`
- `POST /facilities/{facility_id}/suppliers`
- `PATCH /facilities/{facility_id}/suppliers/{id}`
- `GET /supplier/profile`

## Appointments

- `GET /facilities/{facility_id}/appointments`
- `POST /facilities/{facility_id}/appointments`
- `GET /facilities/{facility_id}/appointments/{id}`
- `POST /facilities/{facility_id}/appointments/{id}/approve`
- `POST /facilities/{facility_id}/appointments/{id}/reject`
- `POST /facilities/{facility_id}/appointments/{id}/revise`
- `POST /facilities/{facility_id}/appointments/{id}/complete`
- `POST /facilities/{facility_id}/appointments/{id}/cancel`
- `POST /facilities/{facility_id}/availability/evaluate`

## Supplier appointment endpoints

- `GET /supplier/appointments`
- `POST /supplier/appointments`
- `GET /supplier/appointments/{id}`
- `POST /supplier/appointments/{id}/cancel`
- `POST /supplier/availability/evaluate`

## Reports

- `GET /facilities/{facility_id}/dashboard-summary`
- `GET /facilities/{facility_id}/reports/appointments`
- `GET /facilities/{facility_id}/reports/dock-utilization`
- `GET /facilities/{facility_id}/reports/supplier-activity`

## Notifications

- `GET /notifications`
- `POST /notifications/{id}/read`

## Admin users/roles

- `GET /facilities/{facility_id}/users`
- `POST /facilities/{facility_id}/users`
- `PATCH /facilities/{facility_id}/users/{id}`
- `GET /facilities/{facility_id}/roles`
- `POST /facilities/{facility_id}/roles`
- `PATCH /facilities/{facility_id}/roles/{id}`

## Branding

- `GET /facilities/{facility_id}/branding`
- `PATCH /facilities/{facility_id}/branding`

## API güvenlik kuralları

- Her facility endpoint, kullanıcının o facility için membership/permission sahibi olduğunu doğrular.
- Supplier endpointleri authenticated supplier'ın kendi supplier_id'sinden başka veri döndürmez.
- Platform endpointleri tenant/facility detay operasyon verisi döndürmez; sadece agregat.
- Randevu lifecycle endpointleri audit log üretir.
