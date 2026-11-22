# SIGESC Hotelaria — Phase 4 Final Report

**Integration:** SIGESC / ZYVO Aggregate Multi-Company API  
**Domains:** Customers · Products & Services · Invoices (Cotação/Proforma)  
**Repository:** `elhadjd/HOTEL`  
**Target:** `main`  
**Mode:** Full implementation + security audit + remediation + testing + merge  
**Report date:** 22 Nov 2026 (America/New_York)

---

## H. Final verdict

**APPROVED AND MERGED** — All implementation and security conditions passed and the integration PR was merged into `main`.

| Item | Value |
|------|--------|
| PR | https://github.com/elhadjd/HOTEL/pull/2 |
| Branch | `cursor/phase4-aggregate-commerce-fcf5` |
| Feature commit | `ac444e59e276440ed1bf54041a05d137a3ddec0c` |
| Merge commit / **main HEAD** | `70f65484a8c086e48f1bd7925a50051a81f62bd9` |
| Merged at | 22 Nov 2026, 4:06 AM America/New_York |
| CI | GitGuardian Security Checks — SUCCESS |

---

## A. Implementation

### Modules implemented

1. **Central customers** — search, list, detail, create, update; guest ↔ SIGESC customer mapping.
2. **Central products/services** — catalog search by kind, create, update; local operational ↔ central catalog mapping.
3. **Invoices** — explicit Cotação/Proforma creation, idempotency, reconciliation, refresh, add items (editable states only).

### Database models changed / added

| Model | Role |
|-------|------|
| `GuestCustomerMapping` | Extended with `connectionId`; unique `(institutionId, externalCustomerId)` |
| `ProductCatalogMapping` | Local code/label/operational price ↔ central product id, company, sale price, tax |
| `InvoiceIntegration` | Local invoice attempt: `externalId`, state machine, central totals/`sale_key` |
| `InvoiceSubmissionAttempt` | Audit of each submit/reconcile/add-items attempt |
| Enums | `InvoiceIntegrationStatus`, `CatalogKind`; `AggregateSyncKind.SALES` |

Migration: `prisma/migrations/20261122120000_phase4_aggregate_commerce/`

### New APIs (tenant RBAC)

| Method | Path | Permission |
|--------|------|------------|
| GET/POST | `/api/v1/integrations/sigesc/customers` | `integrations.customers` |
| GET/PATCH | `/api/v1/integrations/sigesc/customers/{id}` | `integrations.customers` |
| POST | `/api/v1/guests/{guestId}/customer-mapping` | `integrations.customers` |
| GET/POST | `/api/v1/integrations/sigesc/products` | `integrations.products` |
| GET/PATCH | `/api/v1/integrations/sigesc/products/{id}` | `integrations.products` |
| GET/POST | `/api/v1/integrations/sigesc/catalog-mappings` | `integrations.products` |
| DELETE | `/api/v1/integrations/sigesc/catalog-mappings/{id}` | `integrations.products` |
| GET/POST | `/api/v1/integrations/sigesc/invoices` | `integrations.invoices` |
| GET | `/api/v1/integrations/sigesc/invoices/{id}` | `integrations.invoices` |
| POST | `…/invoices/{id}/submit` | `integrations.invoices` |
| POST | `…/invoices/{id}/reconcile` | `integrations.invoices` |
| POST | `…/invoices/{id}/refresh` | `integrations.invoices` |
| POST | `…/invoices/{id}/items` | `integrations.invoices` |

### UI workflows

| Route | Purpose |
|-------|---------|
| `/integrations/sigesc` | Connection hub (status, scopes, links) |
| `/integrations/customers` | Search / create central customers |
| `/integrations/products` | Catalog browse, create, operational mappings |
| `/integrations/invoices` | Cotação/Proforma draft → submit → reconcile/refresh |
| `/guests/[guestId]` | Explicit link / create-from-guest / unlink |

### Customer mapping behavior

- Guests start `UNLINKED`; **never** auto-create a central customer on guest create.
- Explicit actions: search & link existing, create from guest (with candidate search first), unlink.
- Unlink does **not** delete the central customer.
- Duplicate central customer link within an institution is rejected.
- Mapping is institution-scoped; company must match the Aggregate connection.

### Product mapping behavior

- Local operational services map to central `product_id` via `ProductCatalogMapping`.
- Local operational price and central `sale_price` are stored separately and never silently overwritten either way.
- Invoice lines require an active mapping or a validated central product id — never invent IDs.
- No stock movements through catalog endpoints.

