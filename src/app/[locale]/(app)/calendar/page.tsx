import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { listHotels } from "@/modules/hotels/hotel-service";
import { toDateOnlyUtc } from "@/modules/reservations/availability";
import { TapeChartClient, type TapeChartBooking } from "./tape-chart-client";

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
  searchParams: Promise<{ hotelId?: string; view?: string; start?: string; span?: string }>;
}) {
  const { locale } = await params;
  const {
    hotelId: hotelIdParam,
    view = "tape",
    start: startParam,
    span: spanParam,
  } = await searchParams;
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

  const today = toDateOnlyUtc(new Date());
  const todayKey = today.toISOString().slice(0, 10);
  const spanDays = spanParam === "7" ? 7 : spanParam === "30" ? 30 : 14;
  const from = startParam ? toDateOnlyUtc(startParam) : addDays(today, -1);
  const to = addDays(from, spanDays);

  const [rooms, reservations] = await Promise.all([
    prisma.room.findMany({
      where: { hotelId, active: true, hotel: { institutionId: ctx.institutionId } },
      include: { category: { select: { name: true } } },
      orderBy: [{ floor: "asc" }, { code: "asc" }],
      take: 200,
    }),
    prisma.reservation.findMany({
      where: {
        institutionId: ctx.institutionId,
        hotelId,
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        arrivalDate: { lt: to },
        departureDate: { gt: from },
      },
      include: {
        rooms: { include: { room: true } },
        guests: { where: { isPrimary: true }, include: { guest: true } },
        stays: { select: { id: true, roomId: true, status: true } },
      },
      orderBy: { arrivalDate: "asc" },
      take: 400,
    }),
  ]);

  const days: Date[] = [];
  for (let d = new Date(from); d < to; d = addDays(d, 1)) {
    days.push(new Date(d));
  }
  const dayKeys = days.map((d) => d.toISOString().slice(0, 10));

  const bookings: TapeChartBooking[] = reservations.flatMap((r) => {
    const primary = r.guests[0]?.guest;
    const guestName = primary ? `${primary.firstName} ${primary.lastName}` : r.code;
    return r.rooms.map((rr) => {
      const stay = r.stays.find((s) => s.roomId === rr.roomId) ?? r.stays[0];
      return {
        reservationId: r.id,
        code: r.code,
        status: r.status,
        roomId: rr.roomId,
        arrivalDate: rr.arrivalDate.toISOString().slice(0, 10),
        departureDate: rr.departureDate.toISOString().slice(0, 10),
        guestName,
        stayId: stay?.id ?? null,
      };
    });
  });

  const prevStart = addDays(from, -spanDays).toISOString().slice(0, 10);
  const nextStart = addDays(from, spanDays).toISOString().slice(0, 10);

  return (
    <AppShell title={t("nav.calendar")}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-ui flex flex-wrap gap-2 text-sm">
            {hotels.map((h) => (
              <a
                key={h.id}
                href={`?hotelId=${h.id}&view=${view}&span=${spanDays}`}
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
          <div className="font-ui mt-3 flex flex-wrap items-center gap-2 text-xs">
            <a
              href={`?hotelId=${hotelId}&view=tape&start=${from.toISOString().slice(0, 10)}&span=${spanDays}`}
              className={`rounded-md px-3 py-1.5 ${
                view !== "list" ? "bg-teal-600 text-white" : "border border-sand-200 bg-white"
              }`}
            >
              Tape Chart (Quartos × Dias)
            </a>
            <a
              href={`?hotelId=${hotelId}&view=list&start=${from.toISOString().slice(0, 10)}&span=${spanDays}`}
              className={`rounded-md px-3 py-1.5 ${
                view === "list" ? "bg-teal-600 text-white" : "border border-sand-200 bg-white"
              }`}
            >
              Agenda por dia
            </a>
            <span className="mx-1 text-stone-300">|</span>
            {([7, 14, 30] as const).map((n) => (
              <a
                key={n}
                href={`?hotelId=${hotelId}&view=${view}&start=${from.toISOString().slice(0, 10)}&span=${n}`}
                className={`rounded-md px-2.5 py-1.5 ${
                  spanDays === n ? "bg-ink-900 text-white" : "border border-sand-200 bg-white"
                }`}
              >
                {n} dias
              </a>
            ))}
            <span className="mx-1 text-stone-300">|</span>
            <a
              href={`?hotelId=${hotelId}&view=${view}&start=${prevStart}&span=${spanDays}`}
              className="rounded-md border border-sand-200 bg-white px-2.5 py-1.5 hover:bg-sand-50"
            >
              ← Anterior
            </a>
            <a
              href={`?hotelId=${hotelId}&view=${view}&start=${todayKey}&span=${spanDays}`}
              className="rounded-md border border-sand-200 bg-white px-2.5 py-1.5 hover:bg-sand-50"
            >
              Hoje
            </a>
            <a
              href={`?hotelId=${hotelId}&view=${view}&start=${nextStart}&span=${spanDays}`}
              className="rounded-md border border-sand-200 bg-white px-2.5 py-1.5 hover:bg-sand-50"
            >
              Seguinte →
            </a>
          </div>
        </div>
        <Badge tone="accent">Tape Chart</Badge>
      </div>

      {view === "list" ? (
        reservations.length === 0 ? (
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
        )
      ) : (
        <TapeChartClient
          hotelId={hotelId}
          rooms={rooms.map((r) => ({
            id: r.id,
            code: r.code,
            floor: r.floor,
            categoryName: r.category.name,
            housekeepingStatus: r.housekeepingStatus,
            maintenanceStatus: r.maintenanceStatus,
          }))}
          days={dayKeys}
          todayKey={todayKey}
          bookings={bookings}
        />
      )}
    </AppShell>
  );
}
