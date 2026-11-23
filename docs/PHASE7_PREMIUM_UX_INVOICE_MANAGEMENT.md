# Phase 7 — Premium UX, Searchable Dropdowns & Continuous Invoice Management

**Repository:** `elhadjd/HOTEL`  
**Base HEAD at start:** `5460aafca867f16abda01f15278db8320f5e7ecd` (`main`)  
**Branch:** `cursor/phase7-premium-ux-invoice-fcf5`

## Features implemented

### Searchable dropdowns
- New reusable `SearchableSelect` (`src/components/ui/searchable-select.tsx`)
- Search input, accent/case-insensitive filtering, keyword fields (SKU, email, phone, codes)
- Keyboard navigation, clear, loading/empty/no-results/error, 200-result cap for large lists
- Applied to: invoice create/detail forms, reservation create (room + guest), room create (category), stay→invoice filters

### Invoice / quotation workspace
- Premium listing with summary cards, search, filters (type, status, guest, date range), status pills
- Create drawer with sections: context, products, live estimated summary
- Detail page: context, lines, central totals, integration history, **Adicionar produtos** when eligible
- Stay workspace link: open/create document for selected stay (`?stayId=`)

### Continuous editing
- Existing `POST /sales/{sale_key}/items` path via `addItemsToInvoice`
- **Live central status refresh before every add-items mutation**
- Blocks `Publicado`, `Pago`, `Cancelado`, `Recusado`, `Anulado`, unknown/empty status
- Same central document updated (no new `external_id` for appends)
- Duplicate-prevention hint when stay already has an editable CREATED document

### Pricing / discounts (Aggregate contract)
| Capability | Status |
|---|---|
| Central `sale_price` as authority | Implemented — browser `unitPrice` never trusted |
| Line `discount` | Implemented — validated `0 ≤ discount ≤ qty × central price` |
| Negotiated unit price override | **Not implemented** — contract allows optional `unit_price`, but Hotelaria policy keeps verified central price only |
| Publish / pay / stock | Out of scope — SIGESC UI only |

## Components created / updated
- `SearchableSelect` + unit tests
- Invoice list/detail clients and pages
- Invoice service: filters, stay/hotel context, editable-state helpers, summary helper
- Prisma: `stayId`, `hotelId`, `createdByUserId` on `InvoiceIntegration`
- API: list query filters; create accepts `stayId`/`hotelId`; `eligible-for-stay` helper route

## Dropdown audit
| Location | Before | After |
|---|---|---|
| Invoices guest/reservation/product | Native `<select>` | SearchableSelect |
| Reservations room/guest | Native `<select>` | SearchableSelect |
| Rooms category | Native `<select>` | SearchableSelect |
| Stays → invoice | N/A | Prefill via query + searchable filters |
| Stay room transfer | Free-text room UUID | SearchableSelect (code/hotel/status) |
| Catalog mapping central product | Free-text product ID | SearchableSelect from catalog results |
| Invoice type Cotação/Proforma | Native (2 options) | Kept native (tiny fixed list) |
| Product kind filters | Native (tiny enum) | Kept native |

## Security controls
- Tenant-scoped invoice/guest/stay/hotel lookups
- RBAC `integrations.invoices` unchanged
- Central price verification on every line
- Central status re-check before mutations
- Audit logs on create and append
- Idempotent create via `external_id`; append uses attempt tokens
- No Aggregate credentials in UI responses

## Tests
- `searchable-select.test.ts` — filter by name/SKU/email/phone, empty, large list cap
- `phase7-invoice-ux.test.ts` — editable/readonly status guards, line summary
- Existing Phase 4/5 Aggregate invoice tests remain the mock-backed integration suite

## Known limitations / deferred
- Live Aggregate staging not exercised in this run (mock + unit only)
- Quantity edit / line removal on existing central documents not exposed (append-only via Aggregate items endpoint)
- ~~Full pagination UI uses client-side filter over first page~~ → fixed in Phase 7.1 (`docs/PHASE7_1_FINAL_HARDENING.md`)
- Not every tiny enum `<select>` replaced (by design)
- Charts/export for reports deferred (no fake metrics)

## Classification
| Area | Status |
|---|---|
| Searchable selects | Implemented and unit-tested |
| Invoice list/create/detail UX | Implemented |
| Continuous add-items + status guards | Implemented; mock/unit tested; **not** live Aggregate tested |
| Stay convenience link | Implemented |
| Negotiated unit price override | Blocked by product policy (central price authority) |
| Publish/pay | Deferred to SIGESC central |
