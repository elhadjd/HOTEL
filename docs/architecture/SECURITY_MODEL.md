# SIGESC Hotelaria — Security Model

---

## 1. Threat model (summary)

| Threat | Control |
|--------|---------|
| Cross-tenant data access | Server-derived `institutionId`; deny on mismatch |
| Aggregate key theft / leak | AES-256-GCM at rest; never to browser; redact logs |
| Privilege escalation via Aggregate admin import | Import as safe role; suggested level stored only |
| Double booking / race | Transactions + conflict checks |
| SSRF via Aggregate host | Env allowlist HTTPS hosts only |
| Credential stuffing | Rate limits on auth + Aggregate connect |
| XSS / injection | React escaping, Zod validation, Prisma parameterized queries |
| Session fixation / theft | Secure cookies, rotation, revocation via Session table |

---

## 2. Authentication

- Auth.js (NextAuth v5) credentials provider  
- Passwords: bcrypt (`bcryptjs`)  
- Sessions: database sessions (revocable)  
- Independent from SIGESC passwords (never imported)  
- Invite flow for Aggregate-imported users (`invitePending`)  

---

## 3. Authorization (RBAC)

Permissions are explicit codes: `module.action` (e.g. `reservations.confirm`, `rooms.assign`).

**Default roles:**

| Role code | Typical access |
|-----------|----------------|
| `hotel_admin` | Full institution |
| `manager` | Ops + reports + staff (limited) |
| `receptionist` | Reservations, guests, check-in/out |
| `housekeeping` | Housekeeping module |
| `maintenance` | Maintenance module |
| `supervisor` | Cross-ops oversight |
| `user` | Safe Aggregate import default |

Enforcement: **server-side** in services / API guards. UI hiding is UX only.

---

## 4. Tenant isolation

```
Session → Membership(ACTIVE) → institutionId
Resource load → assert resource.institutionId === institutionId
Hotel resource → assert hotel.institutionId match
```

Never accept `company_id` / `institutionId` from the client as authoritative.

**Required tests:** User of Hotel A cannot read/write Hotel B via ID manipulation (API + UI routes).

### Phase 5 — pricing & conversion controls

- Catalog upsert rejects local price fields (Zod `.strict()`).  
- Invoice lines ignore browser `unitPrice`; re-verify Aggregate `sale_price`.  
- Customer→Guest convert derives institution/connection from session only.  
- Bulk convert max 50; per-record isolation; duplicate id protection.  
- Guest create requires `guests.write` **and** `integrations.customers`.  
- Unlink endpoint rejected; reassociate only.  
- Concurrent conversion guarded by unique `(institutionId, externalCustomerId)`.

---

## 5. Aggregate key handling

- Validate format before network  
- Validate remote before persist  
- Encrypt with `AGGREGATE_ENCRYPTION_KEY`  
- Status health: ERROR does not necessarily revoke; REVOKED/DISCONNECTED block writes  
- Rotation keeps previous key if new key fails  

---

## 6. Application security checklist

- [x] Env validation with Zod at boot  
- [x] CSRF protection for cookie sessions (Auth.js defaults)  
- [x] Rate limiting on `/api/v1/auth/*` and `/api/v1/onboarding/*` (Phase 2)  
- [ ] Secure file upload pipeline (Phase 3+) — type/size/virus policy  
- [x] Structured logging without PII/secrets (temp passwords / reset tokens excluded)  
- [x] AuditLog on auth, RBAC changes, Aggregate connect, reservation mutations  
- [x] Secure error responses (no stack traces to clients)  
- [x] Forced first-login password change (`mustChangePassword`)  
- [x] Password recovery with hashed single-use tokens + generic responses  
- [x] Email outbox post-commit dispatch (secrets encrypted at rest)  

---

## 7. Data classification

| Class | Examples | Rules |
|-------|----------|-------|
| Secret | `mca_` keys, AUTH_SECRET | Encrypt / env only |
| Sensitive PII | Guest documents, phone, email | Access-controlled; minimize |
| Operational | Room status, cleaning tasks | Tenant-scoped |
| Public | Marketing landing | No auth |

---

## 8. Security risks / residual notes

1. No live Aggregate staging in this agent environment — mock only.  
2. Clinic’s local invoicing must not be reintroduced.  
3. Multi-instance booking locks may need Postgres advisory locks beyond in-process mutex (document for scale-out).  
4. Historical `NEEDS_RESOLUTION` guests are not DB-blocked from all reads; ops mutations (reservation/invoice) enforce LINKED at service layer.  
5. Bulk convert relies on application batch limit + unique constraints (no separate rate-limit middleware yet on convert route).  
