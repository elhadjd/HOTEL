# Phase 6 — Stay Lifecycle & MySQL Standardization

**Status:** Implemented  
**MySQL version validated in agent environment:** `8.0.46-0ubuntu0.24.04.5`  
**Docker image pin:** `mysql:8.0.36` (8.0 series)  
**Prisma provider:** `mysql`  
**Baseline migration:** `20261122160000_mysql_baseline_phase6`

---

## 1. MySQL architecture

- Character set: `utf8mb4` / collation `utf8mb4_unicode_ci`
- Monetary fields: `Decimal(14,2)` (and quantities `Decimal(12,3)`)
- JSON columns via Prisma `Json`
- Enums mapped to MySQL ENUMs by Prisma
- Connection URL: `mysql://USER:PASS@HOST:3306/DB` (no `?schema=public`)

## 2. Migration strategy

1. Phases 0–5 PostgreSQL SQL archived in `prisma/migrations_postgresql_legacy/` (never apply to MySQL).
2. Active history reset to a single MySQL baseline that creates the full current schema including Phase 6 stay expansions.
3. Fresh installs: `prisma migrate deploy` against empty MySQL database.
4. Existing Postgres environments: treat as legacy; export/transform with an explicit backup plan before any production cutover (not executed in this phase).
5. No destructive production migration was run.

## 3. Stay state machine

**ReservationStatus:** DRAFT → PENDING → CONFIRMED → CHECKED_IN → CHECKED_OUT | CANCELLED | NO_SHOW  

**StayStatus:** ACTIVE → CHECKOUT_PENDING → COMPLETED | CANCELLED  

Transitions are server-validated with conditional `updateMany` claims to prevent concurrent duplicates.

## 4–6. Check-in / active stays / check-out

See services:

- `src/modules/stays/stay-service.ts` — arrivals, check-in, companions, transfer, extend
- `src/modules/stays/check-out-service.ts` — preparation, operational completion, Aggregate handoff
- `src/modules/stays/stay-account-service.ts` — operational charges (central prices for mapped items)

## 7–8. Room transfer & date changes

- Transfer is transactional; rolls back on failure; writes `StayRoomHistory`; creates TURNOVER housekeeping on previous room.
- Extensions validate availability; early departure records `StayDateChange` without inventing central prices.

## 9–10. Housekeeping & maintenance

- Housekeeping statuses: PENDING → ASSIGNED → IN_PROGRESS → INSPECTION_REQUIRED → COMPLETED | REJECTED | CANCELLED
- Room becomes CLEAN only after approved inspection (or complete without inspection when configured).
- Check-out releases occupancy to AVAILABLE + DIRTY — never auto CLEAN.
- Maintenance `blocksRoom` sets `UNDER_MAINTENANCE`; does not auto-evict active stays.

## 11. Stay account & financial handoff

- Operational summary only.
- Mapped products: `verifyCentralProductPrice` only.
- Check-out may request Cotação/Proforma via existing Phase 4/5 invoice services.
- Ambiguous Aggregate results → `RECONCILIATION_PENDING` / stay `CHECKOUT_PENDING` unless `allowFinancialPending`.

## 12. Permissions

New codes: `stays.read`, `stays.manage`, `stays.transfer_room`, `stays.extend`, `housekeeping.manage`, `housekeeping.inspect`, `maintenance.manage`, `maintenance.resolve`, `stay_accounts.read`, `stay_accounts.manage` (plus existing check-in/out and read/write).

## 13. API contracts (tenant-scoped)

| Method | Path |
|--------|------|
| GET/POST | `/api/v1/check-in` |
| GET | `/api/v1/stays` |
| GET | `/api/v1/stays/departures` |
| GET | `/api/v1/stays/{id}` |
| POST | `/api/v1/stays/{id}/check-out` |
| POST | `/api/v1/stays/{id}/transfer` |
| POST | `/api/v1/stays/{id}/extend` |
| POST | `/api/v1/stays/{id}/companions` |
| GET/POST | `/api/v1/stays/{id}/charges` |
| GET/POST | `/api/v1/housekeeping` |
| POST | `/api/v1/housekeeping/{taskId}` |
| GET/POST | `/api/v1/maintenance` |
| POST | `/api/v1/maintenance/{requestId}` |

## 14. Tests

- `src/modules/stays/phase6-lifecycle.test.ts` (MySQL integration)
- Existing Phase 0–5 suites against MySQL

## 15. Deployment / backup

- Prefer mysqldump before any environment cutover.
- Do not apply `migrations_postgresql_legacy` to MySQL.
- Production Aggregate credentials and live financial ops are out of scope for this phase.

## 16. Known limitations

- Docker Compose may be unavailable in some agent VMs; local `mysql-server 8.0` used for validation.
- Live Aggregate staging not tested.
- Multi-room simultaneous occupancy per stay remains one active `Stay.roomId` (reservation may list multiple rooms).
- Production Postgres→MySQL data migration is documented, not executed.
