import type { Prisma, PrismaClient } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { getHotel } from "@/modules/hotels/hotel-service";
import {
  daysBetweenUtc,
  lockRoomsForUpdate,
  syncRoomOccupancyStatus,
  toDateOnlyUtc,
} from "@/modules/reservations/availability";
import { syncStayAccommodationCharges } from "@/modules/stays/accommodation-billing";

export type HotelKpis = {
  occupancyPercent: number;
  adr: number;
  revpar: number;
  totalRevenue: number;
};

/**
 * Standard hospitality KPI formulas:
 * - Occupancy % = occupiedRooms / sellableRooms * 100
 * - ADR (Average Daily Rate) = accommodationRevenue / occupiedRooms
 * - RevPAR (Revenue Per Available Room) = accommodationRevenue / sellableRooms
 */
export function computeHotelKpis(params: {
  sellableRooms: number;
  occupiedRooms: number;
  accommodationRevenue: number;
  extrasRevenue: number;
}): HotelKpis {
  const sellable = Math.max(0, params.sellableRooms);
  const occupied = Math.max(0, params.occupiedRooms);
  const accom = Math.max(0, params.accommodationRevenue);
  const extras = Math.max(0, params.extrasRevenue);

  const occupancyPercent =
    sellable > 0 ? Number(((occupied / sellable) * 100).toFixed(2)) : 0;
  const adr = occupied > 0 ? Number((accom / occupied).toFixed(2)) : 0;
  const revpar = sellable > 0 ? Number((accom / sellable).toFixed(2)) : 0;
  const totalRevenue = Number((accom + extras).toFixed(2));

  return { occupancyPercent, adr, revpar, totalRevenue };
}

/**
 * Executes the daily Night Audit for a hotel and business date:
 * 1. Marks overdue un-arrived reservations as NO_SHOW and releases their rooms.
 * 2. Synchronizes accommodation charges for all active stays covering the business date.
 * 3. Computes historical Occupancy %, ADR, RevPAR, accommodation & extras operational totals.
 * 4. Counts pending SIGESC reconciliation alerts for management visibility.
 * Idempotent per (hotelId, businessDate) unless `forceRecalculate` is true.
 */
