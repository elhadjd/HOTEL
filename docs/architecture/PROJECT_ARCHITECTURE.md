# SIGESC Hotelaria — Project Architecture

**Product:** SIGESC Hotelaria  
**Concept:** Modern Hospitality Intelligence  
**Status:** Phase 0 audit complete · Phase 1 foundation in progress  
**Date:** 2026-11-22

---

## 1. Repository findings

| Repository | Role | Finding |
|------------|------|---------|
| `elhadjd/HOTEL` | This product | Empty (`README.md` only). Safe greenfield. |
| `elhadjd/SIGESC-ESCOLAR` | Integration reference | **Primary pattern source.** Next.js App Router + Prisma + Aggregate client (`getAggregateClient()`), AES-256-GCM key storage, mock-first mode. |
| `elhadjd/SIGESC-CLINIC` | Domain inspiration only | Vite + Base44 SPA. **No Aggregate Multi-Company client.** Local `Invoice` entity — **do not copy** financial ownership. |
| `elhadjd/SIGESC-FOR-DEVELOPERS` | Docs hub | Effectively empty. |
| `SIGESC/SIGESC-HUB` | Org hub | Empty README. |
| `elhadjd/JOMBE` / main Laravel | Commercial/fiscal owner | **Do not modify.** Integrate via Aggregate API only. |

**Decision:** Hotelaria is an independent Next.js product. Integration contracts are copied from Escolar docs, not invented.

---

## 2. Architectural principles

1. **Independent product** — own Git repo, PostgreSQL database, migrations, auth sessions, deployment, env.
2. **Responsibility separation** — Hotelaria owns hotel operations; SIGESC owns customers (financial), invoicing, payments, fiscal docs, subscriptions.
3. **Documented Aggregate only** — implement only endpoints confirmed in Escolar Aggregate docs; mock by default.
4. **Tenant isolation** — every business row is scoped by `institutionId`; never trust client-supplied `company_id`.
5. **Service layer** — business logic in modules; route handlers / Server Actions are thin.
6. **Premium UX** — hospitality-grade design system (ink/navy + teal + warm neutrals), not a generic admin skin.

---

## 3. Technology decisions

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Runtime | Next.js 15 App Router + React 19 + TypeScript strict | Matches Escolar partner-product pattern; SSR default |
| Styling | Tailwind CSS 3 + CSS design tokens | Premium shell without overbuilt component noise |
| UI primitives | shadcn/ui (Radix) + Lucide | Accessible, consistent |
| Forms | React Hook Form + Zod | Boundary validation |
| Tables / charts | TanStack Table + Recharts (ops only) | Operational dashboards — no financial KPIs |
| Client server-state | TanStack Query (when needed) | Interactive ops screens |
| i18n | `next-intl` — pt (default), en, fr, es | Required from day one |
| ORM / DB | Prisma 6 + **PostgreSQL** | Spec mandate (Escolar uses MySQL; Hotelaria does not) |
| Auth | Auth.js (NextAuth v5) credentials + Prisma adapter | Independent sessions from SIGESC |
| Integration | `getAggregateClient()` port + mock/http adapters | Clone Escolar contract |
| Encryption | AES-256-GCM for `mca_` keys | Same crypto model as Escolar |
| Tests | Vitest (unit + integration) | Same approach as Escolar |
| Infra (dev) | Docker Compose: Postgres (+ Redis later if jobs need it) | Justified minimum |

---

## 4. Directory structure

