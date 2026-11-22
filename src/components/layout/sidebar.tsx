"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAV } from "./nav-config";
import { cn } from "@/shared/utils";

export function Sidebar({
  labels,
  hotelName,
}: {
  labels: Record<string, string>;
  hotelName: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-fg lg:flex">
      <div className="border-b border-white/10 px-5 py-6">
        <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-sidebar-muted">
          SIGESC
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Hotelaria</h1>
        <p className="font-ui mt-3 truncate text-xs text-sidebar-muted">{hotelName}</p>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {APP_NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname.includes(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "font-ui group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-white/10 text-white"
                  : "text-sidebar-muted hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4 opacity-80" />
              <span>{labels[item.labelKey] ?? item.href}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
