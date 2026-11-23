# Phase 8.1 — Operational Completion, Hardening & Full Functional Implementation

## Scope delivered

Transforms remaining placeholder / read-only Hotelaria modules into operational features with server-side business rules, tenant isolation, persistence, tests, and documentation.

### Rates / tarifas

- CRUD for rate plans (create, list with search/filters/pagination, activate/deactivate, edit).
- Seasonal windows with overlap rejection (same weekday/weekend constraints).
- Validity dates, min/max stay, included occupancy, extra guest amount, weekday/weekend flags, priority.
- Audit history (`RatePlanAudit`) plus institution `AuditLog`.
- Server-side `quoteAccommodation` with explicit selection rules:
  1. Active plans for hotel + category covering the night
  2. Weekday/weekend constraints
  3. Highest `priority` wins
  4. Seasonal override inside the winning plan
  5. Extra guests beyond `includedOccupancy` add `extraGuestAmount`
- Reservation create applies server quotes into `operationalTotal` / `nightlyRate` (browser prices are never authoritative).
- UI at `/rates` with quote breakdown.

Operational lodging rates are **not** SIGESC commercial product prices.

### Housekeeping

- Filters: hotel, status, floor, assignee, overdue.
- Assign, start, complete (with or without inspection), inspect approve/reject, reopen.
- Rejection **requires** a reason; room returns to `DIRTY`.
- Complete with inspection → `INSPECTING` until approval → `CLEAN`.
- Complete without inspection (explicit) → `CLEAN`.
- Dirty rooms are never presented as ready (`isRoomReadyForGuest` still requires CLEAN + OK + not occupied).
- Productivity helper for assignee metrics (7-day window).

### Maintenance

- Create with category, priority, blocksRoom, materials notes/cost, schedule.
- Status transitions: OPEN → ASSIGNED → IN_PROGRESS → WAITING_PARTS → RESOLVED / CANCELLED.
- Resolve requires resolution text.
- Resolving **never** sets housekeeping to CLEAN — only clears maintenance block when no other blocking tickets remain.
- Active stays are never evicted.
- Reopen restores `UNDER_MAINTENANCE` when `blocksRoom`.

### Reports

- Occupancy, reservations, stays, housekeeping, maintenance, commerce ops.
- Each block includes formula notes.
- Cotação/Proforma clearly separated from payment received.
- CSV export with BOM + formula-injection neutralization (`=`, `+`, `-`, `@`).

### Staff & settings

- Staff: list memberships, change role, suspend/reactivate (guards last admin / self).
- Settings: institution profile + per-hotel check-in/out and stay policies; Aggregate connection shown read-only.

## Database

Migration `20261123020000_phase8_1_rates_reports`:

- Rate plan fields: description, validity, stay limits, occupancy, extra guest, priority.
- Seasonal weekday/weekend flags.
- `rate_plan_audits` table.
- Maintenance: materials notes/cost, intervention notes, scheduled/reopened timestamps.

## APIs

| Method | Path | Permission |
|--------|------|------------|
| GET/POST | `/api/v1/rates` | rates.read / rates.write |
| GET/PATCH/POST | `/api/v1/rates/[id]` | rates.read / rates.write |
| POST | `/api/v1/rates/quote` | rates.read |
| GET | `/api/v1/reports/operational` | reports.read (`?format=csv&section=…`) |
| GET/POST | `/api/v1/staff` | staff.read |
| POST | `/api/v1/staff/[membershipId]` | staff.write |
| GET/POST | `/api/v1/settings` | settings.write (GET may fall back to staff.read) |
| POST | housekeeping/maintenance actions extended with reopen |

## External / staging limitations

- No real Aggregate financial operations executed in this phase.
- Attachments/photos for maintenance are not implemented (no shared file store yet).
- PDF export not added (CSV only — avoids new dependencies).
- Staging Aggregate end-to-end not declared validated without a live authorized environment.

## Regression posture

Preserves Phase 4–8 contracts: Aggregate-only central finance, readiness = AVAILABLE+CLEAN+OK, stay lifecycle, invoice UX, Front Desk.
