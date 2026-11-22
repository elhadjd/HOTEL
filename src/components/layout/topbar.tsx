"use client";

import { Bell, Languages, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TopBar({
  title,
  userName,
  searchPlaceholder,
  localeLabel,
}: {
  title: string;
  userName: string;
  searchPlaceholder: string;
  localeLabel: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-sand-200/80 bg-sand-50/85 backdrop-blur-md">
      <div className="flex items-center gap-4 px-4 py-3 lg:px-8">
        <div className="min-w-0 flex-1">
          <p className="font-ui text-[11px] uppercase tracking-[0.18em] text-stone-400">
            Modern Hospitality Intelligence
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
          <Button variant="outline" size="sm" className="gap-2">
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
  );
}
