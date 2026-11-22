# SIGESC Hotelaria — Implementation Roadmap

---

## Phase 0 — Audit (done)

- [x] Inspect `elhadjd/HOTEL` (empty)  
- [x] Inspect SIGESC Escolar Aggregate patterns  
- [x] Inspect SIGESC Clinic (no Aggregate; avoid financial duplication)  
- [x] Document architecture pack  

---

## Phase 1 — Foundation (done)

- [x] Next.js + TS strict + Tailwind + design tokens  
- [x] Premium app shell (sidebar, topbar, i18n, empty/loading states)  
- [x] PostgreSQL + Prisma schema + migrate  
- [x] Env validation, logging, error helpers  
- [x] Auth.js foundation + RBAC + tenant resolver  
- [x] Aggregate module: port, mock, crypto, `getAggregateClient`  
- [x] Vitest unit tests (crypto, mock authorize, tenant helpers)  
- [x] Docker Compose Postgres  
- [x] Seed data (dev only)  

---

## Phase 2 — Institutional onboarding (done)

- [x] `/onboarding` UI (API key entry + confirm)  
- [x] `POST /api/v1/onboarding/validate` + `/confirm`  
- [x] Institution + connection + user import (admin-only privileges)  
- [x] Email outbox + first-login + password recovery  
- [x] Mock integration / auth security tests  

---

## Phase 3 — Hotel operations (done)

- [x] Hotels + settings  
- [x] Room categories + rooms (grid/list/floor)  
- [x] Guests  
- [x] Reservations + availability conflicts  
- [x] Calendar (day/week/month)  

---

## Phase 4 — Aggregate commerce (done)

- [x] Customers / products / Cotação–Proforma invoices  
- [x] GuestCustomerMapping + ProductCatalogMapping  
- [x] Idempotent `external_id` + reconciliation  

See `PHASE4_AGGREGATE_COMMERCE.md`.

---

## Phase 5 — Central pricing & Customer↔Guest lifecycle (done)

- [x] Central-only product/service pricing (no independent operational price)  
- [x] Guest requires valid Central Customer; Customer may exist without Guest  
- [x] Individual + bulk convert customers → Guests (max 50)  
- [x] Historical `NEEDS_RESOLUTION` strategy  
- [x] Docs + tests + security audit  

See `PHASE5_CENTRAL_PRICING_CUSTOMER_GUEST_LIFECYCLE.md`.

---

## Phase 6 — Stay lifecycle + MySQL (done)

- [x] MySQL 8.0 Prisma provider + baseline migration  
- [x] Check-in / check-out / active stays  
- [x] Room transfer, companions, extensions  
- [x] Housekeeping + maintenance  
- [x] Stay operational account + Aggregate handoff  

See `PHASE6_STAY_LIFECYCLE_MYSQL.md`.

---

## Phase 7 — Reporting & hardening

- [ ] Operational reports + dashboard charts from real data  
- [ ] Concurrent booking stress tests  
- [ ] Cross-tenant security tests  
- [ ] Performance / production deployment prep  

---

## Dependency decisions (locked)

| Package | Version policy |
|---------|----------------|
| next | 15.x |
| react | 19.x |
| prisma / @prisma/client | 6.x |
| next-auth | 5 beta (Auth.js) |
| next-intl | 3.x |
| zod | 3.x |
| vitest | 2.x |
| tailwindcss | 4.x |
| bcryptjs | 3.x / compatible |
| nodemailer | 6.x |

---

## Immediate vs blocked

**Immediate:** Phase 5 complete against mock Aggregate + local Postgres.  

**Blocked / gated:** Declaring live Aggregate production readiness; payment/publish/stock mutations; modifying main SIGESC Laravel.  
