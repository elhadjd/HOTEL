-- Phase 5b: backfill historical unlinked guests to NEEDS_RESOLUTION (no deletes)
UPDATE "guest_customer_mappings"
SET "sync_status" = 'NEEDS_RESOLUTION'
WHERE "sync_status" = 'UNLINKED'
  AND ("external_customer_id" IS NULL OR "external_customer_id" = '');
