# Legacy PostgreSQL migrations (Phases 0–5)

These SQL migrations target PostgreSQL and must **never** be applied to MySQL.

Phase 6 standardizes the project on **MySQL 8.0**. The active migration history lives under `prisma/migrations/` and begins with a MySQL baseline that recreates the full schema plus Phase 6 stay-lifecycle expansions.

If you need to restore a disposable Postgres environment for historical inspection, use these files against Postgres 16 only — not against MySQL.
