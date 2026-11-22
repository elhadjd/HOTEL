import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { listHotels } from "@/modules/hotels/hotel-service";
import { calendarReservations } from "@/modules/reservations/reservation-service";
import { toDateOnlyUtc } from "@/modules/reservations/availability";

function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ hotelId?: string; view?: string; month?: string }>;
}) {
  const { locale } = await params;
  const { hotelId: hotelIdParam, view = "month", month } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("reservations.read");
  const hotels = await listHotels(prisma, ctx);
  const hotelId = hotelIdParam ?? hotels[0]?.id;

  if (!hotelId) {
    return (
      <AppShell title={t("nav.calendar")}>
        <EmptyState title={t("nav.calendar")} description="Crie um hotel primeiro." />
      </AppShell>
    );
  }

  const anchor = month ? toDateOnlyUtc(`${month}-01`) : startOfMonth(new Date());
  const from =
    view === "day"
      ? toDateOnlyUtc(new Date())
      : view === "week"
        ? addDays(toDateOnlyUtc(new Date()), -toDateOnlyUtc(new Date()).getUTCDay())
        : anchor;
  const to =
    view === "day"
      ? addDays(from, 1)
      : view === "week"
        ? addDays(from, 7)
        : new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1));

  const reservations = await calendarReservations(prisma, ctx, { hotelId, from, to });

  const days: Date[] = [];
  for (let d = new Date(from); d < to; d = addDays(d, 1)) {
    days.push(new Date(d));
  }

  return (
    <AppShell title={t("nav.calendar")}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-ui flex flex-wrap gap-2 text-sm">
            {hotels.map((h) => (
              <a
                key={h.id}
                href={`?hotelId=${h.id}&view=${view}`}
                className={
                  h.id === hotelId
                    ? "rounded-md bg-ink-900 px-3 py-1.5 text-white"
                    : "rounded-md border border-sand-200 bg-white px-3 py-1.5 text-stone-600"
                }
              >
                {h.name}
              </a>
            ))}
          </div>
          <div className="font-ui mt-3 flex gap-2 text-sm">
            {(["day", "week", "month"] as const).map((v) => (
              <a
                key={v}
                href={`?hotelId=${hotelId}&view=${v}`}
                className={
                  view === v
                    ? "rounded-md bg-teal-600 px-3 py-1.5 text-white"
                    : "rounded-md border border-sand-200 px-3 py-1.5"
                }
              >
                {v === "day" ? "Dia" : v === "week" ? "Semana" : "Mês"}
              </a>
            ))}
          </div>
        </div>
        <Badge tone="accent">Phase 3</Badge>
      </div>

      {reservations.length === 0 ? (
        <EmptyState title={t("nav.calendar")} description="Sem reservas neste período." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {days.map((day) => {
            const key = day.toISOString().slice(0, 10);
            const dayItems = reservations.filter(
              (r) => r.arrivalDate < addDays(day, 1) && r.departureDate > day,
            );
            return (
              <section key={key} className="surface min-h-36 p-4">
                <h3 className="font-ui text-xs uppercase tracking-[0.16em] text-stone-400">
                  {key}
                </h3>
                <div className="mt-3 space-y-2">
                  {dayItems.length === 0 ? (
                    <p className="font-ui text-sm text-stone-400">—</p>
                  ) : (
                    dayItems.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-md border border-sand-200 bg-sand-50/50 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-ui text-sm font-medium text-ink-900">{r.code}</p>
                          <StatusPill value={r.status} />
                        </div>
                        <p className="font-ui mt-1 text-xs text-stone-500">
                          {r.rooms.map((rr) => rr.room.code).join(", ") || "Sem quarto"}
                          {r.guests[0]
                            ? ` · ${r.guests[0].guest.firstName} ${r.guests[0].guest.lastName}`
                            : ""}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