### Invoice creation and reconciliation behavior

1. User-authorized draft only (not triggered by reservation/guest events).
2. Server validates connection, scopes, guest mapping (or authorized fallback), product mappings, Cotação/Proforma only.
3. Persist unique `external_id` **before** network call.
4. Claim `SUBMITTING` with `updateMany` to prevent concurrent submission.
5. `201` / idempotent `200` → persist central totals, `sale_key`, state.
6. Timeout/503 → `RECONCILIATION_REQUIRED`; **never** mint a new `external_id`.
7. Reconcile by re-POSTing the same `external_id` (documented idempotency) or `GET /sales/{sale_key}` when known.
8. UI states clearly that publish/pay remain in SIGESC central.

### Key source files

- `src/modules/sigesc-integration/{port,types,mock-adapter,http-adapter,connection-context}.ts`
- `src/modules/sigesc-integration/customers/customers-service.ts`
- `src/modules/sigesc-integration/products/products-service.ts`
- `src/modules/sigesc-integration/invoices/invoice-service.ts`
- Contracts: `docs/contracts/API_AGGREGATE_{CUSTOMERS,PRODUCTS,INVOICES}.md`
- Architecture: `docs/architecture/PHASE4_AGGREGATE_COMMERCE.md`

---

## B. API contract compliance

Primary contracts (copied into the repo):

- `docs/contracts/API_AGGREGATE_CUSTOMERS.md`
- `docs/contracts/API_AGGREGATE_PRODUCTS.md`
- `docs/contracts/API_AGGREGATE_INVOICES.md`

Canonical base: `{HOST}/api/v1/aggregate/multi-company`  
Auth: `Authorization: Bearer mca_…`

### Customers

| Endpoint | Scope | Compliance |
|----------|-------|------------|
| `GET /customers` | customers \| all | Query filters + pagination envelope |
| `GET /customers/{id}` | customers \| all | Company-scoped lookup |
| `POST /customers` | customers \| all | Required `company_id` + `name`; duplicate 422 handling |
| `PATCH/PUT /customers/{id}` | customers \| all | Partial update; `company_id` not used for transfer |

**Excluded:** passwords, online-store session fields, inventing undocumented fields.

### Products

| Endpoint | Scope | Compliance |
|----------|-------|------------|
| `GET /products` | products \| all | `kind`/`catalog`, search, pagination |
| `GET /products/{id}` | products \| all | Detail |
| `POST /products` | products \| all | Documented create fields; simplified tax regime mock forces 0% |
| `PATCH/PUT /products/{id}` | products \| all | Partial update; company transfer ignored |

**Excluded:** inventory/stock mutation APIs.

### Invoices (sales)

| Endpoint | Scope | Compliance |
|----------|-------|------------|
| `POST /sales` | sales \| all | Cotação/Proforma only; `external_id` idempotency; ≥1 item |
| `POST /sales/{sale_key}/items` | sales \| all | Editable states only; explicit user action |
| `GET /sales/{sale_key}` | sales \| all | Refresh / reconciliation |
| `GET /sales?company_id&source&state` | sales \| all | List (documented filters only) |

**Intentionally excluded:**

- Creating `Publicado` / `Pago`
- Fiscal publication, payments, stock
- Undocumented search-by-`external_id` as primary recovery (uses idempotent re-POST instead)
- Inbound webhook as primary Hotelaria path

---

## C. Security audit

### Findings by severity

| Severity | Finding | Status |
|----------|---------|--------|
| CRITICAL | None confirmed in-scope after remediation | — |
| HIGH | None unresolved | — |
| MEDIUM | Guest detail used absolute `/guests/{id}` links (locale via app routing) | Acceptable / low risk |
| INFO | Live Aggregate not exercised against staging | Expected — mock default |

### Corrected / enforced controls

- Tenant membership required on all integration routes.
- RBAC permissions: `integrations.customers`, `integrations.products`, `integrations.invoices`.
- Aggregate connection and `company_id` derived server-side from institution — never trusted from the browser.
- Central customer/product IDs re-validated against connected company before use.
- Invoice access institution-scoped; concurrent submit claimed atomically.
- Aggregate key: AES-256-GCM at rest; never logged or returned in API/UI.
- Zod validation on request bodies; Aggregate errors sanitized before browser response.
- CSRF/session: existing Auth.js + `requireTenant` / `requirePageTenant` patterns reused.

### Tenant / RBAC test results

