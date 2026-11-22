"use client";

import { useEffect, useState } from "react";
import { Bell, Languages, Menu, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarBrand, SidebarNav } from "./sidebar";

export function TopBar({
  title,
  userName,
  hotelName,
  labels,
  searchPlaceholder,
  localeLabel,
}: {
  title: string;
  userName: string;
  hotelName: string;
  labels: Record<string, string>;
  searchPlaceholder: string;
  localeLabel: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <>
      <header className="z-20 shrink-0 border-b border-sand-200/80 bg-sand-50/90 backdrop-blur-md">
        <div className="flex items-center gap-3 px-4 py-3 lg:gap-4 lg:px-8">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="font-ui text-[11px] uppercase tracking-[0.18em] text-stone-400">
              SIGESC Hotelaria
            </p>
            <h2 className="truncate text-xl font-semibold text-ink-900">{title}</h2>
          </div>
          <div className="hidden max-w-md flex-1 md:block">
            <label className="font-ui relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                className="h-10 w-full rounded-md border border-sand-200 bg-white pl-10 pr-3 text-sm outline-none ring-teal-500/30 placeholder:text-stone-400 focus:ring-2"
                placeholder={searchPlaceholder}
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="hidden gap-2 sm:inline-flex">
              <Languages className="h-3.5 w-3.5" />
              {localeLabel}
            </Button>
            <div className="font-ui hidden items-center gap-2 rounded-md border border-sand-200 bg-white px-3 py-1.5 text-sm sm:flex">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink-900 text-xs text-white">
                {userName.slice(0, 1).toUpperCase()}
              </span>
              <span className="max-w-[120px] truncate text-stone-700">{userName}</span>
            </div>
          </div>
        </div>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink-950/50"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col bg-sidebar text-sidebar-fg shadow-xl animate-fade-up">
            <div className="flex items-center justify-end px-3 pt-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-sidebar-fg hover:bg-white/10"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarBrand hotelName={hotelName} />
            <SidebarNav labels={labels} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
