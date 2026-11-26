export const PERMISSIONS = [
  { code: "dashboard.read", module: "dashboard", action: "read" },
  { code: "hotels.read", module: "hotels", action: "read" },
  { code: "hotels.write", module: "hotels", action: "write" },
  { code: "rooms.read", module: "rooms", action: "read" },
  { code: "rooms.write", module: "rooms", action: "write" },
  { code: "reservations.read", module: "reservations", action: "read" },
  { code: "reservations.write", module: "reservations", action: "write" },
  { code: "reservations.confirm", module: "reservations", action: "confirm" },
  { code: "guests.read", module: "guests", action: "read" },
  { code: "guests.write", module: "guests", action: "write" },
  { code: "stays.read", module: "stays", action: "read" },
  { code: "stays.checkin", module: "stays", action: "checkin" },
  { code: "stays.checkout", module: "stays", action: "checkout" },
  { code: "stays.manage", module: "stays", action: "manage" },
  { code: "stays.transfer_room", module: "stays", action: "transfer_room" },
  { code: "stays.extend", module: "stays", action: "extend" },
  { code: "housekeeping.read", module: "housekeeping", action: "read" },
  { code: "housekeeping.write", module: "housekeeping", action: "write" },
  { code: "housekeeping.manage", module: "housekeeping", action: "manage" },
  { code: "housekeeping.inspect", module: "housekeeping", action: "inspect" },
  { code: "maintenance.read", module: "maintenance", action: "read" },
  { code: "maintenance.write", module: "maintenance", action: "write" },
  { code: "maintenance.manage", module: "maintenance", action: "manage" },
  { code: "maintenance.resolve", module: "maintenance", action: "resolve" },
  { code: "stay_accounts.read", module: "stay_accounts", action: "read" },
  { code: "stay_accounts.manage", module: "stay_accounts", action: "manage" },
  { code: "rates.read", module: "rates", action: "read" },
  { code: "rates.write", module: "rates", action: "write" },
  { code: "reports.read", module: "reports", action: "read" },
  { code: "staff.read", module: "staff", action: "read" },
  { code: "staff.write", module: "staff", action: "write" },
  { code: "settings.write", module: "settings", action: "write" },
  { code: "integrations.sigesc", module: "integrations", action: "sigesc" },
  { code: "integrations.customers", module: "integrations", action: "customers" },
  { code: "integrations.products", module: "integrations", action: "products" },
  { code: "integrations.invoices", module: "integrations", action: "invoices" },
  { code: "integrations.invoices.settle", module: "integrations", action: "invoices_settle" },
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]["code"];

export const SYSTEM_ROLES = [
  {
    code: "hotel_admin",
    name: "Administrador do hotel",
    permissions: PERMISSIONS.map((p) => p.code),
  },
  {
    code: "manager",
    name: "Gestor",
    permissions: PERMISSIONS.map((p) => p.code).filter((c) => c !== "integrations.sigesc"),
  },
  {
    code: "receptionist",
    name: "Recepcionista",
    permissions: [
      "dashboard.read",
      "rooms.read",
      "reservations.read",
      "reservations.write",
      "reservations.confirm",
      "guests.read",
      "guests.write",
      "stays.read",
      "stays.checkin",
      "stays.checkout",
      "stays.manage",
      "stays.transfer_room",
      "stays.extend",
      "housekeeping.read",
      "stay_accounts.read",
      "stay_accounts.manage",
      "integrations.customers",
      "integrations.invoices",
      "integrations.invoices.settle",
    ] satisfies PermissionCode[],
  },
  {
    code: "housekeeping",
    name: "Governança",
    permissions: [
      "dashboard.read",
      "rooms.read",
      "housekeeping.read",
      "housekeeping.write",
      "housekeeping.manage",
      "housekeeping.inspect",
    ] satisfies PermissionCode[],
  },
  {
    code: "maintenance",
    name: "Manutenção",
    permissions: [
      "dashboard.read",
      "rooms.read",
      "maintenance.read",
      "maintenance.write",
      "maintenance.manage",
      "maintenance.resolve",
    ] satisfies PermissionCode[],
  },
  {
    code: "supervisor",
    name: "Supervisor",
    permissions: PERMISSIONS.map((p) => p.code).filter(
      (c) =>
        !["integrations.sigesc", "staff.write", "settings.write"].includes(c),
    ),
  },
  {
    code: "user",
    name: "Utilizador",
    permissions: ["dashboard.read", "rooms.read", "reservations.read", "guests.read"] satisfies PermissionCode[],
  },
] as const;

/** Safe default for Aggregate-imported users — never auto-admin. */
export const DEFAULT_AGGREGATE_IMPORT_ROLE = "user";

export const AGGREGATE_SUGGESTED_ROLE: Record<string, string> = {
  admin: "hotel_admin",
  manager: "manager",
  user: "user",
};
