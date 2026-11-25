-- Phase P1: Hotel Core Integrity
-- 1. Link RoomCategory to ProductCatalogMapping for SIGESC accommodation billing
-- 2. Evolve Reservation <-> Stay from 1:1 to 1:N for multi-room / group reservations

-- Drop unique index on stays.reservation_id (keeping FK index via new composite indexes)
ALTER TABLE `stays` DROP FOREIGN KEY `stays_reservation_id_fkey`;
DROP INDEX `stays_reservation_id_key` ON `stays`;
CREATE INDEX `stays_reservation_id_status_idx` ON `stays`(`reservation_id`, `status`);
CREATE INDEX `stays_reservation_id_room_id_idx` ON `stays`(`reservation_id`, `room_id`);
ALTER TABLE `stays` ADD CONSTRAINT `stays_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add accommodation_mapping_id on room_categories
ALTER TABLE `room_categories` ADD COLUMN `accommodation_mapping_id` VARCHAR(191) NULL;
CREATE INDEX `room_categories_accommodation_mapping_id_idx` ON `room_categories`(`accommodation_mapping_id`);
ALTER TABLE `room_categories` ADD CONSTRAINT `room_categories_accommodation_mapping_id_fkey` FOREIGN KEY (`accommodation_mapping_id`) REFERENCES `product_catalog_mappings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
