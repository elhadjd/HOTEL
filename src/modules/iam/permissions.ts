export const PERMISSIONS = [
  { code: "dashboard.read", module: "dashboard", action: "read", label: "Ver painel principal" },
  { code: "hotels.read", module: "hotels", action: "read", label: "Ver dados do hotel" },
  { code: "hotels.write", module: "hotels", action: "write", label: "Editar dados do hotel" },
  { code: "rooms.read", module: "rooms", action: "read", label: "Ver quartos e categorias" },
  { code: "rooms.write", module: "rooms", action: "write", label: "Criar e editar quartos" },
  { code: "reservations.read", module: "reservations", action: "read", label: "Ver reservas e calendário" },
  { code: "reservations.write", module: "reservations", action: "write", label: "Criar e editar reservas" },
  { code: "reservations.confirm", module: "reservations", action: "confirm", label: "Confirmar, cancelar e marcar no-show" },
  { code: "reservations.retroactive", module: "reservations", action: "retroactive", label: "Registar reservas com datas passadas (retroativo)" },
  { code: "guests.read", module: "guests", action: "read", label: "Ver hóspedes" },
  { code: "guests.write", module: "guests", action: "write", label: "Criar e editar hóspedes" },
  { code: "stays.read", module: "stays", action: "read", label: "Ver estadias" },
  { code: "stays.checkin", module: "stays", action: "checkin", label: "Realizar check-in" },
  { code: "stays.checkout", module: "stays", action: "checkout", label: "Realizar check-out" },
  { code: "stays.manage", module: "stays", action: "manage", label: "Gerir estadia e consumos" },
  { code: "stays.transfer_room", module: "stays", action: "transfer_room", label: "Transferir quarto de estadia" },
  { code: "stays.extend", module: "stays", action: "extend", label: "Estender ou alterar saída" },
  { code: "housekeeping.read", module: "housekeeping", action: "read", label: "Ver governança e limpeza" },
  { code: "housekeeping.write", module: "housekeeping", action: "write", label: "Criar e actualizar tarefas de limpeza" },
  { code: "housekeeping.manage", module: "housekeeping", action: "manage", label: "Atribuir e gerir governança" },
  { code: "housekeeping.inspect", module: "housekeeping", action: "inspect", label: "Inspeccionar e aprovar quartos" },
  { code: "maintenance.read", module: "maintenance", action: "read", label: "Ver manutenção" },
  { code: "maintenance.write", module: "maintenance", action: "write", label: "Abrir pedidos de manutenção" },
  { code: "maintenance.manage", module: "maintenance", action: "manage", label: "Atribuir e gerir manutenção" },
  { code: "maintenance.resolve", module: "maintenance", action: "resolve", label: "Concluir manutenção e libertar quarto" },
  { code: "stay_accounts.read", module: "stay_accounts", action: "read", label: "Ver conta corrente da estadia" },
  { code: "stay_accounts.manage", module: "stay_accounts", action: "manage", label: "Lançar consumos e folios" },
  { code: "rates.read", module: "rates", action: "read", label: "Ver tarifas e planos" },
  { code: "rates.write", module: "rates", action: "write", label: "Criar e alterar tarifas" },
  { code: "reports.read", module: "reports", action: "read", label: "Ver relatórios e auditoria nocturna" },
  { code: "staff.read", module: "staff", action: "read", label: "Ver utilizadores e equipa" },
  { code: "staff.write", module: "staff", action: "write", label: "Gerir utilizadores, perfis e permissões" },
  { code: "settings.write", module: "settings", action: "write", label: "Alterar configurações e horários do hotel" },
  { code: "integrations.sigesc", module: "integrations", action: "sigesc", label: "Gerir ligação ao sistema central" },
  { code: "integrations.customers", module: "integrations", action: "customers", label: "Gerir clientes no sistema central" },
  { code: "integrations.products", module: "integrations", action: "products", label: "Gerir catálogo e preços centrais" },
  { code: "integrations.invoices", module: "integrations", action: "invoices", label: "Emitir cotações, proformas e faturas" },
  { code: "integrations.invoices.settle", module: "integrations", action: "invoices_settle", label: "Publicar e liquidar (pagar) faturas" },
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]["code"];

export const PERMISSION_MODULE_LABELS: Record<string, string> = {
  dashboard: "Painel & Operação",
  hotels: "Hotel",
  rooms: "Quartos & Categorias",
  reservations: "Reservas & Calendário",
  guests: "Hóspedes",
  stays: "Receção & Estadias",
  stay_accounts: "Conta da Estadia & Folios",
  housekeeping: "Governança & Limpeza",
  maintenance: "Manutenção",
  rates: "Tarifas",
  reports: "Relatórios & Auditoria",
  integrations: "Faturação & Sistema Central",
  staff: "Equipa & Permissões",
  settings: "Configurações",
};

export type PermissionOverrideInput = {
  code: string;
  effect: "GRANT" | "DENY";
};

/**
 * Pure deterministic permission resolver:
 * effective = (rolePermissions ∪ GRANT) \ DENY
 */
export function resolveEffectivePermissions(
  rolePermissions: Iterable<string>,
  overrides: Iterable<PermissionOverrideInput> = [],
): string[] {
  const effective = new Set<string>(rolePermissions);
  for (const ov of overrides) {
    if (ov.effect === "GRANT") {
      effective.add(ov.code);
    } else if (ov.effect === "DENY") {
      effective.delete(ov.code);
    }
  }
  return [...effective].sort();
}

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
        !["integrations.sigesc", "staff.write", "settings.write", "reservations.retroactive"].includes(
          c,
        ),
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
