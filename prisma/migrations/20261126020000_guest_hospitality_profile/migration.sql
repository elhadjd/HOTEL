-- AlterTable: enrich guests with full central-aligned and hospitality profile fields
ALTER TABLE `guests`
    ADD COLUMN `salutation` VARCHAR(32) NULL,
    ADD COLUMN `customer_type` VARCHAR(32) NOT NULL DEFAULT 'individual',
    ADD COLUMN `company_name` VARCHAR(191) NULL,
    ADD COLUMN `nif` VARCHAR(64) NULL,
    ADD COLUMN `secondary_phone` VARCHAR(40) NULL,
    ADD COLUMN `birth_date` DATE NULL,
    ADD COLUMN `gender` VARCHAR(24) NULL,
    ADD COLUMN `nationality` VARCHAR(120) NULL,
    ADD COLUMN `preferred_language` VARCHAR(16) NULL,
    ADD COLUMN `address` VARCHAR(255) NULL,
    ADD COLUMN `city` VARCHAR(120) NULL,
    ADD COLUMN `province` VARCHAR(120) NULL,
    ADD COLUMN `postal_code` VARCHAR(32) NULL,
    ADD COLUMN `vip_tier` VARCHAR(32) NOT NULL DEFAULT 'STANDARD',
    ADD COLUMN `dietary_restrictions` VARCHAR(255) NULL,
    ADD COLUMN `room_preferences` VARCHAR(255) NULL,
    ADD COLUMN `emergency_contact_name` VARCHAR(120) NULL,
    ADD COLUMN `emergency_contact_phone` VARCHAR(40) NULL,
    ADD COLUMN `marketing_opt_in` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `guests_institution_id_nif_idx` ON `guests`(`institution_id`, `nif`);

-- AlterTable: add issuing country for guest identity documents
ALTER TABLE `guest_documents`
    ADD COLUMN `issuing_country` VARCHAR(120) NULL;