export async function runNightAudit(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: {
    hotelId: string;
    businessDate?: Date | string;
    markNoShows?: boolean;
    forceRecalculate?: boolean;
  },
) {
  const hotel = await getHotel(prisma, ctx, input.hotelId);
  const businessDate = toDateOnlyUtc(input.businessDate ?? new Date());
  const nextDay = new Date(businessDate);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  const existing = await prisma.nightAuditRun.findUnique({
    where: {
      hotelId_businessDate: { hotelId: input.hotelId, businessDate },
    },
  });
  if (existing && !input.forceRecalculate) {
    return { run: existing, alreadyExisted: true };
  }

  let noShowsMarked = 0;
  const noShowCodes: string[] = [];

  if (input.markNoShows !== false) {
    // Reservations whose arrival date is on or before businessDate with zero stays created
    const noShowCandidates = await prisma.reservation.findMany({
      where: {
        institutionId: ctx.institutionId,
        hotelId: input.hotelId,
        status: { in: ["CONFIRMED", "PENDING"] },
        arrivalDate: { lte: businessDate },
        stays: { none: {} },
      },
      include: { rooms: { select: { roomId: true } } },
      take: 200,
    });

    for (const r of noShowCandidates) {
      await prisma.$transaction(async (tx) => {
        const roomIds = r.rooms.map((rr) => rr.roomId);
        await lockRoomsForUpdate(tx, roomIds);

        const claimed = await tx.reservation.updateMany({
          where: {
            id: r.id,
            status: { in: ["CONFIRMED", "PENDING"] },
          },
          data: { status: "NO_SHOW" },
        });
        if (claimed.count !== 1) return;

        await tx.reservationEvent.create({
          data: {
            reservationId: r.id,
            fromStatus: r.status,
            toStatus: "NO_SHOW",
            note: `Marked NO_SHOW by Night Audit (${businessDate.toISOString().slice(0, 10)})`,
            actorUserId: ctx.userId,
          },
        });

        for (const roomId of roomIds) {
          await syncRoomOccupancyStatus(tx, roomId);
        }

        noShowsMarked += 1;
        noShowCodes.push(r.code);
      });
    }
  }

  // Stays overlapping the business night [businessDate, nextDay)
  const staysCoveringNight = await prisma.stay.findMany({
    where: {
      institutionId: ctx.institutionId,
      hotelId: input.hotelId,
      status: { in: ["ACTIVE", "CHECKOUT_PENDING", "COMPLETED"] },
      actualArrival: { lt: nextDay },
      OR: [
        { actualDeparture: null, expectedDeparture: { gt: businessDate } },
        { actualDeparture: { gt: businessDate } },
      ],
    },
    include: {
      accountLines: { where: { status: { not: "VOIDED" } } },
    },
    take: 500,
  });

  // Ensure active stays have up-to-date accommodation charges
  let staysAudited = 0;
  for (const s of staysCoveringNight) {
    if (s.status === "ACTIVE" || s.status === "CHECKOUT_PENDING") {
      await syncStayAccommodationCharges(prisma, ctx, s.id, "CHECK_IN");
      staysAudited += 1;
    }
  }

  // Re-fetch stays' charges and room counts for accurate KPI calculation
  const [rooms, refreshedStays, extrasCharges, reconciliationAlerts] = await Promise.all([
    prisma.room.findMany({
      where: { hotelId: input.hotelId, active: true },
      select: { id: true, maintenanceStatus: true },
    }),
    staysCoveringNight.length > 0
      ? prisma.stay.findMany({
          where: { id: { in: staysCoveringNight.map((s) => s.id) } },
          include: {
            accountLines: {
              where: { kind: "ACCOMMODATION", status: { not: "VOIDED" } },
            },
          },
        })
      : Promise.resolve([]),
    prisma.stayAccountCharge.findMany({
      where: {
        institutionId: ctx.institutionId,
        stay: { hotelId: input.hotelId },
        kind: { not: "ACCOMMODATION" },
        status: { not: "VOIDED" },
        createdAt: { gte: businessDate, lt: nextDay },
      },
      select: { quantity: true, unitPrice: true },
      take: 5000,
    }),
    prisma.invoiceIntegration.count({
      where: {
        institutionId: ctx.institutionId,
        hotelId: input.hotelId,
        status: "RECONCILIATION_REQUIRED",
      },
    }),
  ]);

  const totalRooms = rooms.length;
  const sellableRooms = rooms.filter((r) => r.maintenanceStatus !== "OUT_OF_SERVICE").length;
  const occupiedRoomIds = new Set(refreshedStays.map((s) => s.roomId));
  const occupiedRooms = occupiedRoomIds.size;

  // Daily accommodation operational revenue across stays covering this business night
  let accommodationRevenue = 0;
  for (const s of refreshedStays) {
    const stayNights = Math.max(
      1,
      daysBetweenUtc(
        toDateOnlyUtc(s.actualArrival),
        toDateOnlyUtc(s.actualDeparture ?? s.expectedDeparture),
      ),
    );
    const totalAccom = s.accountLines.reduce(
      (sum, l) => sum + Number(l.unitPrice) * Number(l.quantity),
      0,
    );
    accommodationRevenue += totalAccom / stayNights;
  }
  accommodationRevenue = Number(accommodationRevenue.toFixed(2));

  const extrasRevenue = Number(
    extrasCharges
      .reduce((sum, c) => sum + Number(c.unitPrice) * Number(c.quantity), 0)
      .toFixed(2),
  );

  const kpis = computeHotelKpis({
    sellableRooms,
    occupiedRooms,
    accommodationRevenue,
    extrasRevenue,
  });

  const currency = hotel.settings?.currency ?? "AOA";
  const summaryJson: Prisma.InputJsonValue = {
    businessDate: businessDate.toISOString().slice(0, 10),
    noShowCodes,
    totalRevenue: kpis.totalRevenue,
    recalculated: Boolean(existing),
    note: "Operational hospitality KPIs — official fiscal settlement occurs in SIGESC Central",
  };

  const run = await prisma.nightAuditRun.upsert({
    where: {
      hotelId_businessDate: { hotelId: input.hotelId, businessDate },
    },
    create: {
      institutionId: ctx.institutionId,
      hotelId: input.hotelId,
      businessDate,
      status: "COMPLETED",
      actorUserId: ctx.userId,
      totalRooms,
      sellableRooms,
      occupiedRooms,
      occupancyPercent: kpis.occupancyPercent,
      accommodationRevenue,
      extrasRevenue,
      adr: kpis.adr,
      revpar: kpis.revpar,
      noShowsMarked,
      staysAudited,
      reconciliationAlerts,
      currency,
      summaryJson,
    },
    update: {
      status: "COMPLETED",
      actorUserId: ctx.userId,
      totalRooms,
      sellableRooms,
      occupiedRooms,
      occupancyPercent: kpis.occupancyPercent,
      accommodationRevenue,
      extrasRevenue,
      adr: kpis.adr,
      revpar: kpis.revpar,
      noShowsMarked: (existing?.noShowsMarked ?? 0) + noShowsMarked,
      staysAudited,
      reconciliationAlerts,
      currency,
      summaryJson,
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "CREATE",
      entityType: "NightAuditRun",
      entityId: run.id,
      metadata: {
        hotelId: input.hotelId,
        businessDate: businessDate.toISOString().slice(0, 10),
        occupancyPercent: kpis.occupancyPercent,
        adr: kpis.adr,
        revpar: kpis.revpar,
        noShowsMarked,
        reconciliationAlerts,
      },
    },
  });

  return { run, alreadyExisted: false };
}

export async function listNightAuditRuns(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters?: { hotelId?: string; limit?: number },
) {
  if (filters?.hotelId) await getHotel(prisma, ctx, filters.hotelId);
  return prisma.nightAuditRun.findMany({
    where: {
      institutionId: ctx.institutionId,
      ...(filters?.hotelId ? { hotelId: filters.hotelId } : {}),
    },
    include: {
      hotel: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(filters?.limit ?? 30, 1), 100),
  });
}
