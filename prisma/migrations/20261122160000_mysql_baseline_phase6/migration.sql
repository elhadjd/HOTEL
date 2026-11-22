-- CreateTable
CREATE TABLE `institutions` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `nif` VARCHAR(64) NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(64) NULL,
    `city` VARCHAR(120) NULL,
    `country` VARCHAR(120) NULL,
    `street` VARCHAR(255) NULL,
    `address_number` VARCHAR(32) NULL,
    `zip_code` VARCHAR(32) NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Africa/Luanda',
    `currency` CHAR(3) NOT NULL DEFAULT 'AOA',
    `locale` VARCHAR(8) NOT NULL DEFAULT 'pt',
    `sigesc_company_ref` VARCHAR(128) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `institutions_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `external_id` VARCHAR(128) NULL,
    `invite_pending` BOOLEAN NOT NULL DEFAULT false,
    `is_institution_admin` BOOLEAN NOT NULL DEFAULT false,
    `must_change_password` BOOLEAN NOT NULL DEFAULT false,
    `temporary_password_expires_at` DATETIME(3) NULL,
    `password_changed_at` DATETIME(3) NULL,
    `session_version` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_external_id_idx`(`external_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onboarding_challenges` (
    `id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(128) NOT NULL,
    `encrypted_api_key` TEXT NOT NULL,
    `key_prefix` VARCHAR(32) NOT NULL,
    `owner_company_external_id` VARCHAR(64) NOT NULL,
    `company_snapshot` JSON NOT NULL,
    `admin_snapshot` JSON NOT NULL,
    `users_snapshot` JSON NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,
    `institution_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `onboarding_challenges_token_hash_key`(`token_hash`),
    INDEX `onboarding_challenges_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_reset_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(128) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `request_ip` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_reset_tokens_token_hash_key`(`token_hash`),
    INDEX `password_reset_tokens_user_id_expires_at_idx`(`user_id`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_outbox` (
    `id` VARCHAR(191) NOT NULL,
    `institution_id` VARCHAR(191) NULL,
    `user_id` VARCHAR(191) NULL,
    `template` ENUM('ONBOARDING_TEMP_PASSWORD', 'PASSWORD_RECOVERY', 'PASSWORD_CHANGED', 'USER_INVITATION') NOT NULL,
    `to_email` VARCHAR(255) NOT NULL,
    `subject` VARCHAR(255) NOT NULL,
    `payload_json` JSON NOT NULL,
    `encrypted_secret` TEXT NULL,
    `status` ENUM('PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `available_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sent_at` DATETIME(3) NULL,
    `last_error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `email_outbox_status_available_at_idx`(`status`, `available_at`),
    INDEX `email_outbox_institution_id_idx`(`institution_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_rate_limits` (
    `id` VARCHAR(191) NOT NULL,
    `bucket_key` VARCHAR(191) NOT NULL,
    `hit_count` INTEGER NOT NULL DEFAULT 0,
    `window_start` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `auth_rate_limits_bucket_key_key`(`bucket_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounts` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `provider_account_id` VARCHAR(191) NOT NULL,
    `refresh_token` TEXT NULL,
    `access_token` TEXT NULL,
    `expires_at` INTEGER NULL,
    `token_type` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NULL,
    `id_token` TEXT NULL,
    `session_state` VARCHAR(191) NULL,

    UNIQUE INDEX `accounts_provider_provider_account_id_key`(`provider`, `provider_account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` VARCHAR(191) NOT NULL,
    `session_token` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sessions_session_token_key`(`session_token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verification_tokens` (
    `identifier` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `verification_tokens_token_key`(`token`),
    UNIQUE INDEX `verification_tokens_identifier_token_key`(`identifier`, `token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` VARCHAR(191) NOT NULL,
    `institution_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(255) NULL,
    `system` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `roles_institution_id_idx`(`institution_id`),
    UNIQUE INDEX `roles_institution_id_code_key`(`institution_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(120) NOT NULL,
    `module` VARCHAR(64) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `description` VARCHAR(255) NULL,

    UNIQUE INDEX `permissions_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `role_id` VARCHAR(191) NOT NULL,
    `permission_id` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `memberships` (
    `id` VARCHAR(191) NOT NULL,
    `institution_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `role_id` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'INVITED', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `aggregate_suggested_level` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `memberships_user_id_idx`(`user_id`),
    INDEX `memberships_institution_id_status_idx`(`institution_id`, `status`),
    UNIQUE INDEX `memberships_institution_id_user_id_key`(`institution_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hotels` (
    `id` VARCHAR(191) NOT NULL,
    `institution_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `description` TEXT NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(64) NULL,
    `street` VARCHAR(255) NULL,
    `city` VARCHAR(120) NULL,
    `country` VARCHAR(120) NULL,
    `zip_code` VARCHAR(32) NULL,
    `facilities` JSON NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `hotels_institution_id_active_idx`(`institution_id`, `active`),
    UNIQUE INDEX `hotels_institution_id_code_key`(`institution_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hotel_settings` (
    `id` VARCHAR(191) NOT NULL,
    `hotel_id` VARCHAR(191) NOT NULL,
    `check_in_time` VARCHAR(8) NOT NULL DEFAULT '14:00',
    `check_out_time` VARCHAR(8) NOT NULL DEFAULT '12:00',
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Africa/Luanda',
    `currency` CHAR(3) NOT NULL DEFAULT 'AOA',
    `locale` VARCHAR(8) NOT NULL DEFAULT 'pt',
    `max_stay_nights` INTEGER NULL,
    `allow_children` BOOLEAN NOT NULL DEFAULT true,
    `policies_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `hotel_settings_hotel_id_key`(`hotel_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `room_categories` (
    `id` VARCHAR(191) NOT NULL,
    `hotel_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `description` TEXT NULL,
    `max_occupancy` INTEGER NOT NULL DEFAULT 2,
    `max_adults` INTEGER NOT NULL DEFAULT 2,
    `max_children` INTEGER NOT NULL DEFAULT 0,
    `bed_configuration` VARCHAR(255) NULL,
    `amenities_json` JSON NULL,
    `default_tariff` DECIMAL(14, 2) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `room_categories_hotel_id_active_idx`(`hotel_id`, `active`),
    UNIQUE INDEX `room_categories_hotel_id_code_key`(`hotel_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rooms` (
    `id` VARCHAR(191) NOT NULL,
    `hotel_id` VARCHAR(191) NOT NULL,
    `category_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `floor` VARCHAR(32) NULL,
    `capacity` INTEGER NOT NULL DEFAULT 2,
    `description` TEXT NULL,
    `amenities_json` JSON NULL,
    `occupancy_status` ENUM('AVAILABLE', 'OCCUPIED', 'RESERVED') NOT NULL DEFAULT 'AVAILABLE',
    `housekeeping_status` ENUM('CLEAN', 'DIRTY', 'CLEANING', 'INSPECTING') NOT NULL DEFAULT 'CLEAN',
    `maintenance_status` ENUM('OK', 'UNDER_MAINTENANCE', 'OUT_OF_SERVICE') NOT NULL DEFAULT 'OK',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `rooms_hotel_id_occupancy_status_idx`(`hotel_id`, `occupancy_status`),
    INDEX `rooms_hotel_id_housekeeping_status_idx`(`hotel_id`, `housekeeping_status`),
    INDEX `rooms_hotel_id_maintenance_status_idx`(`hotel_id`, `maintenance_status`),
    UNIQUE INDEX `rooms_hotel_id_code_key`(`hotel_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `room_images` (
    `id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `storage_key` VARCHAR(512) NOT NULL,
    `alt` VARCHAR(255) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `room_images_room_id_idx`(`room_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guests` (
    `id` VARCHAR(191) NOT NULL,
    `institution_id` VARCHAR(191) NOT NULL,
    `first_name` VARCHAR(120) NOT NULL,
    `last_name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(40) NULL,
    `country` VARCHAR(120) NULL,
    `preferences_json` JSON NULL,
    `notes` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `guests_institution_id_last_name_first_name_idx`(`institution_id`, `last_name`, `first_name`),
    INDEX `guests_institution_id_email_idx`(`institution_id`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guest_documents` (
    `id` VARCHAR(191) NOT NULL,
    `guest_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(64) NOT NULL,
    `reference` VARCHAR(128) NOT NULL,
    `issued_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `guest_documents_guest_id_idx`(`guest_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guest_customer_mappings` (
    `id` VARCHAR(191) NOT NULL,
    `guest_id` VARCHAR(191) NOT NULL,
    `institution_id` VARCHAR(191) NOT NULL,
    `connection_id` VARCHAR(191) NULL,
    `external_customer_id` VARCHAR(128) NULL,
    `company_id` VARCHAR(64) NULL,
    `sync_status` ENUM('UNLINKED', 'NEEDS_RESOLUTION', 'PENDING', 'LINKED', 'CONFLICT', 'ERROR') NOT NULL DEFAULT 'UNLINKED',
    `last_synced_at` DATETIME(3) NULL,
    `last_error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `guest_customer_mappings_guest_id_key`(`guest_id`),
    INDEX `guest_customer_mappings_institution_id_sync_status_idx`(`institution_id`, `sync_status`),
    INDEX `guest_customer_mappings_external_customer_id_idx`(`external_customer_id`),
    UNIQUE INDEX `guest_customer_mappings_institution_id_external_customer_id_key`(`institution_id`, `external_customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_catalog_mappings` (
    `id` VARCHAR(191) NOT NULL,
    `institution_id` VARCHAR(191) NOT NULL,
    `connection_id` VARCHAR(191) NULL,
    `local_code` VARCHAR(64) NOT NULL,
    `local_label` VARCHAR(255) NOT NULL,
    `legacy_historical_price` DECIMAL(14, 2) NULL,
    `kind` ENUM('PRODUCT', 'SERVICE') NOT NULL DEFAULT 'SERVICE',
    `central_product_id` VARCHAR(64) NOT NULL,
    `central_company_id` VARCHAR(64) NOT NULL,
    `central_name` VARCHAR(255) NULL,
    `central_sale_price` DECIMAL(14, 2) NULL,
    `central_tax_percent` DECIMAL(8, 4) NULL,
    `central_price_verified_at` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `last_synced_at` DATETIME(3) NULL,
    `last_error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `product_catalog_mappings_institution_id_central_product_id_idx`(`institution_id`, `central_product_id`),
    INDEX `product_catalog_mappings_institution_id_active_idx`(`institution_id`, `active`),
    UNIQUE INDEX `product_catalog_mappings_institution_id_local_code_key`(`institution_id`, `local_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_integrations` (
    `id` VARCHAR(191) NOT NULL,
    `institution_id` VARCHAR(191) NOT NULL,
    `connection_id` VARCHAR(191) NOT NULL,
    `reservation_id` VARCHAR(191) NULL,
    `guest_id` VARCHAR(191) NULL,
    `external_id` VARCHAR(128) NOT NULL,
    `partner` VARCHAR(64) NOT NULL DEFAULT 'sigesc_hotelaria',
    `requested_state` VARCHAR(32) NOT NULL,
    `status` ENUM('DRAFT', 'PENDING_SUBMISSION', 'SUBMITTING', 'CREATED', 'RECONCILIATION_REQUIRED', 'FAILED_VALIDATION', 'FAILED_FINAL') NOT NULL DEFAULT 'DRAFT',
    `central_company_id` VARCHAR(64) NOT NULL,
    `central_customer_id` VARCHAR(64) NULL,
    `central_sale_id` VARCHAR(64) NULL,
    `sale_key` VARCHAR(64) NULL,
    `order_reference` VARCHAR(128) NULL,
    `central_state` VARCHAR(32) NULL,
    `central_total` DECIMAL(14, 2) NULL,
    `central_subtotal` DECIMAL(14, 2) NULL,
    `central_tax` DECIMAL(14, 2) NULL,
    `central_rest_payable` DECIMAL(14, 2) NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'AOA',
    `notes` TEXT NULL,
    `lines_json` JSON NOT NULL,
    `idempotent_hit` BOOLEAN NOT NULL DEFAULT false,
    `last_error` TEXT NULL,
    `submitted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `invoice_integrations_institution_id_status_idx`(`institution_id`, `status`),
    INDEX `invoice_integrations_sale_key_idx`(`sale_key`),
    INDEX `invoice_integrations_reservation_id_idx`(`reservation_id`),
    UNIQUE INDEX `invoice_integrations_institution_id_external_id_key`(`institution_id`, `external_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_submission_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `invoice_id` VARCHAR(191) NOT NULL,
    `attempt_no` INTEGER NOT NULL,
    `outcome` VARCHAR(64) NOT NULL,
    `http_status` INTEGER NULL,
    `remote_sale_key` VARCHAR(64) NULL,
    `response_summary` JSON NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `invoice_submission_attempts_invoice_id_created_at_idx`(`invoice_id`, `created_at`),
    UNIQUE INDEX `invoice_submission_attempts_invoice_id_attempt_no_key`(`invoice_id`, `attempt_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reservations` (
    `id` VARCHAR(191) NOT NULL,
    `hotel_id` VARCHAR(191) NOT NULL,
    `institution_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `status` ENUM('DRAFT', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW') NOT NULL DEFAULT 'DRAFT',
    `arrival_date` DATE NOT NULL,
    `departure_date` DATE NOT NULL,
    `adults` INTEGER NOT NULL DEFAULT 1,
    `children` INTEGER NOT NULL DEFAULT 0,
    `source` VARCHAR(64) NULL,
    `internal_notes` TEXT NULL,
    `operational_total` DECIMAL(14, 2) NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'AOA',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `reservations_institution_id_status_idx`(`institution_id`, `status`),
    INDEX `reservations_hotel_id_arrival_date_departure_date_idx`(`hotel_id`, `arrival_date`, `departure_date`),
    UNIQUE INDEX `reservations_hotel_id_code_key`(`hotel_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reservation_rooms` (
    `id` VARCHAR(191) NOT NULL,
    `reservation_id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `arrival_date` DATE NOT NULL,
    `departure_date` DATE NOT NULL,
    `nightly_rate` DECIMAL(14, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reservation_rooms_room_id_arrival_date_departure_date_idx`(`room_id`, `arrival_date`, `departure_date`),
    UNIQUE INDEX `reservation_rooms_reservation_id_room_id_key`(`reservation_id`, `room_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reservation_guests` (
    `id` VARCHAR(191) NOT NULL,
    `reservation_id` VARCHAR(191) NOT NULL,
    `guest_id` VARCHAR(191) NOT NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `reservation_guests_reservation_id_guest_id_key`(`reservation_id`, `guest_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reservation_events` (
    `id` VARCHAR(191) NOT NULL,
    `reservation_id` VARCHAR(191) NOT NULL,
    `from_status` ENUM('DRAFT', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW') NULL,
    `to_status` ENUM('DRAFT', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW') NOT NULL,
    `note` VARCHAR(500) NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reservation_events_reservation_id_created_at_idx`(`reservation_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stays` (
    `id` VARCHAR(191) NOT NULL,
    `hotel_id` VARCHAR(191) NOT NULL,
    `institution_id` VARCHAR(191) NOT NULL,
    `reservation_id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `guest_id` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'CHECKOUT_PENDING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `actual_arrival` DATETIME(3) NOT NULL,
    `expected_departure` DATE NOT NULL,
    `actual_departure` DATETIME(3) NULL,
    `original_departure` DATE NULL,
    `observations` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stays_reservation_id_key`(`reservation_id`),
    INDEX `stays_hotel_id_status_idx`(`hotel_id`, `status`),
    INDEX `stays_institution_id_status_idx`(`institution_id`, `status`),
    INDEX `stays_room_id_status_idx`(`room_id`, `status`),
    INDEX `stays_institution_id_expected_departure_idx`(`institution_id`, `expected_departure`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stay_companions` (
    `id` VARCHAR(191) NOT NULL,
    `stay_id` VARCHAR(191) NOT NULL,
    `guest_id` VARCHAR(191) NOT NULL,
    `added_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `removed_at` DATETIME(3) NULL,
    `notes` VARCHAR(500) NULL,

    INDEX `stay_companions_stay_id_removed_at_idx`(`stay_id`, `removed_at`),
    UNIQUE INDEX `stay_companions_stay_id_guest_id_key`(`stay_id`, `guest_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stay_room_history` (
    `id` VARCHAR(191) NOT NULL,
    `stay_id` VARCHAR(191) NOT NULL,
    `from_room_id` VARCHAR(191) NOT NULL,
    `to_room_id` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `transferred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `stay_room_history_stay_id_transferred_at_idx`(`stay_id`, `transferred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stay_date_changes` (
    `id` VARCHAR(191) NOT NULL,
    `stay_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `previous_departure` DATE NOT NULL,
    `new_departure` DATE NOT NULL,
    `reason` VARCHAR(500) NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `stay_date_changes_stay_id_created_at_idx`(`stay_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stay_account_charges` (
    `id` VARCHAR(191) NOT NULL,
    `stay_id` VARCHAR(191) NOT NULL,
    `institution_id` VARCHAR(191) NOT NULL,
    `kind` ENUM('ACCOMMODATION', 'EXTRA_SERVICE', 'PRODUCT', 'FEE', 'DISCOUNT', 'ADJUSTMENT') NOT NULL DEFAULT 'EXTRA_SERVICE',
    `status` ENUM('PENDING', 'CONFIRMED', 'VOIDED', 'HANDED_OFF') NOT NULL DEFAULT 'PENDING',
    `description` VARCHAR(255) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL DEFAULT 1,
    `unit_price` DECIMAL(14, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'AOA',
    `catalog_mapping_id` VARCHAR(191) NULL,
    `central_product_id` VARCHAR(64) NULL,
    `invoice_integration_id` VARCHAR(191) NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `void_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `stay_account_charges_stay_id_status_idx`(`stay_id`, `status`),
    INDEX `stay_account_charges_institution_id_created_at_idx`(`institution_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `check_in_records` (
    `id` VARCHAR(191) NOT NULL,
    `stay_id` VARCHAR(191) NOT NULL,
    `reservation_id` VARCHAR(191) NOT NULL,
    `checked_in_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actor_user_id` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `occupant_count` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `check_in_records_stay_id_key`(`stay_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `check_out_records` (
    `id` VARCHAR(191) NOT NULL,
    `stay_id` VARCHAR(191) NOT NULL,
    `reservation_id` VARCHAR(191) NOT NULL,
    `checked_out_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actor_user_id` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `financial_handoff_status` ENUM('NOT_REQUIRED', 'PENDING', 'REQUESTED', 'CENTRAL_CONFIRMED', 'RECONCILIATION_PENDING', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `financial_external_ref` VARCHAR(128) NULL,
    `financial_confirmed_at` DATETIME(3) NULL,
    `invoice_integration_id` VARCHAR(191) NULL,
    `operational_complete` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `check_out_records_stay_id_key`(`stay_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `housekeeping_tasks` (
    `id` VARCHAR(191) NOT NULL,
    `hotel_id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `stay_id` VARCHAR(191) NULL,
    `kind` ENUM('CLEANING', 'INSPECTION', 'PREPARATION', 'LINEN_CHANGE', 'MAINTENANCE_CLEAN', 'TURNOVER') NOT NULL DEFAULT 'CLEANING',
    `status` ENUM('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'INSPECTION_REQUIRED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    `assigned_to` VARCHAR(128) NULL,
    `notes` TEXT NULL,
    `deadline_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `inspected_at` DATETIME(3) NULL,
    `inspection_result` VARCHAR(32) NULL,
    `inspection_notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `housekeeping_tasks_hotel_id_status_priority_idx`(`hotel_id`, `status`, `priority`),
    INDEX `housekeeping_tasks_room_id_status_idx`(`room_id`, `status`),
    INDEX `housekeeping_tasks_hotel_id_kind_status_idx`(`hotel_id`, `kind`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `maintenance_requests` (
    `id` VARCHAR(191) NOT NULL,
    `hotel_id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `category` VARCHAR(64) NULL,
    `status` ENUM('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_PARTS', 'RESOLVED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'NORMAL',
    `assigned_to` VARCHAR(128) NULL,
    `blocks_room` BOOLEAN NOT NULL DEFAULT false,
    `resolution` TEXT NULL,
    `started_at` DATETIME(3) NULL,
    `resolved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `maintenance_requests_hotel_id_status_priority_idx`(`hotel_id`, `status`, `priority`),
    INDEX `maintenance_requests_room_id_status_idx`(`room_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rate_plans` (
    `id` VARCHAR(191) NOT NULL,
    `hotel_id` VARCHAR(191) NOT NULL,
    `category_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `base_amount` DECIMAL(14, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'AOA',
    `weekday_only` BOOLEAN NOT NULL DEFAULT false,
    `weekend_only` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `rate_plans_hotel_id_category_id_active_idx`(`hotel_id`, `category_id`, `active`),
    UNIQUE INDEX `rate_plans_hotel_id_code_key`(`hotel_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `seasonal_rates` (
    `id` VARCHAR(191) NOT NULL,
    `rate_plan_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `min_occupancy` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `seasonal_rates_rate_plan_id_start_date_end_date_idx`(`rate_plan_id`, `start_date`, `end_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `aggregate_connections` (
    `id` VARCHAR(191) NOT NULL,
    `institution_id` VARCHAR(191) NOT NULL,
    `host` VARCHAR(255) NOT NULL,
    `encrypted_api_key` TEXT NOT NULL,
    `key_prefix` VARCHAR(32) NOT NULL,
    `key_name` VARCHAR(120) NULL,
    `scopes_json` JSON NULL,
    `status` ENUM('ACTIVE', 'ERROR', 'REVOKED', 'DISCONNECTED') NOT NULL DEFAULT 'ACTIVE',
    `owner_company_external_id` VARCHAR(64) NULL,
    `last_onboarding_at` DATETIME(3) NULL,
    `last_users_sync_at` DATETIME(3) NULL,
    `last_customers_sync_at` DATETIME(3) NULL,
    `last_customers_sync_outcome` ENUM('SUCCESS', 'FAILED', 'PARTIAL', 'SKIPPED') NULL,
    `last_error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `aggregate_connections_institution_id_key`(`institution_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `aggregate_sync_runs` (
    `id` VARCHAR(191) NOT NULL,
    `institution_id` VARCHAR(191) NOT NULL,
    `connection_id` VARCHAR(191) NULL,
    `kind` ENUM('ONBOARDING', 'USERS', 'COMPANIES', 'KEY_ROTATION', 'CUSTOMERS', 'PRODUCTS', 'SALES') NOT NULL,
    `success` BOOLEAN NOT NULL DEFAULT false,
    `companies_upserted` INTEGER NOT NULL DEFAULT 0,
    `users_upserted` INTEGER NOT NULL DEFAULT 0,
    `pages_processed` INTEGER NOT NULL DEFAULT 0,
    `error_message` TEXT NULL,
    `details_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `aggregate_sync_runs_institution_id_created_at_idx`(`institution_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sync_mappings` (
    `id` VARCHAR(191) NOT NULL,
    `institution_id` VARCHAR(191) NOT NULL,
    `local_type` VARCHAR(64) NOT NULL,
    `local_id` VARCHAR(64) NOT NULL,
    `remote_system` VARCHAR(64) NOT NULL,
    `remote_id` VARCHAR(128) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sync_mappings_remote_system_remote_id_idx`(`remote_system`, `remote_id`),
    UNIQUE INDEX `sync_mappings_institution_id_local_type_local_id_remote_syst_key`(`institution_id`, `local_type`, `local_id`, `remote_system`),
    UNIQUE INDEX `sync_mappings_inst_remote_uniq`(`institution_id`, `remote_system`, `local_type`, `remote_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `institution_id` VARCHAR(191) NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `action` ENUM('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'ACCESS_DENIED') NOT NULL,
    `entity_type` VARCHAR(64) NOT NULL,
    `entity_id` VARCHAR(64) NULL,
    `metadata` JSON NULL,
    `ip_address` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_institution_id_created_at_idx`(`institution_id`, `created_at`),
    INDEX `audit_logs_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `institution_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `kind` ENUM('INFO', 'ALERT', 'TASK', 'SYSTEM') NOT NULL DEFAULT 'INFO',
    `title` VARCHAR(255) NOT NULL,
    `body` TEXT NULL,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_institution_id_user_id_read_at_idx`(`institution_id`, `user_id`, `read_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `onboarding_challenges` ADD CONSTRAINT `onboarding_challenges_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_outbox` ADD CONSTRAINT `email_outbox_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_outbox` ADD CONSTRAINT `email_outbox_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `roles` ADD CONSTRAINT `roles_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hotels` ADD CONSTRAINT `hotels_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hotel_settings` ADD CONSTRAINT `hotel_settings_hotel_id_fkey` FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_categories` ADD CONSTRAINT `room_categories_hotel_id_fkey` FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rooms` ADD CONSTRAINT `rooms_hotel_id_fkey` FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rooms` ADD CONSTRAINT `rooms_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `room_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_images` ADD CONSTRAINT `room_images_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guests` ADD CONSTRAINT `guests_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guest_documents` ADD CONSTRAINT `guest_documents_guest_id_fkey` FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guest_customer_mappings` ADD CONSTRAINT `guest_customer_mappings_guest_id_fkey` FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_catalog_mappings` ADD CONSTRAINT `product_catalog_mappings_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_integrations` ADD CONSTRAINT `invoice_integrations_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_submission_attempts` ADD CONSTRAINT `invoice_submission_attempts_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoice_integrations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservations` ADD CONSTRAINT `reservations_hotel_id_fkey` FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservation_rooms` ADD CONSTRAINT `reservation_rooms_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservation_rooms` ADD CONSTRAINT `reservation_rooms_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservation_guests` ADD CONSTRAINT `reservation_guests_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservation_guests` ADD CONSTRAINT `reservation_guests_guest_id_fkey` FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservation_events` ADD CONSTRAINT `reservation_events_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stays` ADD CONSTRAINT `stays_hotel_id_fkey` FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stays` ADD CONSTRAINT `stays_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stays` ADD CONSTRAINT `stays_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stays` ADD CONSTRAINT `stays_guest_id_fkey` FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stay_companions` ADD CONSTRAINT `stay_companions_stay_id_fkey` FOREIGN KEY (`stay_id`) REFERENCES `stays`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stay_companions` ADD CONSTRAINT `stay_companions_guest_id_fkey` FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stay_room_history` ADD CONSTRAINT `stay_room_history_stay_id_fkey` FOREIGN KEY (`stay_id`) REFERENCES `stays`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stay_date_changes` ADD CONSTRAINT `stay_date_changes_stay_id_fkey` FOREIGN KEY (`stay_id`) REFERENCES `stays`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stay_account_charges` ADD CONSTRAINT `stay_account_charges_stay_id_fkey` FOREIGN KEY (`stay_id`) REFERENCES `stays`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `check_in_records` ADD CONSTRAINT `check_in_records_stay_id_fkey` FOREIGN KEY (`stay_id`) REFERENCES `stays`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `check_in_records` ADD CONSTRAINT `check_in_records_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `check_out_records` ADD CONSTRAINT `check_out_records_stay_id_fkey` FOREIGN KEY (`stay_id`) REFERENCES `stays`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `check_out_records` ADD CONSTRAINT `check_out_records_reservation_id_fkey` FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `housekeeping_tasks` ADD CONSTRAINT `housekeeping_tasks_hotel_id_fkey` FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `housekeeping_tasks` ADD CONSTRAINT `housekeeping_tasks_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance_requests` ADD CONSTRAINT `maintenance_requests_hotel_id_fkey` FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance_requests` ADD CONSTRAINT `maintenance_requests_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rate_plans` ADD CONSTRAINT `rate_plans_hotel_id_fkey` FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rate_plans` ADD CONSTRAINT `rate_plans_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `room_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `seasonal_rates` ADD CONSTRAINT `seasonal_rates_rate_plan_id_fkey` FOREIGN KEY (`rate_plan_id`) REFERENCES `rate_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aggregate_connections` ADD CONSTRAINT `aggregate_connections_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aggregate_sync_runs` ADD CONSTRAINT `aggregate_sync_runs_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aggregate_sync_runs` ADD CONSTRAINT `aggregate_sync_runs_connection_id_fkey` FOREIGN KEY (`connection_id`) REFERENCES `aggregate_connections`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sync_mappings` ADD CONSTRAINT `sync_mappings_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_institution_id_fkey` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

