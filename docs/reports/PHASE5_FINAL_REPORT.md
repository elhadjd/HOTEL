# SIGESC Hotelaria — Phase 5 Final Report

**Scope:** Centralized Product Pricing & Customer-to-Guest Lifecycle  
**Repository:** `elhadjd/HOTEL`  
**Target:** `main`  
**Mode:** Full implementation + architecture review + security audit + remediation + regression testing + PR integration + merge  
**Report date:** 22 Nov 2026 (America/New_York)

---

## H. Final verdict

**APPROVED AND MERGED** — Implementation, security remediations, tests, documentation and CI passed; the feature PR was merged into `main`.

| Item | Value |
|------|--------|
| PR | https://github.com/elhadjd/HOTEL/pull/4 |
| Feature branch | `cursor/phase5-pricing-guest-lifecycle-fcf5` |
| Feature commit | `ef7e087d338f6d37c62273b9bbb92de2709b4f57` |
| Merge commit / **main HEAD** | `21ccb80507be4e7885b2108f60435489262ea030` |
| Merged at | 22 Nov 2026, 4:33 AM America/New_York |
| CI | GitGuardian Security Checks — SUCCESS |
| Pre-merge `main` HEAD | `2ec089ec33cb5f93555a001905961bee7d6dfaa6` |

Architecture detail: `docs/PHASE5_CENTRAL_PRICING_CUSTOMER_GUEST_LIFECYCLE.md`  
Also mirrored at: `docs/architecture/PHASE5_CENTRAL_PRICING_CUSTOMER_GUEST_LIFECYCLE.md`

---

## A. Implementation

### Features implemented

1. **Central-only product/service pricing** — SIGESC Central is the sole authoritative price for integrated catalog items.
2. **Guest ↔ Customer invariant** — every new Hotelaria Guest requires a valid Central Customer; a Central Customer may exist without a Guest.
3. **Individual conversion** — Convert one imported Central Customer into an operational Guest.
4. **Bulk conversion** — Select multiple customers (max 50) and convert with per-record results.
5. **Historical compatibility** — Unlinked legacy guests preserved as `NEEDS_RESOLUTION` (not deleted).

### A1 — Product pricing changes

| Before (Phase 4) | After (Phase 5) |
|------------------|-----------------|
| `local_operational_price` editable / used as operational price | Renamed to `legacy_historical_price` — **non-authoritative audit residue** |
| Invoice could accept browser `unitPrice` | Invoice **always** calls `verifyCentralProductPrice`; browser price ignored |
| Cache without freshness policy | `centralSalePrice` + `centralPriceVerifiedAt`; UI freshness **5 minutes** (`CENTRAL_PRICE_FRESHNESS_MS`) |
| — | Refresh: `POST /api/v1/integrations/sigesc/catalog-mappings/{id}/refresh` |

Architecture distinction retained:

- Central product ID, company ID, kind  
- Official central sale price + tax (when Aggregate returns it)  
- Local operational metadata (code/label) — not financial  
- Mapping status / sync timestamps  

**Rule:** if Aggregate cannot verify the price, invoice submission is blocked. Never fall back to `legacyHistoricalPrice`.

### A2 — Customer / Guest relationship

| Concept | Owner | Rule |
|---------|-------|------|
| Customer | SIGESC Central | Financial identity; optional Guest |
| Guest | Hotelaria | Operational profile; **must** have LINKED Customer |

Workflows:

- **A — Existing customer:** search → select → validate company/connection → create Guest + mapping  
- **B — New customer:** create Central Customer via Aggregate → on timeout search/reconcile (no blind retry) → then create Guest  

Unlink is **forbidden**. Use `reassociate` to another valid customer. Deleting/archiving a Guest does not delete the Central Customer.

### A3 — Individual conversion

`POST /api/v1/integrations/sigesc/customers/convert`  
Body: `{ "centralCustomerId": … }`

Requires: `integrations.customers` **and** `guests.write`.

