# SIGESC Hotelaria — Aggregate Integration Contract

**Source of truth for contracts:** `elhadjd/SIGESC-ESCOLAR` docs + `src/modules/integration/aggregate/*`  
**Mode default:** `SIGESC_AGGREGATE_MODE=mock`  
**Live HTTP:** disabled until authorized staging validation  

---

## 1. Confirmed Aggregate API (from Escolar)

**Base path:** `{HOST}/api/v1/aggregate/multi-company`  
**Alias (subscriptions docs):** `{HOST}/api/v1/multi-company`  

**Auth:**

```
Authorization: Bearer mca_…
# or
X-Api-Key: mca_…
```

**Key format:** `mca_[A-Za-z0-9]+` (min length 20)

**Allowlisted hosts (Escolar):** `app.sisgesc.net`, `admin.sisgesc.net`, `app.zyvoerp.com`, `admin.zyvoerp.com` (HTTPS only; override via `SIGESC_AGGREGATE_ALLOWED_HOSTS`)

### Onboarding / users

| Method | Path | Scope | Status |
|--------|------|-------|--------|
| GET | `/onboarding` (alias `/bootstrap`) | `onboarding` \| `all` | **Confirmed — implement** |
| GET | `/users` | `users` \| `all` | **Confirmed — implement** |
| GET | `/users/{id}` | `users` \| `all` | Documented; optional |
| GET | `/me` | — | Prepared |
| GET | `/companies` | — | Prepared |

### Customers (financial identity)

| Method | Path | Scope | Status |
|--------|------|-------|--------|
| GET | `/customers` | `customers` \| `all` | **Implemented — Phase 4** |
| GET | `/customers/{id}` | | **Implemented** |
| POST | `/customers` | | **Implemented** (explicit create only) |
| PATCH/PUT | `/customers/{id}` | | **Implemented** (`company_id` ignored on update) |

### Products / sales

| Method | Path | Scope | Status |
|--------|------|-------|--------|
| GET/POST/PATCH | `/products`… | `products` \| `all` | **Implemented — Phase 4** |
| POST/GET | `/sales`… | `sales` \| `all` | **Implemented — Cotação/Proforma only** |
| `/subscriptions`… | `subscriptions` \| `all` | Confirmed in Laravel docs — **not for Hotelaria Phase 4** |
| Publish / pay / stock | — | — | **Central SIGESC only — never via Aggregate from Hotelaria** |

See `docs/architecture/PHASE4_AGGREGATE_COMMERCE.md`.

---

## 2. Hotelaria client architecture

```
src/modules/sigesc-integration/
  client.ts          # getAggregateClient() singleton
  port.ts            # AggregatePort + resolveAggregateMode()
  http-adapter.ts    # documented endpoints only
  mock-adapter.ts    # default for tests & local dev
  crypto.ts          # AES-256-GCM encrypt/decrypt mca_
  host-allowlist.ts  # SSRF protection
  sanitize.ts        # redact secrets from logs/errors
  onboarding-service.ts
  customers/customers-service.ts
  products/products-service.ts
  invoices/invoice-service.ts
  guests/customer-to-guest-service.ts
  connection-context.ts
  types.ts
```

**Rule:** no ad-hoc `fetch` to Aggregate outside this module.

---

## 3. Onboarding workflow (Hotelaria)

Mirrors Escolar `connectAggregateAccount`:

1. Validate `mca_` format  
2. `GET /onboarding` **before** any DB write  
3. Pick authorized company from envelope  
4. Encrypt key → store `AggregateConnection`  
5. Upsert `Institution` by `external_id` / NIF / email  
6. Import users as `INVITED` with **safe default role** (store `aggregateSuggestedLevel`; **never auto-grant admin**)  
7. Write `SyncMapping` for Institution + Users  
8. Audit + `AggregateSyncRun(kind=ONBOARDING)`  
9. Redirect to dashboard  

Key rotation: validate new key first; keep previous ciphertext on failure.

---

## 4. Guest ↔ customer mapping (Phase 5)

| Local | Remote | Mapping |
|-------|--------|---------|
| `Guest` | Aggregate `Customer` | `GuestCustomerMapping` |

Rules:

- SIGESC Customer is the financial identity; Guest is the hospitality profile — never merge entities  
- **New Guests require** a valid Central Customer (`LINKED`)  
- Central Customers may exist **without** a Guest  
- Convert via `POST /api/v1/integrations/sigesc/customers/convert` (individual + bulk ≤50)  
- Matching produces candidate report; **no silent auto-link when ambiguous**  
- `company_id` / `institutionId` for writes come from connection/session, never the browser  
- Unlink forbidden; re-associate only  
- Historical unlinked guests: `NEEDS_RESOLUTION` (preserve history; block reservation/invoice until resolved)

---

## 5. Central product pricing (Phase 5)

- Official `sale_price` / tax from Aggregate only  
- `legacy_historical_price` is audit residue — never authoritative  
- Invoice lines always call `verifyCentralProductPrice` before draft/submit  
- UI freshness: 5 minutes; stale cache must not be shown as confirmed current  
- Refresh: `POST /api/v1/integrations/sigesc/catalog-mappings/{id}/refresh`

---

## 5b. Check-out financial handoff

**Operational check-out completes locally** (room → DIRTY, stay closed).  

Financial completion (Cotação/Proforma only where Aggregate permits):

1. Guest must be LINKED to Central Customer  
2. Verify central product prices  
3. Persist `InvoiceIntegration` + `external_id` idempotency  
4. Never use local operational price fallback  

**Never** mark fiscal completion locally without remote confirmation.

---

## 6. Security of API keys

- Encrypt at rest (AES-256-GCM); `AGGREGATE_ENCRYPTION_KEY` required in production  
- Never return plaintext to frontend (only `keyPrefix`)  
- Never log raw keys (`redactSecrets`)  
- Never store in `localStorage` / HTML  
- Timeouts (15s), safe retries, rate-limit handling  
- Connection statuses: ACTIVE | ERROR | REVOKED | DISCONNECTED  

---

## 7. Mock fixtures

Default mock key (dev/tests only): documented in mock adapter (same style as Escolar `mca_mockvalidkey…`).  

Failure keys for tests: revoked, no-scope, rate-limit, timeout, unavailable.

---

## 8. Explicit gaps (do not simulate as production-ready)

| Capability | Gap |
|------------|-----|
| Live Aggregate staging for Hotelaria | Not validated in this environment |
| Stay → official invoice | No Hotelaria-specific sales contract confirmed |
| Payment webhooks | Escolar notes polling until events exist |
| SIGESC-CLINIC Aggregate | Clinic has **no** Aggregate client — not a reference |
| Main Laravel changes | Forbidden without approved integration requirement |

---

## 9. Configuration

```
SIGESC_AGGREGATE_MODE=mock
SIGESC_AGGREGATE_HOST=https://app.sisgesc.net
AGGREGATE_ENCRYPTION_KEY=…   # ≥32 chars; required in production
SIGESC_REGISTER_URL=…        # deep-link for “create company first”
```
