# Phase 5 — Final Implementation, Security Audit & Integration Report

**Date:** 2026-11-22 (America/New_York)  
**Feature branch:** `cursor/phase5-pricing-guest-lifecycle-fcf5`  
**Base:** `main` @ `2ec089e`

---

## Implementation summary

### A — Centralized product/service pricing

- Renamed `local_operational_price` → `legacy_historical_price` (non-authoritative).
- Added `central_price_verified_at`; UI freshness policy 5 minutes.
- `verifyCentralProductPrice` always used for invoices; browser `unitPrice` ignored.
- Catalog upsert Zod `.strict()` — no local price writes.
- Products UI shows Central price + verification state + refresh.

### B — Guest ↔ Customer invariant

- `createGuest` requires valid Central Customer; transactional LINKED mapping.
- Unlink forbidden; reassociate only.
- Historical unlinked → `NEEDS_RESOLUTION` (preserved).
- Reservations/invoices require LINKED guests.

### C — Convert customers → Guests

- Individual + bulk (`MAX=50`) via `POST .../customers/convert`.
- Permissions: `integrations.customers` + `guests.write`.
- Per-customer transactions; idempotent; duplicate/foreign/invalid outcomes.

### Migrations

1. `20261122140000_phase5_pricing_guest_lifecycle`
2. `20261122140001_phase5_guest_needs_resolution_backfill`

---

## Security audit

| Severity | Finding | Remediation |
|----------|---------|-------------|
| HIGH | Guest create only required `guests.write`, allowing Aggregate customer ops without `integrations.customers` | Fixed — both permissions required |
| HIGH | Unlink could leave Guests invalid | Fixed — unlink throws; API rejects `action=unlink` |
| MEDIUM | Parallel Vitest files raced on shared Postgres fixtures | Fixed — `fileParallelism: false` |
| MEDIUM | Catalog API could accept unknown price fields | Fixed — Zod `.strict()` |
| MEDIUM | Invoice could trust browser unitPrice | Fixed — always verify Aggregate |
| LOW | Convert route calls `requireTenant` twice | Accepted — both must pass; same session ctx |
| LOW | No dedicated rate limit on convert endpoint | Documented residual; batch max 50 |
| INFO | Live Aggregate staging not tested | Operational limitation |
| INFO | DB NOT NULL on `external_customer_id` deferred for historical rows | App-layer enforcement for new creates + ops |

**CRITICAL:** none remaining.  
**HIGH:** remediated.

---

## Validation

| Check | Result |
|-------|--------|
| `npm test` | 65 passed / 12 files |
| `npm run typecheck` | pass |
| `npm run lint` | pass (0 errors) |
| `npm run build` | pass |
| `prisma migrate deploy` | Phase 5 migrations applied |

---

## Operational limitations

- Real Aggregate staging not exercised.
- Production verification of pricing + convert still required against live SIGESC.
- Historical `NEEDS_RESOLUTION` guests need operator resolution (no name-based auto-link).