Outcomes: `converted` | `already_associated` | `invalid_customer` | `foreign_company` | `insufficient_data` | `aggregate_unavailable` | `failed`

### A4 — Bulk conversion

Body: `{ "centralCustomerIds": […] }` — max **50** (`MAX_CUSTOMER_TO_GUEST_BATCH`).

- Independent per-customer transactions (one failure does not roll back siblings)  
- Duplicate IDs in request → `duplicate_in_batch`  
- Institution / connection derived only from authenticated server context  
- UI: row selection, select-all (current page), toolbar, confirmation, result summary, links to Guests  

### A5 — Database changes and migration

| Change | Detail |
|--------|--------|
| Enum | `CustomerSyncStatus.NEEDS_RESOLUTION` |
| Rename | `local_operational_price` → `legacy_historical_price` |
| Add | `product_catalog_mappings.central_price_verified_at` |
| Backfill | `UNLINKED` + empty external id → `NEEDS_RESOLUTION` |

Migrations:

1. `prisma/migrations/20261122140000_phase5_pricing_guest_lifecycle/`  
2. `prisma/migrations/20261122140001_phase5_guest_needs_resolution_backfill/`  

Constraints retained / enforced:

- `GuestCustomerMapping.guestId` unique (one Guest → one mapping)  
- `@@unique([institutionId, externalCustomerId])`  
- Application + service layer block new unlinked Guests and block reservation/invoice ops without LINKED mapping  
- DB `NOT NULL` on `external_customer_id` deferred until historical remediation completes  

### New / updated APIs

| Method | Path | Permissions |
|--------|------|-------------|
| POST | `/api/v1/integrations/sigesc/customers/convert` | `integrations.customers` + `guests.write` |
| POST | `/api/v1/integrations/sigesc/catalog-mappings/{id}/refresh` | `integrations.products` |
| POST | `/api/v1/guests` (modes `existing_customer` / `new_customer`) | `guests.write` + `integrations.customers` |
| POST | `/api/v1/guests/{id}/customer-mapping` | `integrations.customers` — `link` / `create` / `reassociate`; **unlink rejected** |

### UI updates

| Route | Change |
|-------|--------|
| `/integrations/customers` | Association status, Convert to Guest, multi-select, bulk toolbar, results |
| `/integrations/products` | Central price + verified/stale labels; no editable local price; refresh |
| `/guests` | Create requires customer; notes on `NEEDS_RESOLUTION` |
| `/guests/[guestId]` | Reassociate instead of unlink |

### Consistency across workflows

- Reservation assignment requires LINKED guest  
- Invoice customer taken from validated Guest ↔ Customer mapping  
- Financial lines use verified central prices only  
- Phase 3 ops + Phase 4 idempotency / `RECONCILIATION_REQUIRED` preserved  

---

## B. Security

### Findings by severity

| Severity | Finding | Remediation |
|----------|---------|-------------|
| CRITICAL | — | none found |
| HIGH | Guest create only required `guests.write` (Aggregate customer access without `integrations.customers`) | Fixed — both permissions required |
| HIGH | Unlink left Guests invalid | Fixed — service throws; API rejects `action=unlink` |
| MEDIUM | Parallel Vitest files raced on shared Postgres | Fixed — `fileParallelism: false` |
| MEDIUM | Catalog API could accept unknown price fields | Fixed — Zod `.strict()` |
| MEDIUM | Invoice could trust browser `unitPrice` | Fixed — always verify Aggregate |
| LOW | Convert route calls `requireTenant` twice | Accepted — both must pass; same session |
| LOW | No dedicated rate limit on convert | Residual — batch max 50 documented |
| INFO | Live Aggregate staging not tested | Operational limitation |
| INFO | DB NOT NULL on mapping external id deferred | App-layer enforcement for new creates + ops |

### Remediations applied

- Dual RBAC on guest create and convert  
- Unlink path removed from normal workflows  
- Invoice ignores non-central prices  
- Catalog upsert rejects local price writes  
- Tenant/company/connection IDs never trusted from the browser for convert  

