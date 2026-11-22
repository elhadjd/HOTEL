-- Phase 5a: add NEEDS_RESOLUTION enum + rename non-authoritative price column
-- (Enum value cannot be used until this migration commits — data backfill is 20261122140001.)

ALTER TYPE "CustomerSyncStatus" ADD VALUE 'NEEDS_RESOLUTION';

ALTER TABLE "product_catalog_mappings"
  RENAME COLUMN "local_operational_price" TO "legacy_historical_price";

ALTER TABLE "product_catalog_mappings"
  ADD COLUMN "central_price_verified_at" TIMESTAMP(3);
