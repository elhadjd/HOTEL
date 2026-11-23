# Phase 7.1 — Final Hardening & UX Completion

**Repository:** `elhadjd/HOTEL`  
**Base:** `main` @ `8bf60f5` (Phase 7 + searchable follow-up already merged)  
**Branch:** `cursor/phase7-1-final-hardening-fcf5`

This report distinguishes independently verified work from staging-pending and Aggregate-unsupported areas. Passing unit/mock integration tests alone does **not** equal production readiness for financial mutations against live SIGESC Aggregate.

---

## Fixed and tested

### Server-side invoice pagination & search
- Listing UI calls `GET /api/v1/integrations/sigesc/invoices` with `take`/`skip`, `q`, `state`, `status`, `guestId`, `from`, `to`.
- Filters and search run in Prisma **before** pagination; `count` returns the accurate filtered total.
- Search includes guest first/last name, email, phone (tenant-scoped guest lookup) plus document fields.
- Page resets to skip `0` when filters change; prev/next preserve the active filter set.
- Cross-tenant isolation: `institutionId` is always on the list `where` clause (integration test asserts foreign tenant total `0`).
- Browser never loads the full invoice table — default page size 20 (API cap 200).

### Append concurrency / idempotency hardening
- `POST …/invoices/{id}/items` accepts optional `idempotencyKey`.
- Attempt tokens are persisted on `ADD_ITEMS_PENDING` / `ADD_ITEMS_OK` / `ADD_ITEMS_FAILED` in `responseSummary.token`.
- Retry with the same key after `ADD_ITEMS_OK` refreshes from central and **does not** call Aggregate again.
- Unresolved `ADD_ITEMS_PENDING` for the same key → refresh + reconciliation error (no blind re-append).
- Concurrent append with a different key while another PENDING is unresolved (≤120s) is rejected.
- Timeouts leave PENDING (no FAIL) and mark `RECONCILIATION_REQUIRED` so a retry with the same key stays reconcilable instead of double-posting.
- Live central status is still refreshed and checked before every Aggregate mutation; non-editable states reject.

### Discount validation
- Exported `normalizeLineDiscount`: rejects negatives, rejects discount &gt; qty × verified unit price, rounds to 2 decimals.
- Browser `unitPrice` / totals remain non-authoritative; server uses `verifyCentralProductPrice`.
- RBAC unchanged: `integrations.invoices` required on create/append routes.
- Detail UI surfaces discrepancy when local line estimate ≠ central total (central wins).

### SearchableSelect async / cap
- Optional `onSearch` debounced async path for guests and catalog mappings.
- Cap messaging when ≥200 (or API page size) results; callers told to refine search instead of silently hiding records.
- Guests API accepts `take`; catalog-mappings GET accepts `q` / `take` / `activeOnly`.

### Invoice line editing UX honesty
- Detail and list copy state clearly: Aggregate is **append-only** for existing lines; no local simulate of delete/qty edit.

### Regression coverage added
- `phase7-1-hardening.test.ts`: discount unit cases; list search across pages + tenant isolation; append idempotency reuse; append gate on non-CREATED.

---

## Already correct and independently verified

- Phase 7 SearchableSelect base (keyboard, clear, loading/empty/error, accent-insensitive filter).
- Continuous append path via official `POST /sales/{sale_key}/items`.
- Editable/readonly central status sets (`Cotação`/`Proforma` vs `Publicado`/`Pago`/…).
- Create idempotency via `external_id` (Phase 4/5).
- Stay/hotel context fields and eligible-for-stay helper.
- Tenant scoping on invoice get/create/submit/refresh/reconcile.
- Mock Aggregate Phase 4/5 invoice contract tests remain the primary finance suite.

---

## Unsupported by the Aggregate contract

| Capability | Evidence | Hotelaria behavior |
|---|---|---|
| Delete / remove an existing sale line | HTTP adapter exposes only `POST /sales/{sale_key}/items`; no DELETE/PATCH line routes in official Aggregate client | Append-only; UI documents limitation |
| Patch quantity of an existing line | Same | Not implemented; never simulated locally |
| Exact-once append at Aggregate | `addSaleItems` has no request-id / Idempotency-Key header in the Aggregate HTTP contract used here | Local attempt-token reconciliation; **not** claimed as Aggregate exactly-once |
| Negotiated unit price override | Contract may allow `unit_price`, product policy keeps verified central `sale_price` | Unchanged policy |
| Publish / pay / stock | Out of Aggregate Hotelaria scope | SIGESC UI only |

---

## Pending staging validation

No authorized Aggregate staging credentials were exercised in this run. Live checks still pending:

1. Create Cotação against staging Aggregate.
2. Add a product; add another product to the same `sale_key`.
3. Confirm central document + totals.
4. Confirm published document rejects append.
5. Simulate timeout and run reconciliation.

Until those pass on staging, continuous invoice management is **not** declared production-ready for live finance.

---

## Deferred

- Charts / export for invoice reports.
- Replacing tiny enum `<select>` widgets (tipo Cotação/Proforma, etc.).
- Broader customer picker async wiring beyond invoice guest/product flows (customers already use Aggregate search APIs elsewhere).
- Schema migration for a dedicated unique `(invoiceId, idempotencyKey)` table (current attempt JSON token is sufficient for the supported safety model).

---

## Security review (modified surfaces)

| Surface | Controls |
|---|---|
| `GET /invoices` | `requireTenant("integrations.invoices")` + `institutionId` filter; guest/hotel labels only for same tenant |
| `POST /invoices/{id}/items` | Same RBAC; central refresh + editable assert; idempotency key; audit on success |
| `GET /guests?q&take` | `guests.read`; take capped at 200 |
| `GET /catalog-mappings?q` | `integrations.products`; tenant-scoped mappings |
| Responses | No Aggregate API keys / encrypted material in JSON |

---

## How to verify locally

```bash
npm run typecheck
npm run lint
npx prisma validate
npm test -- src/modules/sigesc-integration/phase7-1-hardening.test.ts \
  src/modules/sigesc-integration/phase7-invoice-ux.test.ts \
  src/components/ui/searchable-select.test.ts \
  src/modules/sigesc-integration/phase4-integration.test.ts \
  src/modules/sigesc-integration/phase5-lifecycle.test.ts \
  src/modules/stays/phase6-lifecycle.test.ts
npm run build
```

---

## Classification summary

| Area | Status |
|---|---|
| Server-side list pagination/search | Fixed + tested (DB mock suite) |
| Append idempotency / concurrency | Hardened + tested; Aggregate exact-once **not** claimed |
| Line edit/remove | Unsupported by Aggregate — documented |
| Discount validation | Verified + unit tested |
| SearchableSelect async/cap | Fixed + unit coverage on filter helper |
| Live Aggregate staging | **Pending** |
| Production readiness claim | **Not claimed** without staging |
