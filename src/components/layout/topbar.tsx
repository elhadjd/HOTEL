"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  Info,
  Languages,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Settings,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  localizeHref,
  SidebarBrand,
  SidebarLogoutFooter,
  SidebarNav,
} from "./sidebar";

type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
};

type LiveAlertItem = {
  id: string;
  severity: "info" | "warning" | "danger";
  title: string;
  body: string;
  href: string;
  count: number;
};

const SUPPORTED_LOCALES = [
  { code: "pt", short: "PT", label: "Português" },
  { code: "en", short: "EN", label: "English" },
  { code: "fr", short: "FR", label: "Français" },
  { code: "es", short: "ES", label: "Español" },
] as const;

function stripLocaleFromPath(pathname: string): string {
  const clean = pathname.replace(/^\/(pt|en|fr|es)(?=\/|$)/, "");
  return clean || "/";
}

export function TopBar({
  title,
  userName,
  hotelName,
  labels,
  permissions,
  locale,
  searchPlaceholder,
  logoutLabel,
  loggingOutLabel,
  notificationsLabels,
}: {
  title: string;
  userName: string;
  hotelName: string;
  labels: Record<string, string>;
  permissions?: string[];
  locale: string;
  searchPlaceholder: string;
  logoutLabel: string;
  loggingOutLabel: string;
  notificationsLabels: {
    title: string;
    markAllRead: string;
    empty: string;
    operationalAlerts: string;
    systemNotifications: string;
  };
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<"none" | "notifications" | "language" | "user">("none");
  const [signingOut, setSigningOut] = useState(false);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [alerts, setAlerts] = useState<LiveAlertItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [badgeCount, setBadgeCount] = useState(0);
  const [loadingNotif, setLoadingNotif] = useState(false);

  const menuContainerRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    setLoadingNotif(true);
    try {
      const res = await fetch("/api/v1/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications((data.notifications ?? []) as NotificationItem[]);
      setAlerts((data.alerts ?? []) as LiveAlertItem[]);
      setUnreadCount(Number(data.unreadCount ?? 0));
      setBadgeCount(Number(data.badgeCount ?? 0));
    } catch {
      // Non-blocking topbar poll
    } finally {
      setLoadingNotif(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (openMenu === "none" && !mobileOpen) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenMenu("none");
        setMobileOpen(false);
      }
    }
    function onPointerDown(e: MouseEvent) {
      if (
        openMenu !== "none" &&
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setOpenMenu("none");
      }
    }

    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [openMenu, mobileOpen]);

  function switchLocale(nextLocale: string) {
    setOpenMenu("none");
    setMobileOpen(false);
    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
    const cleanPath = stripLocaleFromPath(pathname || "/");
    const targetPath = localizeHref(cleanPath, nextLocale);
    const search = typeof window !== "undefined" ? window.location.search : "";
    window.location.assign(`${targetPath}${search}`);
  }

  async function handleLogout() {
    setSigningOut(true);
    setOpenMenu("none");
    setMobileOpen(false);
    try {
      await signOut({ redirect: false });
    } finally {
      window.location.assign(localizeHref("/login", locale));
    }
  }

  async function markOneRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    setBadgeCount((c) => Math.max(alerts.length, c - 1));
    await fetch("/api/v1/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  async function markAllRead() {
    const nowIso = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? nowIso })));
    setUnreadCount(0);
    setBadgeCount(alerts.length);
    await fetch("/api/v1/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    }).catch(() => {});
  }

  const currentLocaleObj =
    SUPPORTED_LOCALES.find((l) => l.code === locale) ?? SUPPORTED_LOCALES[0];
  const canAccessSettings = !permissions || permissions.includes("settings.manage");

  return (
    <>
      <header className="z-30 shrink-0 border-b border-sand-200/80 bg-sand-50/90 backdrop-blur-md">
        <div className="flex items-center gap-2.5 px-3.5 py-3 sm:gap-3 sm:px-6 lg:gap-4 lg:px-8">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 lg:hidden"
            aria-label="Abrir menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>

          <div className="min-w-0 flex-1">
            <p className="font-ui truncate text-[10px] font-medium uppercase tracking-[0.16em] text-stone-400 sm:text-[11px]">
              {hotelName}
            </p>
            <h2 className="font-display truncate text-lg font-semibold text-ink-900 sm:text-xl">
              {title}
            </h2>
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

          {/* Interactive TopBar Actions (Notifications + Language + User/Logout) */}
          <div ref={menuContainerRef} className="relative flex shrink-0 items-center gap-1.5 sm:gap-2">
            {/* Notification Bell */}
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={notificationsLabels.title}
                aria-expanded={openMenu === "notifications"}
                onClick={() => {
                  const next = openMenu === "notifications" ? "none" : "notifications";
                  setOpenMenu(next);
                  if (next === "notifications") {
                    void fetchNotifications();
                  }
                }}
                className="relative"
              >
                <Bell className="h-4 w-4" />
                {badgeCount > 0 ? (
                  <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] font-bold leading-none text-white">
                    {badgeCount > 9 ? "9+" : badgeCount}
                  </span>
                ) : null}
              </Button>

              {openMenu === "notifications" ? (
                <div className="fixed inset-x-3 top-16 z-50 flex max-h-[75dvh] flex-col overflow-hidden rounded-xl border border-sand-200 bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
                  <div className="flex items-center justify-between gap-2 border-b border-sand-200 bg-sand-50/80 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink-900">
                        {notificationsLabels.title}
                      </h3>
                      {badgeCount > 0 ? (
                        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                          {badgeCount}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      {unreadCount > 0 ? (
                        <button
                          type="button"
                          onClick={markAllRead}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-50"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          {notificationsLabels.markAllRead}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void fetchNotifications()}
                        aria-label="Actualizar"
                        className="rounded-md p-1 text-stone-500 hover:bg-sand-100"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${loadingNotif ? "animate-spin" : ""}`} />
                      </button>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-sand-100">
                    {alerts.length === 0 && notifications.length === 0 ? (
                      <p className="font-ui px-4 py-8 text-center text-xs text-stone-500">
                        {notificationsLabels.empty}
                      </p>
                    ) : (
                      <>
                        {alerts.length > 0 ? (
                          <div className="p-2">
                            <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                              {notificationsLabels.operationalAlerts}
                            </p>
                            <div className="space-y-1">
                              {alerts.map((alert) => (
                                <Link
                                  key={alert.id}
                                  href={localizeHref(alert.href, locale)}
                                  onClick={() => setOpenMenu("none")}
                                  className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-sand-50"
                                >
                                  <span
                                    className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                                      alert.severity === "danger"
                                        ? "bg-red-100 text-danger"
                                        : alert.severity === "warning"
                                          ? "bg-amber-100 text-amber-800"
                                          : "bg-teal-100 text-teal-700"
                                    }`}
                                  >
                                    {alert.severity === "info" ? (
                                      <Info className="h-3.5 w-3.5" />
                                    ) : (
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                    )}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-ink-900">
                                      {alert.title}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-stone-500">
                                      {alert.body}
                                    </p>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {notifications.length > 0 ? (
                          <div className="p-2">
                            <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                              {notificationsLabels.systemNotifications}
                            </p>
                            <div className="space-y-1">
                              {notifications.map((n) => {
                                const unread = !n.readAt;
                                return (
                                  <button
                                    key={n.id}
                                    type="button"
                                    onClick={() => {
                                      if (unread) void markOneRead(n.id);
                                    }}
                                    className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                                      unread ? "bg-teal-50/60 hover:bg-teal-50" : "hover:bg-sand-50"
                                    }`}
                                  >
                                    <span
                                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                        unread ? "bg-teal-600" : "bg-sand-200"
                                      }`}
                                    />
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-medium text-ink-900">{n.title}</p>
                                      {n.body ? (
                                        <p className="mt-0.5 text-[11px] text-stone-500">
                                          {n.body}
                                        </p>
                                      ) : null}
                                      <p className="mt-1 font-mono text-[10px] text-stone-400">
                                        {new Date(n.createdAt).toLocaleString()}
                                      </p>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Language Selector (Desktop + Mobile) */}
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Selecionar idioma"
                aria-expanded={openMenu === "language"}
                onClick={() => setOpenMenu(openMenu === "language" ? "none" : "language")}
                className="gap-1.5 px-2.5 sm:px-3"
              >
                <Languages className="h-3.5 w-3.5" />
                <span className="font-mono text-xs font-semibold">{currentLocaleObj.short}</span>
                <ChevronDown className="hidden h-3 w-3 opacity-60 sm:inline" />
              </Button>

              {openMenu === "language" ? (
                <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-sand-200 bg-white py-1 shadow-xl">
                  {SUPPORTED_LOCALES.map((item) => {
                    const active = item.code === currentLocaleObj.code;
                    return (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => switchLocale(item.code)}
                        className={`flex w-full items-center justify-between px-3.5 py-2 text-left text-sm transition ${
                          active
                            ? "bg-teal-50 font-semibold text-teal-800"
                            : "text-ink-900 hover:bg-sand-50"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-stone-500">
                            {item.short}
                          </span>
                          <span>{item.label}</span>
                        </span>
                        {active ? <Check className="h-3.5 w-3.5 text-teal-700" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* User Account Menu (Avatar visible on Mobile AND Desktop + Logout) */}
            <div className="relative">
              <button
                type="button"
                aria-label={userName}
                aria-expanded={openMenu === "user"}
                onClick={() => setOpenMenu(openMenu === "user" ? "none" : "user")}
                className="font-ui flex items-center gap-2 rounded-md border border-sand-200 bg-white p-1 text-sm transition hover:border-teal-500/40 sm:px-2.5 sm:py-1.5"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white">
                  {userName.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-[120px] truncate text-stone-700 sm:inline">
                  {userName}
                </span>
                <ChevronDown className="hidden h-3.5 w-3.5 text-stone-400 sm:inline" />
              </button>

              {openMenu === "user" ? (
                <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-sand-200 bg-white shadow-xl">
                  <div className="border-b border-sand-100 bg-sand-50/70 px-4 py-3">
                    <p className="truncate text-sm font-semibold text-ink-900">{userName}</p>
                    <p className="truncate text-xs text-stone-500">{hotelName}</p>
                  </div>
                  <div className="p-1.5">
                    {canAccessSettings ? (
                      <Link
                        href={localizeHref("/settings", locale)}
                        onClick={() => setOpenMenu("none")}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-900 transition hover:bg-sand-50"
                      >
                        <Settings className="h-4 w-4 text-stone-500" />
                        <span>{labels["nav.settings"] ?? "Definições"}</span>
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      disabled={signingOut}
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-danger transition hover:bg-red-50 disabled:opacity-60"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>{signingOut ? loggingOutLabel : logoutLabel}</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer with Language Switcher & Logout Footer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink-950/50 backdrop-blur-[1px]"
            aria-label="Fechar menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex h-dvh w-[min(19rem,88vw)] flex-col bg-sidebar text-sidebar-fg shadow-2xl">
            <div className="flex shrink-0 items-center justify-end px-3 pt-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-sidebar-fg hover:bg-white/10"
                aria-label="Fechar menu"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarBrand hotelName={hotelName} />
            <SidebarNav
              labels={labels}
              permissions={permissions}
              locale={locale}
              onNavigate={() => setMobileOpen(false)}
            />
            {/* Mobile quick language switcher */}
            <div className="shrink-0 border-t border-white/10 px-4 py-2.5">
              <div className="flex items-center justify-between gap-1">
                {SUPPORTED_LOCALES.map((item) => {
                  const active = item.code === currentLocaleObj.code;
                  return (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => switchLocale(item.code)}
                      className={`flex-1 rounded-md py-1.5 font-mono text-xs font-semibold transition ${
                        active
                          ? "bg-teal-500/25 text-teal-200 ring-1 ring-teal-400/40"
                          : "text-sidebar-muted hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {item.short}
                    </button>
                  );
                })}
              </div>
            </div>
            <SidebarLogoutFooter
              userName={userName}
              locale={locale}
              logoutLabel={logoutLabel}
              loggingOutLabel={loggingOutLabel}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
