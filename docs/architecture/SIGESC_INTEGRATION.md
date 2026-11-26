# SIGESC Hotelaria — Aggregate Integration Contract

**Source of truth for contracts:** `elhadjd/SISGESC-COMERCIAL-NEW_LAYOUT` Aggregate API (`/api/v1/aggregate/multi-company/*`)  
**Mode default:** `SIGESC_AGGREGATE_MODE=mock` (switch to `http` in staging/production)

---

## 1. Consolidated Aggregate API (SIGESC ↔ HOTEL)

**Base path:** `{HOST}/api/v1/aggregate/multi-company`  
**Alias:** `{HOST}/api/v1/multi-company`

**Auth:**

```
Authorization: Bearer mca_…
# or
X-Api-Key: mca_…
```

**Correlation & Idempotency headers:**
- `X-Request-Id: <uuid>` (sent on every request and echoed by SIGESC on all responses including errors)
- `Idempotency-Key: <stable-key>` (sent on `POST /sales/{sale_key}/items`, `POST /sales/{sale_key}/publish`, and `POST /sales/{sale_key}/payments`)

**Key format:** `mca_[A-Za-z0-9]+` (min length 20)

**Allowlisted hosts:** `app.sisgesc.net`, `admin.sisgesc.net`, `app.zyvoerp.com`, `admin.zyvoerp.com` (HTTPS only; override via `SIGESC_AGGREGATE_ALLOWED_HOSTS`)

### Onboarding / users / connection

| Method | Path | Scope | Status |
|--------|------|-------|--------|
| GET | `/me` | — | **Consolidated** (also refreshes persisted scopes/name on connection test) |
| GET | `/onboarding` (alias `/bootstrap`) | `onboarding` \| `all` | **Consolidated** |
| GET | `/users` | `users` \| `all` | **Consolidated** |
| GET | `/users/{id}` | `users` \| `all` | **Consolidated** |
| GET | `/companies` | `companies` \| `all` | **Consolidated** |

### Customers (financial identity)

| Method | Path | Scope | Status |
|--------|------|-------|--------|
| GET | `/customers` | `customers` \| `all` | **Consolidated** (paginated, includes `address` & `country_id`) |
| GET | `/customers/{id}` | `customers` \| `all` | **Consolidated** |
| POST | `/customers` | `customers` \| `all` | **Consolidated** (uniqueness enforced per `company_id` → `422`) |
| PATCH/PUT | `/customers/{id}` | `customers` \| `all` | **Consolidated** (`company_id` ignored; editable from `/integrations/customers` & `/guests/[guestId]`) |

### Products & Pricing

| Method | Path | Scope | Status |
|--------|------|-------|--------|
| GET | `/products` | `products` \| `all` | **Consolidated** (supports `kind=product\|service\|all`, returns `kind`) |
| GET | `/products/{id}` | `products` \| `all` | **Consolidated** |
| POST | `/products` | `products` \| `all` | **Consolidated** |
| PATCH/PUT | `/products/{id}` | `products` \| `all` | **Consolidated** (price/tax edits immediately update local `ProductCatalogMapping` rows) |

### Sales, Fiscal Publication & Settlement

| Method | Path | Scope | Status |
|--------|------|-------|--------|
| GET | `/sales` | `sales` \| `all` | **Consolidated** |
| GET | `/sales/{sale_key}` | `sales` \| `all` | **Consolidated** (canonical states: `Cotação`, `Proforma`, `Publicado`, `Pago`, `Anulado`) |
| POST | `/sales` | `sales` \| `all` | **Consolidated** (`Cotação`/`Proforma`; DB-enforced `external_id` idempotency `201`/`200`) |
| POST | `/sales/{sale_key}/items` | `sales` \| `all` | **Consolidated** (`FOR UPDATE` lock + `idempotency_key`; `409` if published/paid/cancelled) |
| GET | `/payment-methods` | `sales` \| `payments` \| `all` | **Consolidated** (lists real company payment methods & bank/cash accounts) |
| POST | `/sales/{sale_key}/publish` | `sales` \| `all` | **Consolidated** (converts Cotação/Proforma → official `FT` with sequential numbering, SAF-T-AO hash & stock deduction) |
| POST | `/sales/{sale_key}/payments` | `sales` \| `payments` \| `all` | **Consolidated** (partial/full `RC` receipt payment with `FOR UPDATE` lock & mandatory `idempotency_key`) |

---

## 2. Hotelaria client architecture