```
HOTEL/
├── docs/architecture/           # This pack
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── messages/                    # next-intl dictionaries (pt, en, fr, es)
├── public/
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── (public)/        # /, login, register, onboarding, forgot-password
│   │   │   ├── (app)/           # authenticated shell
│   │   │   │   ├── dashboard/
│   │   │   │   ├── hotels/
│   │   │   │   ├── rooms/
│   │   │   │   ├── room-categories/
│   │   │   │   ├── reservations/
│   │   │   │   ├── calendar/
│   │   │   │   ├── guests/
│   │   │   │   ├── check-in/
│   │   │   │   ├── check-out/
│   │   │   │   ├── housekeeping/
│   │   │   │   ├── maintenance/
│   │   │   │   ├── rates/
│   │   │   │   ├── reports/
│   │   │   │   ├── staff/
│   │   │   │   ├── settings/
│   │   │   │   └── integrations/sigesc/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   └── api/v1/              # versioned REST
│   ├── components/
│   │   ├── layout/              # shell, sidebar, topbar
│   │   └── ui/                  # design-system primitives
│   ├── modules/
│   │   ├── iam/
│   │   ├── tenancy/
│   │   ├── hotels/
│   │   ├── rooms/
│   │   ├── reservations/
│   │   ├── guests/
│   │   ├── stays/
│   │   ├── housekeeping/
│   │   ├── maintenance/
│   │   ├── rates/
│   │   ├── audit/
│   │   ├── reporting/
│   │   └── sigesc-integration/  # Aggregate client (Escolar pattern)
│   ├── server/                  # db, auth, env, logger
│   └── shared/                  # utils, errors, types
├── docker-compose.yml
├── .env.example
└── package.json
```

Module public API via `index.ts` only.

---

## 5. Authentication & onboarding flow

```
Public landing → Login | Register | Onboarding

Onboarding (Aggregate):
  1. User pastes mca_… key (server-only; never localStorage)
  2. Backend assertMcaKeyFormat + GET /onboarding (validate BEFORE persist)
  3. Resolve company from Aggregate envelope
  4. TX: create Institution + Hotels workspace + SyncMapping + encrypt key
  5. Import users as INVITED with safe default role (no auto-admin)
  6. Redirect → /dashboard

Auth session:
  - Independent Auth.js session cookie
  - Active membership resolves institutionId server-side
  - Permissions checked on every mutation
```

---

## 6. What can be implemented immediately vs blocked

### Implement now (mock Aggregate)

- Foundation stack, design system, app shell  
- Prisma schema + migrations + seed  
- IAM / RBAC / tenant middleware  
- Aggregate port + mock adapter + crypto + connect flow  
- Hotels, categories, rooms, guests, reservations, calendar (ops)  
- Check-in / check-out (ops only; financial handoff stubbed as pending)  
- Housekeeping, maintenance, rates (operational)  
- Dashboard operational metrics from DB  

### Requires external / live Aggregate staging

- Live HTTP Aggregate against `app.sisgesc.net` / `app.zyvoerp.com`  
- Confirmed sales / invoice / payment completion webhooks  
- Declaring “production SIGESC integration complete”  

### Missing / undocumented contracts (do not invent)

- Hotelaria-specific Aggregate product scopes  
- Checkout → invoice issuance endpoint dedicated to stays (use documented `/customers`, later `/subscriptions` or `/sales` only if confirmed)  
- Webhooks for payment confirmation (Escolar currently polls)  

---

## 7. Risks

| Risk | Mitigation |
|------|------------|
| Inventing Aggregate endpoints | Port only Escolar-documented methods; document gaps |
| Duplicating invoicing (Clinic anti-pattern) | No Invoice/POS models; operational amounts + external refs only |
| Cross-tenant leaks | Central tenant resolver + integration tests |
| Concurrent double-booking | DB transaction + exclusion constraints / advisory locks |
| Live mode enabled by accident | Default `SIGESC_AGGREGATE_MODE=mock`; host allowlist |
| MySQL vs Postgres drift from Escolar | Explicit Postgres schema; do not copy MySQL-only types blindly |

---

## 8. Related documents

- [DATABASE_DESIGN.md](./DATABASE_DESIGN.md)  
- [SIGESC_INTEGRATION.md](./SIGESC_INTEGRATION.md)  
- [SECURITY_MODEL.md](./SECURITY_MODEL.md)  
- [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md)  
