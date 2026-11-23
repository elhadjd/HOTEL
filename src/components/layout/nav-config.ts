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

export type AppNavItem = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
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
      { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { href: "/dashboard/front-desk", labelKey: "nav.frontDesk", icon: ConciergeBell },
      { href: "/hotels", labelKey: "nav.hotels", icon: Building2 },
    ],
  },
  {
    id: "front-desk",
    labelKey: "nav.groupFrontDesk",
    items: [
      { href: "/check-in", labelKey: "nav.checkIn", icon: LogIn },
      { href: "/check-out", labelKey: "nav.checkOut", icon: LogOut },
      { href: "/stays", labelKey: "nav.stays", icon: ConciergeBell },
      { href: "/reservations", labelKey: "nav.reservations", icon: CalendarDays },
      { href: "/calendar", labelKey: "nav.calendar", icon: CalendarDays },
      { href: "/guests", labelKey: "nav.guests", icon: Users },
    ],
  },
  {
    id: "rooms",
    labelKey: "nav.groupRooms",
    items: [
      { href: "/rooms/operations", labelKey: "nav.roomOperations", icon: LayoutGrid },
      { href: "/rooms", labelKey: "nav.rooms", icon: BedDouble },
      { href: "/room-categories", labelKey: "nav.roomCategories", icon: Tags },
    ],
  },
  {
    id: "operations",
    labelKey: "nav.groupOperations",
    items: [
      { href: "/housekeeping/operations", labelKey: "nav.housekeepingOps", icon: Sparkles },
      { href: "/maintenance/operations", labelKey: "nav.maintenanceOps", icon: Wrench },
      { href: "/operations/consumption", labelKey: "nav.consumption", icon: UtensilsCrossed },
      { href: "/housekeeping", labelKey: "nav.housekeeping", icon: Sparkles },
      { href: "/maintenance", labelKey: "nav.maintenance", icon: Wrench },
      { href: "/rates", labelKey: "nav.rates", icon: ClipboardCheck },
      { href: "/reports", labelKey: "nav.reports", icon: LineChart },
    ],
  },
  {
    id: "integrations",
    labelKey: "nav.groupIntegrations",
    items: [
      { href: "/integrations/sigesc", labelKey: "nav.integrations", icon: Plug },
      { href: "/integrations/customers", labelKey: "nav.centralCustomers", icon: Contact },
      { href: "/integrations/products", labelKey: "nav.centralProducts", icon: Package },
      { href: "/integrations/invoices", labelKey: "nav.centralInvoices", icon: FileText },
    ],
  },
  {
    id: "system",
    labelKey: "nav.groupSystem",
    items: [
      { href: "/staff", labelKey: "nav.staff", icon: Users },
      { href: "/settings", labelKey: "nav.settings", icon: Settings },
    ],
  },
] as const satisfies readonly AppNavGroup[];

/** Flat list kept for label resolution and legacy imports */
export const APP_NAV: AppNavItem[] = APP_NAV_GROUPS.flatMap((group) => [...group.items]);
