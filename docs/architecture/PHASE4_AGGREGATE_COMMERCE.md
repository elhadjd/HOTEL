# Phase 4 — Aggregate Customers, Products & Invoices

**Mode default:** `SIGESC_AGGREGATE_MODE=mock`  
**Live HTTP:** requires authorized staging host + `mca_` scopes  
**Contracts:** `docs/contracts/API_AGGREGATE_{CUSTOMERS,PRODUCTS,INVOICES}.md`

## Financial boundary

| Owned by SIGESC central | Owned by Hotelaria |
|-------------------------|--------------------|
| Financial customers & IDs | Operational guests |
| Product catalog, prices, tax % | Local↔central mappings |
| Invoice records, numbering, fiscal publish | Cotação/Proforma submission attempts |
| Payments, stock movements | Idempotency / reconciliation state |

Hotelaria **never** creates `Publicado` / `Pago` via Aggregate.

## Authentication

- Canonical base: `{HOST}/api/v1/aggregate/multi-company`
- Header: `Authorization: Bearer mca_…` (key stays encrypted AES-256-GCM server-side)
- Scopes: `customers` · `products` · `sales` · or `all`
- Institution Aggregate connection from onboarding — never browser-supplied company/connection IDs

## Supported endpoints

| Domain | Method | Path | Scope |
|--------|--------|------|-------|
| Customers | GET | `/customers` | customers\|all |
| Customers | GET | `/customers/{id}` | customers\|all |
| Customers | POST | `/customers` | customers\|all |
| Customers | PATCH/PUT | `/customers/{id}` | customers\|all |
| Products | GET | `/products` | products\|all |
| Products | GET | `/products/{id}` | products\|all |
| Products | POST | `/products` | products\|all |
| Products | PATCH/PUT | `/products/{id}` | products\|all |
| Sales | POST | `/sales` | sales\|all |
| Sales | POST | `/sales/{sale_key}/items` | sales\|all |
| Sales | GET | `/sales/{sale_key}` | sales\|all |
| Sales | GET | `/sales?company_id&source&state` | sales\|all |

**Intentionally excluded:** fiscal publish, payments, stock APIs, undocumented inbound webhooks as primary path, inventing search-by-`external_id` (recovery uses documented idempotent re-POST).

## Guest ↔ Customer mapping

- Guests start `UNLINKED`; never auto-create central customers.
- Explicit link / create-from-guest / unlink (unlink does not delete central customer).
- Unique `(institutionId, externalCustomerId)` prevents duplicate links.
- Search by NIF/email/phone before create; no name-only merge.

## Product catalog mapping

- `ProductCatalogMapping` stores `localCode`, optional local operational price, and central `product_id`.
- Local and central prices are never silently overwritten either way.
- Invoice lines require an active mapping or an explicit validated central product id.

## Invoice idempotency

1. Persist local draft with unique `external_id` **before** network call.
2. Claim `SUBMITTING` with `updateMany` to block concurrent submits.
3. On `201` / idempotent `200` → persist central totals, `sale_key`, state.
4. On timeout/503 → `RECONCILIATION_REQUIRED`; never mint a new `external_id`.
5. Reconcile by re-POSTing the **same** `external_id` (documented idempotency) or `GET /sales/{sale_key}` when known.

## Hotelaria APIs (tenant RBAC)

- `GET/POST /api/v1/integrations/sigesc/customers`
- `GET/PATCH /api/v1/integrations/sigesc/customers/{id}`
- `POST /api/v1/guests/{guestId}/customer-mapping`
- `GET/POST /api/v1/integrations/sigesc/products`
- `GET/PATCH /api/v1/integrations/sigesc/products/{id}`
- `GET/POST /api/v1/integrations/sigesc/catalog-mappings`
- `GET/POST /api/v1/integrations/sigesc/invoices`
- `POST …/invoices/{id}/submit|reconcile|refresh|items`

Permissions: `integrations.customers`, `integrations.products`, `integrations.invoices`.

## UI

- `/integrations/sigesc` — connection hub
- `/integrations/customers` — search/create
- `/integrations/products` — catalog + mappings
- `/integrations/invoices` — Cotação/Proforma workflow
- `/guests/{id}` — link/create/unlink mapping

## Ops / staging

1. Ensure Aggregate key scopes include `customers`, `products`, `sales` (or `all`).
2. Set allowlisted `SIGESC_AGGREGATE_HOST` and `SIGESC_AGGREGATE_MODE=http` only for authorized staging.
3. Run migrations; call `ensureInstitutionRoles` (or re-seed) so new permissions exist.
4. Do **not** claim production readiness without staging verification against live SIGESC.
