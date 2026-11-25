-- Phase P3: Night Audit & Split Billing (Multiple Folios)

CREATE TABLE `stay_folios` (
  `id` VARCHAR(191) NOT NULL,
  `stay_id` VARCHAR(191) NOT NULL,
  `institution_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `folio_type` VARCHAR(32) NOT NULL DEFAULT 'GUEST',
  `payer_guest_id` VARCHAR(191) NULL,
  `deposit_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `notes` VARCHAR(500) NULL,
  `closed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `stay_folios_stay_id_idx`(`stay_id`),
  INDEX `stay_folios_institution_id_payer_guest_id_idx`(`institution_id`, `payer_guest_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `stay_folios`
  ADD CONSTRAINT `stay_folios_stay_id_fkey` FOREIGN KEY (`stay_id`) REFERENCES `stays`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `stay_folios_payer_guest_id_fkey` FOREIGN KEY (`payer_guest_id`) REFERENCES `guests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `stay_account_charges` ADD COLUMN `folio_id` VARCHAR(191) NULL;
CREATE INDEX `stay_account_charges_folio_id_idx` ON `stay_account_charges`(`folio_id`);
ALTER TABLE `stay_account_charges`
  ADD CONSTRAINT `stay_account_charges_folio_id_fkey` FOREIGN KEY (`folio_id`) REFERENCES `stay_folios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `night_audit_runs` (
  `id` VARCHAR(191) NOT NULL,
  `institution_id` VARCHAR(191) NOT NULL,
  `hotel_id` VARCHAR(191) NOT NULL,
  `business_date` DATE NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
  `actor_user_id` VARCHAR(191) NULL,
  `total_rooms` INTEGER NOT NULL DEFAULT 0,
  `sellable_rooms` INTEGER NOT NULL DEFAULT 0,
  `occupied_rooms` INTEGER NOT NULL DEFAULT 0,
  `occupancy_percent` DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
  `accommodation_revenue` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `extras_revenue` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `adr` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `revpar` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  `no_shows_marked` INTEGER NOT NULL DEFAULT 0,
  `stays_audited` INTEGER NOT NULL DEFAULT 0,
  `reconciliation_alerts` INTEGER NOT NULL DEFAULT 0,
  `currency` CHAR(3) NOT NULL DEFAULT 'AOA',
  `summary_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `night_audit_runs_hotel_id_business_date_key`(`hotel_id`, `business_date`),
  INDEX `night_audit_runs_institution_id_business_date_idx`(`institution_id`, `business_date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `night_audit_runs`
  ADD CONSTRAINT `night_audit_runs_hotel_id_fkey` FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
