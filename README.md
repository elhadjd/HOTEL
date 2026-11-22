# SIGESC Hotelaria

Independent hotel management SaaS in the SIGESC ecosystem — **Modern Hospitality Intelligence**.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript (strict)
- Tailwind CSS + premium design tokens
- **MySQL 8.0** + Prisma (`provider = "mysql"`)
- Auth.js (NextAuth v5)
- next-intl (pt / en / fr / es)
- SIGESC Aggregate Multi-Company client (`getAggregateClient()`, mock by default)

## Quick start (MySQL)

```bash
cp .env.example .env
# Start MySQL 8 (Docker when available):
#   docker compose up -d
# Or use a local mysql-server 8.0 with DB/user from .env.example

npm install
export DATABASE_URL="mysql://hotelaria:hotelaria@127.0.0.1:3306/sigesc_hotelaria"
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Demo login (after seed): `admin@hotelaria.demo` / `HotelariaDemo1!`

Mock Aggregate key for onboarding tests: `mca_mockvalidkeyforonboardingtestsxxxxxx`

### Reset disposable development database

```bash
mysql -h 127.0.0.1 -uhotelaria -photelaria -e "DROP DATABASE IF EXISTS sigesc_hotelaria; CREATE DATABASE sigesc_hotelaria CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
npx prisma migrate deploy
npm run db:seed
```

## Architecture

See `docs/architecture/` and:

- `docs/PHASE6_STAY_LIFECYCLE_MYSQL.md`
- `docs/PHASE5_CENTRAL_PRICING_CUSTOMER_GUEST_LIFECYCLE.md`

**Note:** PostgreSQL migrations from Phases 0–5 are archived under `prisma/migrations_postgresql_legacy/` and must never be applied to MySQL.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run test` | Vitest (integration tests require MySQL `DATABASE_URL`) |
| `npm run typecheck` | TypeScript |
| `npm run db:seed` | Dev seed data only |
| `npx prisma migrate deploy` | Apply MySQL migrations |

## Important rules

- Default Aggregate mode is **mock** (`SIGESC_AGGREGATE_MODE=mock`).
- API keys are encrypted server-side and never returned to the browser.
- SIGESC remains the financial authority — Hotelaria creates Cotação/Proforma only via Aggregate.
- Every operational Guest must be LINKED to a Central Customer (Phase 5).