- Integration tests cover: no connection on foreign institution; duplicate guest mapping; invoice draft without linked customer rejected; company mismatch rejected by Aggregate mock (422).
- Role matrix: `hotel_admin` all; `manager`/`supervisor` commerce scopes without connection admin key ops as before; receptionist gets customers + invoices (not products write hub via products permission — receptionist has customers + invoices only).

### Secret-handling assessment

- No plaintext `mca_` in responses or UI.
- Mock keys are test fixtures only; GitGuardian check on PR #2: **SUCCESS**.
- Response summaries on submission attempts store non-secret sale metadata only.

### Remaining findings

None CRITICAL or HIGH. Staging live verification remains an operational prerequisite (not a code defect).

---

## D. Reliability

| Concern | Behavior |
|---------|----------|
| Customer create | No blind retry after ambiguous timeout; search before create; 422 duplicates surfaced |
| Product create/update | Validation errors mapped; company transfer ignored |
| Invoice idempotency | Unique `(institutionId, externalId)`; same key returns existing sale without merging items |
| Timeout recovery | `RECONCILIATION_REQUIRED` → controlled reconcile reuses same `external_id` |
| Duplicate prevention | DB unique + Aggregate idempotent `200` |
| Concurrent submission | Optimistic claim `DRAFT|…` → `SUBMITTING`; second claim fails |

Invoice status machine: `DRAFT` → `PENDING_SUBMISSION` / `SUBMITTING` → `CREATED` \| `RECONCILIATION_REQUIRED` \| `FAILED_VALIDATION` \| `FAILED_FINAL`.

---

## E. Testing

### Suites

| Suite | File | Coverage |
|-------|------|----------|
| Contract / unit | `phase4-commerce.test.ts` | Customers, products, sales mock contract (15 tests) |
| Integration | `phase4-integration.test.ts` | Connection, mapping, Cotação, timeout reconcile (8 tests) |
| Prior phases | onboarding, reservations, crypto, etc. | Regression intact |

### Commands run (all green)

```bash
npm test          # 54 passed
npm run typecheck
npm run lint
npm run build
npx prisma migrate deploy   # phase4 migration applied on local DB
```

### Security-oriented cases covered in tests

- Invalid company / missing scope (403/422)
- Duplicate email/NIF/customer_code
- Rejection of Publicado/Pago
- Empty items / invalid product or customer
- Idempotent repeated `external_id`
- Ambiguous timeout then safe recovery
- Cross-institution Aggregate ops without connection

---

## F. Operational readiness

| Topic | Status |
|-------|--------|
| Default Aggregate mode | `SIGESC_AGGREGATE_MODE=mock` |
| Live mode | `http` only with allowlisted host + authorized staging |
| Required scopes | `customers`, `products`, `sales` (or `all`) |
| Encryption | `AGGREGATE_ENCRYPTION_KEY` (existing) |
| Permissions seed | `ensureInstitutionRoles` / re-seed after deploy for new permission codes |
| Production claim | **Not** claimed — staging verification required |
| Phase 5 | Not started |

### Known external dependencies

- SIGESC Aggregate multi-company API (documented contracts only)
- Existing Hotelaria Aggregate onboarding connection
- PostgreSQL for mappings and invoice integration state

---

## G. GitHub integration

| Field | Value |
|-------|--------|
| PR URL | https://github.com/elhadjd/HOTEL/pull/2 |
| Title | Phase 4: SIGESC Aggregate customers, products & Cotação/Proforma invoices |
| Branch | `cursor/phase4-aggregate-commerce-fcf5` |
| Base | `main` |
| Final feature commit | `ac444e59e276440ed1bf54041a05d137a3ddec0c` |
| Merge result | **Merged** |
| Merge commit / main HEAD | `70f65484a8c086e48f1bd7925a50051a81f62bd9` |
| Required checks | GitGuardian — pass; mergeable state was CLEAN |

---

## Architectural rules preserved

1. SIGESC remains the financial authority (customers, catalog prices/tax, invoices, fiscal, payments, stock).
2. Hotelaria remains an independent app; integration only via Aggregate API.
3. No Laravel / SIGESC monorepo changes.
4. No direct central DB access.
5. Tenant isolation on every integration operation.
6. Cotação/Proforma only via Aggregate from Hotelaria.

---

## Related documentation

- `docs/architecture/PHASE4_AGGREGATE_COMMERCE.md` — operational integration guide
- `docs/architecture/SIGESC_INTEGRATION.md` — Aggregate client architecture (updated for Phase 4)
- `docs/contracts/API_AGGREGATE_*.md` — official API contracts

---

*End of Phase 4 final report.*
