import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/page-auth";
import { listHotels } from "@/modules/hotels/hotel-service";
import { listReservations } from "@/modules/reservations/reservation-service";
import {
  DEFAULT_HOTEL_SCHEDULE,
  getHotelTodayUtc,
} from "@/modules/reservations/schedule";
import { ReservationsWorkspaceClient } from "./reservations-workspace-client";

export default async function ReservationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await requirePageTenant("reservations.read");
  const hotels = await listHotels(prisma, ctx);
  const hotel = hotels[0] ?? null;

  if (!hotel) {
    return (
      <AppShell title={t("nav.reservations")}>
        <EmptyState title={t("nav.reservations")} description="Configure o hotel primeiro." />
      </AppShell>
    );
  }

  const [reservations, rooms, guests, settings] = await Promise.all([
    listReservations(prisma, ctx, { hotelId: hotel.id }),
    prisma.room.findMany({
      where: { hotelId: hotel.id, active: true },
      orderBy: { code: "asc" },
      include: { category: { select: { name: true } } },
    }),
    prisma.guest.findMany({
      where: { institutionId: ctx.institutionId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 200,
      include: { customerMapping: { select: { syncStatus: true } } },
    }),
    prisma.hotelSettings.findUnique({ where: { hotelId: hotel.id } }),
  ]);

  const schedulePolicy = {
    checkInTime: settings?.checkInTime ?? DEFAULT_HOTEL_SCHEDULE.checkInTime,
    checkOutTime: settings?.checkOutTime ?? DEFAULT_HOTEL_SCHEDULE.checkOutTime,
    earlyCheckInFrom: settings?.earlyCheckInFrom ?? DEFAULT_HOTEL_SCHEDULE.earlyCheckInFrom,
    lateCheckOutUntil: settings?.lateCheckOutUntil ?? DEFAULT_HOTEL_SCHEDULE.lateCheckOutUntil,
    housekeepingTurnaroundMinutes:
      settings?.housekeepingTurnaroundMinutes ??
      DEFAULT_HOTEL_SCHEDULE.housekeepingTurnaroundMinutes,
    noShowCutoffTime: settings?.noShowCutoffTime ?? DEFAULT_HOTEL_SCHEDULE.noShowCutoffTime,
    timezone: settings?.timezone ?? DEFAULT_HOTEL_SCHEDULE.timezone,
  };

  const todayIso = getHotelTodayUtc(schedulePolicy.timezone).toISOString().slice(0, 10);

  return (
    <AppShell title={t("nav.reservations")}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <p className="font-ui max-w-2xl text-sm text-stone-500">
          Gestão completa de reservas futuras, chegadas de hoje, reservas atrasadas e horários de
          check-in ({schedulePolicy.checkInTime}) e check-out ({schedulePolicy.checkOutTime}).
        </p>
        <Badge tone="accent">
          Check-in {schedulePolicy.checkInTime} · Check-out {schedulePolicy.checkOutTime}
        </Badge>
      </div>

      <ReservationsWorkspaceClient
        hotelId={hotel.id}
        todayIso={todayIso}
        schedulePolicy={schedulePolicy}
        canWrite={ctx.permissions.includes("reservations.write")}
        canConfirm={ctx.permissions.includes("reservations.confirm")}
        canCheckIn={ctx.permissions.includes("stays.checkin")}
        canRetroactive={ctx.permissions.includes("reservations.retroactive")}
        initialReservations={reservations.map((r) => ({
          id: r.id,
          code: r.code,
          status: r.status,
          arrivalDate: r.arrivalDate.toISOString().slice(0, 10),
          departureDate: r.departureDate.toISOString().slice(0, 10),
          expectedCheckInTime: r.expectedCheckInTime ?? schedulePolicy.checkInTime,
          expectedCheckOutTime: r.expectedCheckOutTime ?? schedulePolicy.checkOutTime,
          earlyCheckInRequested: r.earlyCheckInRequested,
          lateCheckOutRequested: r.lateCheckOutRequested,
          lateCheckOutApproved: r.lateCheckOutApproved,
          isRetroactive: r.isRetroactive,
          adults: r.adults,
          children: r.children,
          operationalTotal: r.operationalTotal != null ? Number(r.operationalTotal) : null,
          currency: r.currency,
          rooms: r.rooms.map((rr) => ({
            id: rr.room.id,
            code: rr.room.code,
            categoryName: rr.room.category?.name ?? null,
          })),
          primaryGuest: r.guests[0]?.guest
            ? {
                id: r.guests[0].guest.id,
                name: `${r.guests[0].guest.firstName} ${r.guests[0].guest.lastName}`,
                phone: r.guests[0].guest.phone,
              }
            : null,
        }))}
        rooms={rooms.map((rm) => ({
          id: rm.id,
          code: rm.code,
          categoryName: rm.category?.name ?? null,
          occupancyStatus: rm.occupancyStatus,
          housekeepingStatus: rm.housekeepingStatus,
        }))}
        guests={guests.map((g) => ({
          id: g.id,
          label: `${g.firstName} ${g.lastName}`,
          email: g.email,
          phone: g.phone,
          linked: g.customerMapping?.syncStatus === "LINKED",
        }))}
      />
    </AppShell>
  );
}
