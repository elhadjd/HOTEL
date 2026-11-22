# SIGESC Hotelaria

Independent hotel management SaaS in the SIGESC ecosystem — **Modern Hospitality Intelligence**.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript (strict)
- Tailwind CSS 4 + premium design tokens
- PostgreSQL + Prisma
- Auth.js (NextAuth v5)
- next-intl (pt / en / fr / es)
- SIGESC Aggregate Multi-Company client (`getAggregateClient()`, mock by default)

## Quick start

```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

Demo login (after seed): `admin@hotelaria.demo` / `HotelariaDemo1!`

Mock Aggregate key for onboarding tests: `mca_mockvalidkeyforonboardingtestsxxxxxx`

## Architecture

See `docs/architecture/`:

- PROJECT_ARCHITECTURE.md
- DATABASE_DESIGN.md
- SIGESC_INTEGRATION.md
- SECURITY_MODEL.md
- IMPLEMENTATION_ROADMAP.md

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run test` | Vitest unit tests |
| `npm run typecheck` | TypeScript |
| `npm run db:seed` | Dev seed data only |

## Important rules

- Default Aggregate mode is **mock** (`SIGESC_AGGREGATE_MODE=mock`).
- API keys are encrypted server-side and never returned to the browser.
- SIGESC remains the financial authority — Hotelaria does not issue invoices.
