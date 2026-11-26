"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { APP_NAV_GROUPS } from "./nav-config";
import { cn } from "@/shared/utils";

export function localizeHref(href: string, locale: string): string {
  if (!locale || locale === "pt") return href;
  if (href === "/") return `/${locale}`;
  return `/${locale}${href.startsWith("/") ? href : `/${href}`}`;
}

function stripLocalePrefix(pathname: string): string {
  const stripped = pathname.replace(/^\/(pt|en|fr|es)(?=\/|$)/, "");
  return stripped || "/";
}

function isActivePath(pathname: string, href: string): boolean {
  const clean = stripLocalePrefix(pathname);
  return clean === href || clean.startsWith(`${href}/`);
}

export function SidebarNav({
  labels,
  permissions,
  locale = "pt",
  onNavigate,
}: {
  labels: Record<string, string>;
  permissions?: string[];
  locale?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const permSet = permissions ? new Set(permissions) : null;

  return (
    <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {APP_NAV_GROUPS.map((group) => {
        const visibleItems = permSet
          ? group.items.filter((item) => !item.permission || permSet.has(item.permission))
          : group.items;

        if (visibleItems.length === 0) return null;

        return (
          <div key={group.id}>
            <p className="font-ui mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-muted/80">
              {labels[group.labelKey] ?? group.id}
            </p>
            <div className="space-y-0.5">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={localizeHref(item.href, locale)}
                    onClick={onNavigate}
                    className={cn(
                      "font-ui group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-white/10 font-medium text-white"
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
        );
      })}
    </nav>
  );
}

export function SidebarBrand({ hotelName }: { hotelName: string }) {
  return (
    <div className="shrink-0 border-b border-white/10 px-5 py-5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/15 ring-1 ring-teal-400/30"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-teal-400" />
        </span>
        <div className="min-w-0">
          <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.22em] text-teal-300/90">
            Hospitality PMS
          </p>
          <h1 className="font-display truncate text-lg font-bold tracking-tight text-white">
            Hotelaria
          </h1>
        </div>
      </div>
      <p className="font-ui mt-3 truncate text-xs text-sidebar-muted">{hotelName}</p>
    </div>
  );
}

export function SidebarLogoutFooter({
  userName,
  locale = "pt",
  logoutLabel = "Terminar sessão",
  loggingOutLabel = "A terminar sessão…",
}: {
  userName: string;
  locale?: string;
  logoutLabel?: string;
  loggingOutLabel?: string;
}) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    setSigningOut(true);
    try {
      await signOut({ redirect: false });
    } finally {
      window.location.assign(localizeHref("/login", locale));
    }
  }

  return (
    <div className="shrink-0 border-t border-white/10 p-3">
      <div className="mb-2 flex items-center gap-2.5 px-2">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/30">
          {userName.slice(0, 1).toUpperCase()}
        </span>
        <span className="font-ui truncate text-xs font-medium text-sidebar-fg">{userName}</span>
      </div>
      <button
        type="button"
        disabled={signingOut}
        onClick={handleLogout}
        className="font-ui flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200 disabled:opacity-60"
      >
        <LogOut className="h-4 w-4 shrink-0" />
        <span className="truncate">{signingOut ? loggingOutLabel : logoutLabel}</span>
      </button>
    </div>
  );
}

export function Sidebar({
  labels,
  hotelName,
  userName,
  permissions,
  locale = "pt",
  logoutLabel,
  loggingOutLabel,
}: {
  labels: Record<string, string>;
  hotelName: string;
  userName: string;
  permissions?: string[];
  locale?: string;
  logoutLabel?: string;
  loggingOutLabel?: string;
}) {
  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-white/5 bg-sidebar text-sidebar-fg lg:flex">
      <SidebarBrand hotelName={hotelName} />
      <SidebarNav labels={labels} permissions={permissions} locale={locale} />
      <SidebarLogoutFooter
        userName={userName}
        locale={locale}
        logoutLabel={logoutLabel}
        loggingOutLabel={loggingOutLabel}
      />
    </aside>
  );
}
