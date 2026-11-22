# SIGESC Hotelaria — Implementation Roadmap

---

## Phase 0 — Audit (done)

- [x] Inspect `elhadjd/HOTEL` (empty)  
- [x] Inspect SIGESC Escolar Aggregate patterns  
- [x] Inspect SIGESC Clinic (no Aggregate; avoid financial duplication)  
- [x] Document architecture pack  

---

## Phase 1 — Foundation (current)

- [ ] Next.js + TS strict + Tailwind + design tokens  
- [ ] Premium app shell (sidebar, topbar, i18n, empty/loading states)  
- [ ] PostgreSQL + Prisma schema + migrate  
- [ ] Env validation, logging, error helpers  
- [ ] Auth.js foundation + RBAC + tenant resolver  
- [ ] Aggregate module: port, mock, crypto, `getAggregateClient`  
- [ ] Vitest unit tests (crypto, mock authorize, tenant helpers)  
- [ ] Docker Compose Postgres  
- [ ] Seed data (dev only)  

---

## Phase 2 — Institutional onboarding

- [ ] `/onboarding` UI (API key entry)  
- [ ] `POST /api/v1/onboarding/connect` validate-then-persist  
- [ ] Institution + connection + user import  
- [ ] Integration status page `/integrations/sigesc`  
- [ ] Mock integration tests  

---

## Phase 3 — Hotel operations

- [ ] Hotels + settings  
- [ ] Room categories + rooms (grid/list/floor)  
- [ ] Guests  
- [ ] Reservations + availability conflicts  
- [ ] Calendar (day/week/month)  

---

## Phase 4 — Daily operations

- [ ] Check-in / check-out workflows  
- [ ] Housekeeping  
- [ ] Maintenance  
- [ ] Room activity history  

---

## Phase 5 — SIGESC commercial integration

- [ ] Customer sync via documented `/customers`  
- [ ] GuestCustomerMapping reconciliation  
- [ ] Check-out financial handoff (only confirmed endpoints)  
- [ ] Document remaining gaps  

---

## Phase 6 — Reporting & hardening

- [ ] Operational reports + dashboard charts from real data  
- [ ] Concurrent booking stress tests  
- [ ] Cross-tenant security tests  
- [ ] Performance / production deployment prep  

---

## Dependency decisions (locked for Phase 1)

| Package | Version policy |
|---------|----------------|
| next | 15.x |
| react | 19.x |
| prisma / @prisma/client | 6.x |
| next-auth | 5 beta (Auth.js) |
| next-intl | 3.x |
| zod | 3.x |
| vitest | 2.x |
| tailwindcss | 3.4.x |
| bcryptjs | 2.x |

---

## Immediate vs blocked

**Immediate:** Phases 1–4 against mock Aggregate + local Postgres.  

**Blocked / gated:** Declaring live Aggregate production readiness; sales/invoice automation; modifying main SIGESC Laravel.  
