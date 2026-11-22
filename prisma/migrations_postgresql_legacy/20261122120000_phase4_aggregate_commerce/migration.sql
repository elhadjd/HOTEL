-- Phase 4: Aggregate customers, products, invoices integration

CREATE TYPE "InvoiceIntegrationStatus" AS ENUM (
  'DRAFT',
  'PENDING_SUBMISSION',
  'SUBMITTING',
  'CREATED',
  'RECONCILIATION_REQUIRED',
  'FAILED_VALIDATION',
  'FAILED_FINAL'
);

CREATE TYPE "CatalogKind" AS ENUM ('PRODUCT', 'SERVICE');

ALTER TYPE "AggregateSyncKind" ADD VALUE 'SALES';

ALTER TABLE "guest_customer_mappings" ADD COLUMN IF NOT EXISTS "connection_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "guest_customer_mappings_institution_id_external_customer_id_key"
  ON "guest_customer_mappings"("institution_id", "external_customer_id");

CREATE TABLE "product_catalog_mappings" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "connection_id" TEXT,
    "local_code" VARCHAR(64) NOT NULL,
    "local_label" VARCHAR(255) NOT NULL,
    "local_operational_price" DECIMAL(14,2),
    "kind" "CatalogKind" NOT NULL DEFAULT 'SERVICE',
    "central_product_id" VARCHAR(64) NOT NULL,
    "central_company_id" VARCHAR(64) NOT NULL,
    "central_name" VARCHAR(255),
    "central_sale_price" DECIMAL(14,2),
    "central_tax_percent" DECIMAL(8,4),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_catalog_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_catalog_mappings_institution_id_local_code_key"
  ON "product_catalog_mappings"("institution_id", "local_code");
CREATE INDEX "product_catalog_mappings_institution_id_central_product_id_idx"
  ON "product_catalog_mappings"("institution_id", "central_product_id");
CREATE INDEX "product_catalog_mappings_institution_id_active_idx"
  ON "product_catalog_mappings"("institution_id", "active");

ALTER TABLE "product_catalog_mappings"
  ADD CONSTRAINT "product_catalog_mappings_institution_id_fkey"
  FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "invoice_integrations" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "reservation_id" TEXT,
    "guest_id" TEXT,
    "external_id" VARCHAR(128) NOT NULL,
    "partner" VARCHAR(64) NOT NULL DEFAULT 'sigesc_hotelaria',
    "requested_state" VARCHAR(32) NOT NULL,
    "status" "InvoiceIntegrationStatus" NOT NULL DEFAULT 'DRAFT',
    "central_company_id" VARCHAR(64) NOT NULL,
    "central_customer_id" VARCHAR(64),
    "central_sale_id" VARCHAR(64),
    "sale_key" VARCHAR(64),
    "order_reference" VARCHAR(128),
    "central_state" VARCHAR(32),
    "central_total" DECIMAL(14,2),
    "central_subtotal" DECIMAL(14,2),
    "central_tax" DECIMAL(14,2),
    "central_rest_payable" DECIMAL(14,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'AOA',
    "notes" TEXT,
    "lines_json" JSONB NOT NULL,
    "idempotent_hit" BOOLEAN NOT NULL DEFAULT false,
    "last_error" TEXT,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoice_integrations_institution_id_external_id_key"
  ON "invoice_integrations"("institution_id", "external_id");
CREATE INDEX "invoice_integrations_institution_id_status_idx"
  ON "invoice_integrations"("institution_id", "status");
CREATE INDEX "invoice_integrations_sale_key_idx" ON "invoice_integrations"("sale_key");
CREATE INDEX "invoice_integrations_reservation_id_idx" ON "invoice_integrations"("reservation_id");

ALTER TABLE "invoice_integrations"
  ADD CONSTRAINT "invoice_integrations_institution_id_fkey"
  FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "invoice_submission_attempts" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "outcome" VARCHAR(64) NOT NULL,
    "http_status" INTEGER,
    "remote_sale_key" VARCHAR(64),
    "response_summary" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_submission_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoice_submission_attempts_invoice_id_attempt_no_key"
  ON "invoice_submission_attempts"("invoice_id", "attempt_no");
CREATE INDEX "invoice_submission_attempts_invoice_id_created_at_idx"
  ON "invoice_submission_attempts"("invoice_id", "created_at");

ALTER TABLE "invoice_submission_attempts"
  ADD CONSTRAINT "invoice_submission_attempts_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoice_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
