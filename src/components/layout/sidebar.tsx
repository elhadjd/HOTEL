"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAV_GROUPS } from "./nav-config";
import { cn } from "@/shared/utils";

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.endsWith(href) || pathname.includes(`${href}/`);
}

export function SidebarNav({
  labels,
  onNavigate,
}: {
  labels: Record<string, string>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {APP_NAV_GROUPS.map((group) => (
        <div key={group.id}>
          <p className="font-ui mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-muted/80">
            {labels[group.labelKey] ?? group.id}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "font-ui group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-white/10 text-white"
                      : "text-sidebar-muted hover:bg-white/5 hover:text-white",
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-teal-400"
                    />
                  ) : null}
                  <Icon className="h-4 w-4 shrink-0 opacity-80" />
                  <span className="truncate">{labels[item.labelKey] ?? item.href}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function SidebarBrand({ hotelName }: { hotelName: string }) {
  return (
    <div className="border-b border-white/10 px-5 py-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-teal-500/15 ring-1 ring-teal-400/30"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-teal-400" />
        </span>
        <div className="min-w-0">
          <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-sidebar-muted">
            SIGESC
          </p>
          <h1 className="truncate text-xl font-semibold tracking-tight text-white">Hotelaria</h1>
        </div>
      </div>
      <p className="font-ui mt-4 truncate text-xs text-sidebar-muted">{hotelName}</p>
    </div>
  );
}

export function Sidebar({
  labels,
  hotelName,
}: {
  labels: Record<string, string>;
  hotelName: string;
}) {
  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-white/5 bg-sidebar text-sidebar-fg lg:flex">
      <SidebarBrand hotelName={hotelName} />
      <SidebarNav labels={labels} />
    </aside>
  );
}
