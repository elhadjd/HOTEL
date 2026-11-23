-- Phase 8.1: expand operational rate plans + audit history
ALTER TABLE `rate_plans`
  ADD COLUMN `description` TEXT NULL,
  ADD COLUMN `valid_from` DATE NULL,
  ADD COLUMN `valid_to` DATE NULL,
  ADD COLUMN `min_stay_nights` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `max_stay_nights` INTEGER NULL,
  ADD COLUMN `included_occupancy` INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN `extra_guest_amount` DECIMAL(14, 2) NULL,
  ADD COLUMN `priority` INTEGER NOT NULL DEFAULT 0;

CREATE INDEX `rate_plans_hotel_id_valid_from_valid_to_idx` ON `rate_plans`(`hotel_id`, `valid_from`, `valid_to`);

ALTER TABLE `seasonal_rates`
  ADD COLUMN `weekend_only` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `weekday_only` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `rate_plan_audits` (
  `id` VARCHAR(191) NOT NULL,
  `rate_plan_id` VARCHAR(191) NOT NULL,
  `actor_user_id` VARCHAR(191) NULL,
  `action` VARCHAR(64) NOT NULL,
  `before_json` JSON NULL,
  `after_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `rate_plan_audits_rate_plan_id_created_at_idx` ON `rate_plan_audits`(`rate_plan_id`, `created_at`);

ALTER TABLE `rate_plan_audits`
  ADD CONSTRAINT `rate_plan_audits_rate_plan_id_fkey`
  FOREIGN KEY (`rate_plan_id`) REFERENCES `rate_plans`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Maintenance operational fields (materials, interventions, reopen)
ALTER TABLE `maintenance_requests`
  ADD COLUMN `materials_notes` TEXT NULL,
  ADD COLUMN `materials_cost` DECIMAL(14, 2) NULL,
  ADD COLUMN `intervention_notes` TEXT NULL,
  ADD COLUMN `scheduled_at` DATETIME(3) NULL,
  ADD COLUMN `reopened_at` DATETIME(3) NULL;
