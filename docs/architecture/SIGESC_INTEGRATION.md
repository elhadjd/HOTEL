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

**Allowlisted hosts (Escolar):** `app.sisgesc.net`, `app.zyvoerp.com` (HTTPS only)

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

## 4. Guest ↔ customer mapping

| Local | Remote | Mapping |
|-------|--------|---------|
| `Guest` | Aggregate `Customer` | `GuestCustomerMapping` + `SyncMapping(localType=Guest)` |

Rules (from Escolar FinancialResponsible pattern):

- SIGESC is commercial source of truth  
- Guest remains usable if Aggregate is down  
- Matching produces candidate report; **no silent auto-link when ambiguous**  
- `company_id` for writes comes from connection, never the browser  
- Do not overwrite remote fiscal fields blindly  

---

## 5. Check-out financial handoff (Phase 5)

**Operational check-out completes locally** (room → DIRTY, stay closed).  

Financial completion:

1. Ensure guest mapping exists (or explicit create authorized)  
2. Call only **documented** Aggregate endpoints (customer upsert; later sale/subscription if approved)  
3. Persist external refs + sync status  
4. UI shows “financial confirmation pending” until SIGESC confirms  

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
