-- Phase 5/6/7: Granular RBAC per-user permission overrides, hotel check-in/out schedule policies,
-- reservation expected times / early check-in / late check-out / retroactive flag,
-- and invoice central order_reference index.

-- 1. Granular per-user permission overrides (GRANT / DENY on top of role baseline)
CREATE TABLE IF NOT EXISTS `membership_permission_overrides` (
  `id` VARCHAR(191) NOT NULL,
  `membership_id` VARCHAR(191) NOT NULL,
  `permission_id` VARCHAR(191) NOT NULL,
  `effect` ENUM('GRANT', 'DENY') NOT NULL,
  `updated_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `membership_permission_overrides_membership_id_permission_id_key` (`membership_id`, `permission_id`),
  INDEX `membership_permission_overrides_membership_id_idx` (`membership_id`),
  CONSTRAINT `membership_permission_overrides_membership_id_fkey`
    FOREIGN KEY (`membership_id`) REFERENCES `memberships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `membership_permission_overrides_permission_id_fkey`
    FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Hotel schedule policies (early check-in, late check-out, housekeeping turnaround, no-show cutoff)
ALTER TABLE `hotel_settings`
  ADD COLUMN `early_check_in_from` VARCHAR(8) NOT NULL DEFAULT '10:00',
  ADD COLUMN `late_check_out_until` VARCHAR(8) NOT NULL DEFAULT '18:00',
  ADD COLUMN `housekeeping_turnaround_minutes` INT NOT NULL DEFAULT 60,
  ADD COLUMN `no_show_cutoff_time` VARCHAR(8) NOT NULL DEFAULT '23:59';

-- 3. Reservation expected check-in/out times, early/late flags, and explicit retroactive booking flag
ALTER TABLE `reservations`
  ADD COLUMN `expected_check_in_time` VARCHAR(8) NULL,
  ADD COLUMN `expected_check_out_time` VARCHAR(8) NULL,
  ADD COLUMN `early_check_in_requested` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `late_check_out_requested` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `late_check_out_approved` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `is_retroactive` BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Index central document number (order_reference) for fast invoice lookups
CREATE INDEX `invoice_integrations_institution_id_order_reference_idx`
  ON `invoice_integrations`(`institution_id`, `order_reference`);
