-- SIGESC Invoice Settlement RBAC permission backfill (idempotent)
-- Grants `integrations.invoices.settle` to existing hotel_admin, manager, supervisor, and receptionist roles.

INSERT IGNORE INTO `permissions` (`id`, `code`, `module`, `action`, `description`)
VALUES (
  UUID(),
  'integrations.invoices.settle',
  'integrations',
  'invoices.settle',
  'Publish and settle (record payments on) SIGESC invoices directly from HOTEL'
);

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
INNER JOIN `permissions` p ON p.`code` = 'integrations.invoices.settle'
WHERE r.`code` IN ('hotel_admin', 'manager', 'supervisor', 'receptionist');
