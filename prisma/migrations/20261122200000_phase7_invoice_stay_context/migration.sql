-- Phase 7: operational context on invoice integrations
ALTER TABLE `invoice_integrations`
  ADD COLUMN `stay_id` VARCHAR(191) NULL,
  ADD COLUMN `hotel_id` VARCHAR(191) NULL,
  ADD COLUMN `created_by_user_id` VARCHAR(191) NULL;

CREATE INDEX `invoice_integrations_stay_id_idx` ON `invoice_integrations`(`stay_id`);
CREATE INDEX `invoice_integrations_guest_id_idx` ON `invoice_integrations`(`guest_id`);
CREATE INDEX `invoice_integrations_hotel_id_idx` ON `invoice_integrations`(`hotel_id`);
CREATE INDEX `invoice_integrations_institution_id_created_at_idx` ON `invoice_integrations`(`institution_id`, `created_at`);
