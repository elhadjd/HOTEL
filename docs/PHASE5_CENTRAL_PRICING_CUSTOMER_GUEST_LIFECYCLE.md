# Phase 5 — Centralized Product Pricing & Customer↔Guest Lifecycle

**Status:** Implemented (mock Aggregate)  
**Branch:** `cursor/phase5-pricing-guest-lifecycle-fcf5`  
**Migrations:** `20261122140000_phase5_pricing_guest_lifecycle`, `20261122140001_phase5_guest_needs_resolution_backfill`

---

## 1. Product pricing authority

SIGESC Central is the **only** source of truth for sale prices of integrated catalog items.

| Field | Role |
|-------|------|
| `centralProductId` | Central product/service id |
| `centralCompanyId` | Connected company (server-derived) |
| `kind` | `PRODUCT` \| `SERVICE` |
| `centralSalePrice` | Last **verified** cache of Aggregate `sale_price` |
| `centralTaxPercent` | Last verified tax (when Aggregate returns it) |
| `centralPriceVerifiedAt` | Timestamp of last successful Aggregate verification |
| `legacyHistoricalPrice` | Renamed from Phase 4 `local_operational_price` — **non-authoritative audit residue** |
| Local codes/labels | Operational metadata only — not financial |

**Freshness policy:** cached central price is considered verified-current for **5 minutes** (`CENTRAL_PRICE_FRESHNESS_MS`). UI must label stale/unverified prices and offer refresh. Invoice creation **always** re-verifies via Aggregate and never falls back to `legacyHistoricalPrice` or browser `unitPrice`.

---

## 2. Removed / deprecated local pricing

- Column `local_operational_price` → renamed to `legacy_historical_price` (data preserved).
- Catalog upsert API (`.strict()` Zod) rejects any local price write.
- Products UI shows Central price + verification state; historical residue shown only as audit note.

---

## 3. Customer and Guest relationship

| Concept | Owner | Rule |
|---------|-------|------|
| **Customer** | SIGESC Central | Financial identity; may exist without a Hotelaria Guest |
| **Guest** | Hotelaria | Operational hospitality profile; **must** have a valid Central Customer |

Invariant for **new** Guests: `GuestCustomerMapping.syncStatus = LINKED` with non-null `externalCustomerId`.

Uniqueness:

- One Guest → one mapping (`guestId` unique).
- One `(institutionId, externalCustomerId)` → one Guest (DB unique).

Unlink is **forbidden**. Re-associate to another valid customer instead.

---

## 4. Individual conversion

`POST /api/v1/integrations/sigesc/customers/convert` with `{ centralCustomerId }`

Requires: `integrations.customers` **and** `guests.write`.

Flow: resolve connection → get customer → company check → create Guest + LINKED mapping (transactional via `createGuest`) → audit.

Outcomes: `converted` | `already_associated` | `invalid_customer` | `foreign_company` | `insufficient_data` | `aggregate_unavailable` | `failed`.

---

## 5. Bulk conversion

Same endpoint with `{ centralCustomerIds: [...] }`.

- Max batch: **50** (`MAX_CUSTOMER_TO_GUEST_BATCH`).
- Per-customer independent transactions (one failure does not roll back siblings).
- Duplicate ids in the request → `duplicate_in_batch`.
- Institution/connection derived **only** from authenticated `TenantContext`.

---

## 6. Permissions

| Action | Permissions |
|--------|-------------|
| Convert customer → Guest | `integrations.customers` + `guests.write` |
| Create Guest (existing/new customer) | `guests.write` + `integrations.customers` |
| Catalog map / refresh price | `integrations.products` |
| Invoice draft/submit | `integrations.invoices` |
| Guest mapping link/reassociate | `integrations.customers` |

No permission broadening beyond existing Phase 4 codes.

---

## 7. Database constraints

- `GuestCustomerMapping.guestId` unique.
- `@@unique([institutionId, externalCustomerId])`.
- Enum `CustomerSyncStatus.NEEDS_RESOLUTION` for historical unlinked guests.
- `ProductCatalogMapping.central_price_verified_at` added.
- `legacy_historical_price` renamed in place (no data loss).

---

## 8. Migration & historical data

1. Add enum value `NEEDS_RESOLUTION`.
2. Rename price column; add verification timestamp.
3. Backfill: `UNLINKED` mappings with null/empty `external_customer_id` → `NEEDS_RESOLUTION`.
4. Historical Guests retained; blocked from new reservations/invoices until resolved.
5. DB does **not** force NOT NULL on `external_customer_id` immediately (compatible with historical rows). Application + service layer enforce for new creates and operational use.

---

## 9. Aggregate API dependencies

Documented only (see `docs/contracts/API_AGGREGATE_*.md`):

- `GET/POST /customers`, `GET /customers/{id}`
- `GET/POST/PATCH /products…` (`sale_price`, `tax_percent`, `company_id`)
- `POST /sales` Cotação/Proforma only (unchanged Phase 4 financial boundary)

No inventing endpoints. Live Aggregate staging **not** validated in this environment.

---

## 10. Failure & reconciliation

| Case | Behavior |
|------|----------|
| Central price unavailable | Block invoice; surface error |
| Stale UI cache | Show “não verificado”; refresh endpoint |
| Customer create timeout (Guest Workflow B) | No blind retry; search by email/phone/NIF; 409 reconciliation if ambiguous |
| Convert already linked | Return existing Guest (`already_associated`) |
| Concurrent convert | Unique constraint + service re-check → idempotent `already_associated` |
| Invoice Aggregate timeout | Existing Phase 4 `RECONCILIATION_REQUIRED` + persistent `external_id` |

---

## 11. Tests executed

- `phase5-lifecycle.test.ts` — create/convert/bulk/pricing/invoice/historical
- `phase4-integration.test.ts` / `phase4-commerce.test.ts` — regression
- Reservation conflict, onboarding/auth, crypto, mock, availability suites

---

## 12. Known limitations

- Live Aggregate staging not exercised.
- Historical `NEEDS_RESOLUTION` guests require explicit operator resolution (no auto-match by name).
- Cached `centralSalePrice` is informational for UI; invoices always re-verify.
- Guest Workflow B orphan Central customer possible if Guest persistence fails after successful create (Central may exist without Guest — allowed).
- DB-level NOT NULL on mapping foreign customer id deferred until historical remediation completes.
