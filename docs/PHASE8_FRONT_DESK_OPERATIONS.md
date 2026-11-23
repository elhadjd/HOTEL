# Phase 8 — Front Desk Command Center & Daily Hotel Operations

**Repository:** `elhadjd/HOTEL`  
**Base:** `main` @ `854062f` (Phase 7.1 merged)  
**Branch:** `cursor/phase8-front-desk-operations-fcf5`

## Features implemented

### Front Desk dashboard (`/dashboard/front-desk`)
- Tenant-scoped snapshot via `getFrontDeskSnapshot`
- Metrics: arrivals, departures, in-house guests, ready rooms (AVAILABLE+CLEAN+OK), occupied, dirty, cleaning/inspecting, OOS, maintenance, pending check-ins/outs, open HK tasks, active maintenance
- Sections: expected arrivals, departures, current guests, room readiness, operational alerts (each with deep link)
- Filters: hotel, date navigation

### Room operations board (`/rooms/operations`)
- Visual room cards with occupancy / housekeeping / maintenance
- Ready vs blocked allocation indicators (Phase 6 readiness invariant preserved)
- Filters: hotel, floor, category, occupancy, housekeeping, search
- Links to stay, housekeeping, maintenance

### Guided check-in / check-out
- Multi-step UX reusing Phase 6 `checkInReservation` / `completeCheckOut` / `prepareCheckOut`
- Client-side eligibility preview; server remains authoritative
- Explicit confirmation; no claim of payment/publication on operational result

### Housekeeping & maintenance ops workspaces
- `/housekeeping/operations` — assign / start / complete / inspect (approve/reject)
- `/maintenance/operations` — assign / in progress / resolve
- Blocking maintenance does not evict active stays; resolution does not auto-CLEAN

### Active stay workspace (`/stays/[id]`)
- Guest, accommodation, companions, room history
- Operational account + linked Aggregate documents
- Inline consumption → append/create Cotação when eligible

### Operational consumption (`/operations/consumption` + `POST /api/v1/stays/{id}/consume`)
- Mapped products only; server-side price verification
- Append to eligible Cotação/Proforma via Phase 7.1 `addItemsToInvoice` + idempotency key
- Optional create+submit Cotação if missing
- Published/locked documents reject append; charge may remain operational-only

### Navigation
- Groups: Overview, Reception, Rooms, Operations, Integrations, System
- New entries for Front Desk, room board, HK/maint ops, consumption

## Existing features reused

| Capability | Source |
|---|---|
| Check-in / check-out atomicity & readiness | Phase 6 `stay-service`, `check-out-service` |
| Housekeeping lifecycle + CLEAN after inspection | Phase 6 `housekeeping-service` |
| Maintenance blocking | Phase 6 `maintenance-service` |
| Stay charges + central price verify | Phase 6 `stay-account-service` + Phase 5 products |
| Invoice append / idempotency / editable states | Phase 7 / 7.1 invoice service |
| SearchableSelect async | Phase 7.1 |

## Metrics definitions

| Metric | Rule |
|---|---|
| Ready rooms | `occupancy=AVAILABLE` AND `housekeeping=CLEAN` AND `maintenance=OK` AND `active` |
| Available (occupancy) | `occupancy=AVAILABLE` only — **not** equivalent to ready |
| Dirty | `housekeeping=DIRTY` |
| Under maintenance | `maintenance=UNDER_MAINTENANCE` |
| Out of service | `maintenance=OUT_OF_SERVICE` |
| Arrivals today | Reservations `CONFIRMED|PENDING` with `arrivalDate` on selected day |
| Departures today | Stays `ACTIVE|CHECKOUT_PENDING` with `expectedDeparture` on day |

## Security review

- All new APIs use `requireTenant` with existing permission codes
- Hotel filters validated against institution
- Consumption requires `stays.manage` + `integrations.invoices`
- Aggregate credentials never returned to UI
- Audit logs on consumption create/append
- No new Aggregate endpoints invented

## Database changes

None. Phase 8 reuses existing Prisma models/indexes.

## Tests

- `src/modules/front-desk/phase8-front-desk.test.ts`
  - Front Desk metrics + tenant isolation
  - Dirty / maintenance-blocked rooms not ready
  - Check-in → consumption → check-out turnover
  - HK inspection restores readiness; dirty after maintenance clear still blocked
- Regression: Phase 4–7.1 suites (run in CI / local verification)

## Known limitations

- Live Aggregate staging not exercised (`SIGESC_AGGREGATE_MODE=mock` in this environment)
- Consumption is hotel ops → Cotação append — **not** a restaurant POS / KDS / stock system
- Room history UI shows room UUIDs abbreviated (no denormalized room codes on history rows)
- Legacy `/housekeeping` and `/maintenance` pages kept alongside ops workspaces

## Staging requirements (pending)

1. Front Desk counts against real reservation/stay data
2. Check-in/out guided flows on staging Aggregate-linked guests
3. Consumption append to live Cotação + published rejection
4. Timeout/reconciliation on consume append

## Classification

| Area | Status |
|---|---|
| Front Desk dashboard | Implemented + DB-tested |
| Room board | Implemented + DB-tested |
| Guided check-in/out UX | Implemented; Phase 6 services reused |
| Housekeeping / maintenance ops | Implemented; lifecycle reused |
| Stay workspace + consumption | Implemented + mock Aggregate tested |
| Live Aggregate | **Pending** |
| Production readiness claim | **Not claimed** without staging |

## Routes added

- `GET /api/v1/front-desk`
- `GET /api/v1/rooms/operations`
- `POST /api/v1/stays/[stayId]/consume`
- Pages: `/dashboard/front-desk`, `/rooms/operations`, `/housekeeping/operations`, `/maintenance/operations`, `/stays/[id]`, `/operations/consumption`
