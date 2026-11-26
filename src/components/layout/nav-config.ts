import {
  BedDouble,
  CalendarDays,
  ClipboardCheck,
  ConciergeBell,
  LayoutDashboard,
  Settings,
  Sparkles,
  Users,
  Wrench,
  Building2,
  Tags,
  LineChart,
  Plug,
  LogIn,
  LogOut,
  Package,
  FileText,
  Contact,
  LayoutGrid,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { PermissionCode } from "@/modules/iam/permissions";

export type AppNavItem = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  permission?: PermissionCode;
};

export type AppNavGroup = {
  id: string;
  labelKey: string;
  items: readonly AppNavItem[];
};

export const APP_NAV_GROUPS = [
  {
    id: "overview",
    labelKey: "nav.groupOverview",
    items: [
      { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, permission: "dashboard.read" },
      { href: "/dashboard/front-desk", labelKey: "nav.frontDesk", icon: ConciergeBell, permission: "dashboard.read" },
      { href: "/hotels", labelKey: "nav.hotels", icon: Building2, permission: "hotels.read" },
    ],
  },
  {
    id: "front-desk",
    labelKey: "nav.groupFrontDesk",
    items: [
      { href: "/check-in", labelKey: "nav.checkIn", icon: LogIn, permission: "stays.checkin" },
      { href: "/check-out", labelKey: "nav.checkOut", icon: LogOut, permission: "stays.checkout" },
      { href: "/stays", labelKey: "nav.stays", icon: ConciergeBell, permission: "stays.read" },
      { href: "/reservations", labelKey: "nav.reservations", icon: CalendarDays, permission: "reservations.read" },
      { href: "/calendar", labelKey: "nav.calendar", icon: CalendarDays, permission: "reservations.read" },
      { href: "/guests", labelKey: "nav.guests", icon: Users, permission: "guests.read" },
    ],
  },
  {
    id: "rooms",
    labelKey: "nav.groupRooms",
    items: [
      { href: "/rooms/operations", labelKey: "nav.roomOperations", icon: LayoutGrid, permission: "rooms.read" },
      { href: "/rooms", labelKey: "nav.rooms", icon: BedDouble, permission: "rooms.read" },
      { href: "/room-categories", labelKey: "nav.roomCategories", icon: Tags, permission: "rooms.read" },
    ],
  },
  {
    id: "operations",
    labelKey: "nav.groupOperations",
    items: [
      { href: "/housekeeping/operations", labelKey: "nav.housekeepingOps", icon: Sparkles, permission: "housekeeping.read" },
      { href: "/maintenance/operations", labelKey: "nav.maintenanceOps", icon: Wrench, permission: "maintenance.read" },
      { href: "/operations/consumption", labelKey: "nav.consumption", icon: UtensilsCrossed, permission: "stay_accounts.read" },
      { href: "/housekeeping", labelKey: "nav.housekeeping", icon: Sparkles, permission: "housekeeping.read" },
      { href: "/maintenance", labelKey: "nav.maintenance", icon: Wrench, permission: "maintenance.read" },
      { href: "/rates", labelKey: "nav.rates", icon: ClipboardCheck, permission: "rates.read" },
      { href: "/reports", labelKey: "nav.reports", icon: LineChart, permission: "reports.read" },
    ],
  },
  {
    id: "integrations",
    labelKey: "nav.groupIntegrations",
    items: [
      { href: "/integrations/sigesc", labelKey: "nav.integrations", icon: Plug, permission: "integrations.sigesc" },
      { href: "/integrations/customers", labelKey: "nav.centralCustomers", icon: Contact, permission: "integrations.customers" },
      { href: "/integrations/products", labelKey: "nav.centralProducts", icon: Package, permission: "integrations.products" },
      { href: "/integrations/invoices", labelKey: "nav.centralInvoices", icon: FileText, permission: "integrations.invoices" },
    ],
  },
  {
    id: "system",
    labelKey: "nav.groupSystem",
    items: [
      { href: "/staff", labelKey: "nav.staff", icon: Users, permission: "staff.read" },
      { href: "/settings", labelKey: "nav.settings", icon: Settings, permission: "settings.write" },
    ],
  },
] as const satisfies readonly AppNavGroup[];

/** Flat list kept for label resolution and legacy imports */
export const APP_NAV: AppNavItem[] = APP_NAV_GROUPS.flatMap((group) => [...group.items]);
