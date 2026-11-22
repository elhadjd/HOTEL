# SIGESC Hotelaria — Database Design

**Engine:** MySQL 8.0 (Phase 6+; PostgreSQL legacy archived)  
**ORM:** Prisma 6  
**IDs:** UUID (`uuid()`)  
**Tenant key:** `institutionId` on every business table  

---

## 1. Entity relationship overview

```
Institution 1──* Hotel 1──1 HotelSettings
     │              │
     │              ├──* RoomCategory 1──* Room
     │              │         │              ├── occupancy / housekeeping / maintenance dims
     │              │         └──* RatePlan / SeasonalRate
     │              │
     │              ├──* Reservation 1──* ReservationRoom ── Room
     │              │         │
     │              │         ├──* ReservationGuest ── Guest
     │              │         └── 1──0..1 Stay ── CheckIn / CheckOut
     │              │
     │              ├──* Guest ── GuestDocument
     │              │         └── GuestCustomerMapping (→ SIGESC customer)
     │              │
     │              ├──* HousekeepingTask
     │              └──* MaintenanceRequest

Institution 1──* Membership ── User
     │              └── Role ── Permission
     │
     ├── AggregateConnection / AggregateSyncRun
     ├── SyncMapping
     ├── AuditLog
     └── Notification
```

---

## 2. Core domain models

### Institution & Hotel

| Model | Purpose |
|-------|---------|
| `Institution` | Tenant / workspace linked to one SIGESC company (`sigescCompanyRef`) |
| `Hotel` | Accommodation establishment under an institution (multi-property) |
| `HotelSettings` | Check-in/out times, currency, timezone, localization, policies |

### Rooms

| Model | Purpose |
|-------|---------|
| `RoomCategory` | Type (Standard, Suite, …) — configurable, not hardcoded |
| `Room` | Physical unit: code, floor, capacity |
| `RoomAmenity` / join | Amenities catalog |
| `RoomImage` | Media refs (object storage keys later) |

**Separate operational dimensions on `Room` (not one overloaded status):**

- `occupancyStatus`: AVAILABLE | OCCUPIED | RESERVED  
- `housekeepingStatus`: CLEAN | DIRTY | CLEANING | INSPECTING  
- `maintenanceStatus`: OK | UNDER_MAINTENANCE | OUT_OF_SERVICE  

### Reservations & stays

| Model | Purpose |
|-------|---------|
| `Reservation` | Lifecycle header |
| `ReservationRoom` | Room assignment + stay dates per room |
| `ReservationGuest` | Guests on reservation |
| `Stay` | Active occupancy after check-in |
| `CheckInRecord` / `CheckOutRecord` | Operational audit of arrival/departure |
| `ReservationEvent` | Status history |

**Reservation status:** DRAFT → PENDING → CONFIRMED → CHECKED_IN → CHECKED_OUT | CANCELLED | NO_SHOW  

**Integrity:** overlapping CONFIRMED/CHECKED_IN stays for the same room are forbidden (transactional validation + unique exclusion strategy).

### Guests vs financial customers

| Model | Purpose |
|-------|---------|
| `Guest` | Operational hotel guest profile |
| `GuestDocument` | ID document references where legally appropriate |
| `GuestCustomerMapping` | Local guest ↔ Aggregate customer + sync status (`LINKED` required for new guests; `NEEDS_RESOLUTION` for historical orphans) |

**Phase 5 invariant:** every **new** Guest must be LINKED to a valid SIGESC Central Customer. A Central Customer may exist without a Guest. Unlink is forbidden; re-associate only. Unique `(institutionId, externalCustomerId)`.

### Product catalog (Aggregate)

| Model | Purpose |
|-------|---------|
| `ProductCatalogMapping` | Local service/product code ↔ central product id |
| `centralSalePrice` / `centralTaxPercent` / `centralPriceVerifiedAt` | Verified cache from Aggregate (5 min freshness for UI) |
| `legacyHistoricalPrice` | Non-authoritative Phase 4 residue (never used for invoices) |

See `PHASE5_CENTRAL_PRICING_CUSTOMER_GUEST_LIFECYCLE.md`.

### Housekeeping & maintenance

| Model | Purpose |
|-------|---------|
| `HousekeepingTask` | Clean / inspect assignments, priority, history |
| `MaintenanceRequest` | Issues, assignee, resolution; blocks conflicting assignment |

### Rates (operational)

| Model | Purpose |
|-------|---------|
| `RatePlan` | Base tariffs per category |
| `SeasonalRate` | Date / weekday / occupancy rules |
| `RoomAvailability` | Optional denormalized availability cache |

Amounts are operational estimates. Official invoices remain in SIGESC.

### IAM & integration

| Model | Purpose |
|-------|---------|
| `User`, `Session`, `Account` | Auth.js |
| `Role`, `Permission`, `RolePermission`, `Membership` | RBAC scoped to institution |
| `AggregateConnection` | Encrypted `mca_` key, scopes, status |
| `AggregateSyncRun` | Onboarding / users / customers sync audit |
| `SyncMapping` | Generic local↔remote identity map |
| `AuditLog` | Security & domain audit |
| `Notification` | In-app operational alerts |

---

## 3. Indexes & constraints (highlights)

- `@@unique([institutionId, slug])` / hotel code uniqueness per institution  
- `@@unique([hotelId, code])` on rooms  
- `@@unique([institutionId, localType, localId, remoteSystem])` + remote uniqueness on `SyncMapping`  
- Composite indexes: `(hotelId, occupancyStatus)`, `(hotelId, arrivalDate)`, housekeeping queues  
- Soft delete only where history requires it (`Membership` suspension, ended guest links) — prefer status enums  

---

## 4. Multi-tenant rules

1. Every query for business data includes `institutionId` from the **server session**, never from the request body alone.  
2. Hotel-scoped resources additionally verify `hotel.institutionId === session.institutionId`.  
3. Cross-tenant tests are mandatory (see SECURITY_MODEL).  

---

## 5. Transactions

Use Prisma `$transaction` for:

- Reservation create/confirm with availability check  
- Check-in (reservation → stay → room occupancy)  
- Check-out (stay close → room dirty → optional Aggregate handoff outbox)  
- Aggregate connect (validate remote first, then persist)  

---

## 6. Divergence from Escolar

| Topic | Escolar | Hotelaria |
|-------|---------|-----------|
| Database | MySQL | **PostgreSQL** |
| Domain | Students / enrollments | Hotels / rooms / stays |
| Commercial link | `FinancialResponsible` | `Guest` + `GuestCustomerMapping` |
| Money | School obligations (intent) | Reservation operational totals (intent) |

Patterns reused: `Institution`, IAM, `AggregateConnection`, `SyncMapping`, `AuditLog`, outbox-ready events.  
