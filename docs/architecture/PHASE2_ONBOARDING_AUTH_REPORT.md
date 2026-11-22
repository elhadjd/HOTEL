# Phase 2 — Official Account Onboarding, Authentication & Email Recovery

**Repository:** `elhadjd/HOTEL`  
**Date:** 22 Nov 2026 (America/New_York)  
**Mode:** Controlled implementation + security testing (Aggregate **mock** default)

---

## 1. Complete onboarding workflow

1. Administrator opens `/onboarding` and enters the official Aggregate `mca_` API key.
2. `POST /api/v1/onboarding/validate` validates the key server-side via `getAggregateClient().fetchOnboarding()`.
3. Official administrator is identified (`access_level=admin`, active, owner company, deterministic lowest id).
4. A short-lived `OnboardingChallenge` stores an **encrypted** copy of the key; the browser receives only a challenge token + public company/admin preview (never the raw key).
5. Administrator confirms; `POST /api/v1/onboarding/confirm` re-validates Aggregate, then transactionally creates:
   - Institution + Aggregate connection (AES-256-GCM key)
   - Memberships (only official admin → `hotel_admin` / ACTIVE)
   - Other users → INVITED + non-admin role (`DEFAULT_AGGREGATE_IMPORT_ROLE`)
   - Email outbox row for temporary password
6. After commit, outbox dispatch sends the onboarding email asynchronously.
7. Idempotent reconnect for an already-linked `sigescCompanyRef` refreshes the connection and **does not** re-send a temporary password.

Legacy one-shot: `POST /api/v1/onboarding/connect` (validate + confirm).

---

## 2. Administrator identification and user import report

| Rule | Implementation |
|------|----------------|
| Official docs mapping | `access_level` / `role.level` === `admin` |
| Active preference | Inactive sole admin → 422 |
| Owner company preference | Score boost for key `owner_company_id` / `is_owner` |
| Determinism | Lowest numeric Aggregate user id |
| SIGESC passwords | Never imported |
| Non-admin promotion | Never auto-promoted to `hotel_admin` |
| Module | `src/modules/sigesc-integration/admin-identification.ts` |

Mock fixture admin: `sofia@baia.ao` (Hotel Baía Atlântica Lda).

---

## 3. Email infrastructure and template report

| Item | Detail |
|------|--------|
| Abstraction | `Mailer` interface — `mock` (default) / `smtp` (nodemailer v6) |
| Env | `EMAIL_MODE`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `APP_URL` |
| Outbox | `EmailOutbox` table; enqueue inside DB transaction; dispatch post-commit |
| Secrets | Encrypted in `encryptedSecret`; wiped after successful send; never in `payloadJson` |
| Templates | Onboarding temp password, recovery, password changed, user invitation (HTML + text) |
| Logging | Never logs plaintext passwords / tokens |

---

## 4. First-login password-change report

- Admin created with `mustChangePassword=true` and `temporaryPasswordExpiresAt`.
- Auth.js credentials reject expired temporary passwords.
- JWT + middleware + `(app)/layout` block dashboard until password change.
- `POST /api/v1/auth/change-password` requires session, strength policy, clears flag, bumps `sessionVersion`, deletes DB sessions, queues confirmation email.
- UI: `/set-password`.

---

## 5. Password recovery report

- Login shows **Esqueceu a palavra-passe?** → `/forgot-password`.
- `POST /api/v1/auth/forgot-password` always returns a generic message (anti-enumeration).
- Rate limits per email + IP.
- Token: opaque random → SHA-256 stored; single-use; TTL via `PASSWORD_RESET_TTL_MINUTES` (default 30).
- Reset link email → `/reset-password?token=…` → `POST /api/v1/auth/reset-password`.
- On success: invalidate token, bump `sessionVersion`, revoke sessions, confirmation email.

---

## 6. Database changes and migrations

Migration: `prisma/migrations/20261122074730_phase2_auth_onboarding_email/`

New / extended models:

- `User`: `mustChangePassword`, `temporaryPasswordExpiresAt`, `passwordChangedAt`, `sessionVersion`, `isInstitutionAdmin`
- `OnboardingChallenge`
- `PasswordResetToken`
- `EmailOutbox` (+ enums `EmailOutboxStatus`, `EmailTemplateKind`)
- `AuthRateLimit`

---

## 7. Security audit findings

| Finding | Status |
|---------|--------|
| Browser-supplied company/admin data never trusted | OK — Aggregate re-validated on confirm |
| Aggregate key never returned after submit | OK — cleared client-side; challenge uses encrypted server storage |
| Temp passwords / reset tokens not logged | OK |
| Reset token not stored in outbox payload JSON | OK — encryptedSecret only |
| Account enumeration on forgot-password | Mitigated — generic 200 response |
| Rate limiting on onboarding / forgot / reset | OK — DB buckets |
| Session revocation via `sessionVersion` + Session delete | OK |
| Cross-tenant / RBAC | Membership + role codes; non-admins INVITED |
| Live Aggregate production readiness | **Not declared** — mock default; needs authorized staging |

Residual risks:

- Auth.js JWT refresh hits DB on every request (acceptable for Phase 2; watch load).
- Outbox dispatch is best-effort microtask (no worker yet) — production should run a periodic dispatcher.
- SMTP credentials must be provisioned; `EMAIL_MODE=mock` is default.

---

## 8. Automated test results

```
npm test → 25 passed (7 files)
```

Coverage includes: password policy/hashing, admin identification (incl. inactive/no-admin), email templates, mock Aggregate, crypto, allowlist, integration (valid/invalid key, admin-only privileges, email outbox, idempotent reconnect, forced password change, recovery generic response, single-use token, challenge reuse).

---

## 9. Build and TypeScript validation

See CI / local `npm run typecheck` and `npm run build` after this report.

---

## 10. Remaining limitations and production configuration

1. Set `EMAIL_MODE=smtp` with real SMTP vars and verified `SMTP_FROM_EMAIL`.
2. Set strong `AUTH_SECRET`, `AGGREGATE_ENCRYPTION_KEY`, `APP_URL`.
3. Keep `SIGESC_AGGREGATE_MODE=mock` until staging Aggregate validation is authorized.
4. Add a scheduled job for `dispatchEmailOutbox` (and dead-letter monitoring).
5. Invitation/activation emails for INVITED users are templated but not fully productized in UI.
6. CAPTCHA / advanced bot protection not included (rate limits only).

---

## Contracts followed

- `docs/contracts/API_AGGREGATE_ONBOARDING.md`
- `docs/contracts/API_AGGREGATE_ONBOARDING_PARCEIRO.md`

No undocumented Aggregate endpoints were invented. Laravel SIGESC was not modified.