### Remaining limitations

- Convert endpoint has no separate HTTP rate-limit middleware (batch size + uniqueness only)  
- Historical `NEEDS_RESOLUTION` guests are not hard-blocked at DB read level; mutations enforce LINKED  
- No live Aggregate credential testing in this environment  

---

## C. Validation

| Check | Result |
|-------|--------|
| `npm test` | **65 passed** / 12 files |
| Phase 5 lifecycle | 11 tests (create, convert, bulk, pricing, invoice block, historical) |
| Phase 4 regression | commerce + integration suites pass |
| Reservations / onboarding / crypto / mock | pass |
| `npm run typecheck` | pass |
| `npm run lint` | pass (0 errors) |
| `npm run build` | pass (Next.js production) |
| `prisma migrate deploy` | Phase 5 migrations applied |
| CI (PR #4) | GitGuardian Security Checks — SUCCESS |

---

## D. Git integration

| Item | Value |
|------|--------|
| Feature branch | `cursor/phase5-pricing-guest-lifecycle-fcf5` |
| PR URL | https://github.com/elhadjd/HOTEL/pull/4 |
| Feature commit SHA | `ef7e087d338f6d37c62273b9bbb92de2709b4f57` |
| Merge commit SHA | `21ccb80507be4e7885b2108f60435489262ea030` |
| Final `main` HEAD | `21ccb80507be4e7885b2108f60435489262ea030` |
| CI status | SUCCESS |
| **Merged into main** | **Yes** |

Artifacts verified on `main` after merge:

- Both Phase 5 migrations  
- `customer-to-guest-service.ts`  
- `docs/PHASE5_CENTRAL_PRICING_CUSTOMER_GUEST_LIFECYCLE.md`  
- This report path under `docs/reports/`  

---

## E. Operational limitations

| Topic | Status |
|-------|--------|
| Real Aggregate staging tested? | **No** — mock Aggregate only |
| Production verification still necessary? | **Yes** — pricing refresh, convert, and invoice submit against live SIGESC |
| Unresolved migration risks? | Historical `NEEDS_RESOLUTION` guests need explicit operator resolution; no automatic name-based linking |
| Financial boundary | Unchanged — Cotação/Proforma only; no publish / pay / stock mutation |

---

## F. Acceptance criteria checklist

| # | Criterion | Met |
|---|-----------|-----|
| 1 | SIGESC Central is the only price source for integrated products/services | Yes |
| 2 | No financial workflow silently uses an independent local price | Yes |
| 3 | Every newly created Guest has a valid Central Customer | Yes |
| 4 | Central Customers can exist without Guests | Yes |
| 5 | Users can convert one Central Customer into a Guest | Yes |
| 6 | Users can bulk-convert with controlled batch + results | Yes |
| 7 | Duplicate conversions and cross-tenant associations prevented | Yes |
| 8 | Existing reservations / historical records intact | Yes |
| 9 | Phase 3 / Phase 4 regression tests pass | Yes |
| 10 | Critical and High security findings resolved | Yes |
| 11 | Required CI checks pass | Yes |
| 12 | Complete implementation merged into `main` | Yes |

---

## G. Documentation updated

- `docs/PHASE5_CENTRAL_PRICING_CUSTOMER_GUEST_LIFECYCLE.md`  
- `docs/architecture/PHASE5_CENTRAL_PRICING_CUSTOMER_GUEST_LIFECYCLE.md`  
- `docs/architecture/PROJECT_ARCHITECTURE.md`  
- `docs/architecture/DATABASE_DESIGN.md`  
- `docs/architecture/SIGESC_INTEGRATION.md`  
- `docs/architecture/SECURITY_MODEL.md`  
- `docs/architecture/IMPLEMENTATION_ROADMAP.md`  
- `docs/reports/PHASE5_FINAL_REPORT.md` (this file)  