```
src/modules/sigesc-integration/
  client.ts          # getAggregateClient() singleton
  port.ts            # AggregatePort + resolveAggregateMode()
  http-adapter.ts    # documented endpoints only + anti-path-traversal + X-Request-Id + Idempotency-Key
  mock-adapter.ts    # deterministic local/test adapter (including publish, settlement & timeout fixtures)
  crypto.ts          # AES-256-GCM encrypt/decrypt mca_
  host-allowlist.ts  # SSRF protection
  sanitize.ts        # redact secrets from logs/errors
  onboarding-service.ts
  connection-service.ts
  connection-context.ts
  customers/customers-service.ts
  products/products-service.ts
  invoices/invoice-service.ts
  guests/customer-to-guest-service.ts
  types.ts
```

**Rule:** no ad-hoc `fetch` to Aggregate outside this module.

---

## 3. Onboarding workflow (Hotelaria)

1. Validate `mca_` format  
2. `GET /onboarding` **before** any DB write  
3. Pick authorized company from envelope  
4. Encrypt key → store `AggregateConnection`  
5. Upsert `Institution` by `external_id` / NIF / email  
6. Import users as `INVITED` with **safe default role** (store `aggregateSuggestedLevel`; **never auto-grant admin**)  
7. Write `SyncMapping` for Institution + Users  
8. Audit + `AggregateSyncRun(kind=ONBOARDING)`  

Key rotation: validate new key first; keep previous ciphertext on failure.

---

## 4. Guest ↔ customer mapping

| Local | Remote | Mapping |
|-------|--------|---------|
| `Guest` | Aggregate `Customer` | `GuestCustomerMapping` |

Rules:

- SIGESC Customer is the financial identity; Guest is the hospitality profile — never merge entities  
- **New Guests require** a valid Central Customer (`LINKED`)  
- Central Customers may exist **without** a Guest and can be edited in-place from `/integrations/customers` or `/guests/[guestId]`  
- Convert via `POST /api/v1/integrations/sigesc/customers/convert` (individual + bulk ≤50)  
- Matching produces candidate report; **no silent auto-link when ambiguous**  
- `company_id` / `institutionId` for writes come from connection/session, never the browser  
- Unlink forbidden; re-associate only  

---

## 5. Central product pricing

- Official `sale_price` / `tax_percent` come from Aggregate only  
- Editing a central product/price in `/integrations/products` sends `PATCH /products/{id}` to SIGESC and immediately updates all matching `ProductCatalogMapping` rows (`centralSalePrice`, `centralTaxPercent`, `centralName`, `centralPriceVerifiedAt`, `lastSyncedAt`)  
- Invoice lines always call `verifyCentralProductPrice` before draft/submit  
- UI freshness: 5 minutes; manual refresh via `POST /api/v1/integrations/sigesc/catalog-mappings/{id}/refresh`

---

## 5b. Invoice Publication & Settlement directly from HOTEL

Reception/finance users with RBAC permission **`integrations.invoices.settle`** (granted to `hotel_admin`, `manager`, `supervisor`, `receptionist`) can publish and settle invoices without leaving HOTEL:

- **UI Entry Points:**
  - `/integrations/invoices/[id]` — full publish button, partial/full payment form with real SIGESC payment methods & bank/cash accounts, official `orderReference` (`FT …`), `Por liquidar` balance, and SIGESC `RC` receipts history table.
  - `/stays/[id]` — compact inline publish & settle actions next to each linked stay invoice.
  - `/check-out` — inline publish & settle actions in steps 2 & 3 so check-out reception can close operational stay and collect fiscal payment in one flow.
- **Safety & Idempotency:**
  - Every publish and payment attempt generates a stable client `idempotencyKey` (keyed by payload signature) and records `PUBLISH_PENDING` / `PUBLISH_OK` or `PAYMENT_PENDING` / `PAYMENT_OK` in `InvoiceSubmissionAttempt`.
  - Network timeouts (`503`/`504`) mark the local record `RECONCILIATION_REQUIRED` and surface an explicit warning banner instead of silently assuming success or failure.
  - UI and server both block duplicate payments, `amount <= 0`, `amount > rest_payable`, and payments on `Cotação`/`Proforma`, `Pago`, or `Anulado` documents.

---

## 6. Security of API keys

- Encrypt at rest (AES-256-GCM); `AGGREGATE_ENCRYPTION_KEY` required in production  
- Never return plaintext to frontend (only `keyPrefix`)  
- Never log raw keys (`redactSecrets`)  
- Path segments validated against traversal (`assertSafePathSegment`)  
- Timeouts (15s), safe retries, rate-limit handling  

---

## 7. Configuration

```
SIGESC_AGGREGATE_MODE=mock          # set to 'http' for live SIGESC
SIGESC_AGGREGATE_HOST=https://app.sisgesc.net
AGGREGATE_ENCRYPTION_KEY=…          # ≥32 chars; required in production
SIGESC_REGISTER_URL=…               # deep-link for “create company first”
```
