import type { PrismaClient } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { toDateOnlyUtc } from "@/modules/reservations/availability";
import { isGuestCustomerLinked } from "@/modules/guests/guest-service";

export type FrontDeskFilters = {
  hotelId?: string;
  onDate?: Date;
};

function dayRange(onDate?: Date) {
  const day = toDateOnlyUtc(onDate ?? new Date());
  const next = new Date(day);
  next.setUTCDate(next.getUTCDate() + 1);
  return { day, next };
}

function nightsBetween(arrival: Date, departure: Date): number {
  const a = toDateOnlyUtc(arrival).getTime();
  const d = toDateOnlyUtc(departure).getTime();
  return Math.max(0, Math.round((d - a) / 86_400_000));
}

/**
 * Tenant-scoped Front Desk command-center snapshot.
 * Metrics use explicit business rules — never invents contradictory room states.
 *
 * Ready room = AVAILABLE occupancy + CLEAN housekeeping + OK maintenance + active.
 * Dirty awaiting cleaning = DIRTY (regardless of occupancy).
 * Under maintenance = UNDER_MAINTENANCE or OUT_OF_SERVICE.
 */
export async function getFrontDeskSnapshot(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters: FrontDeskFilters = {},
) {
  const { day, next } = dayRange(filters.onDate);
  const hotelId = filters.hotelId;
  const hotelScope = hotelId
    ? { hotelId, hotel: { institutionId: ctx.institutionId } }
    : { hotel: { institutionId: ctx.institutionId } };
  const reservationHotel = hotelId ? { hotelId } : {};
  const stayHotel = hotelId ? { hotelId } : {};

  const [
    arrivals,
    departures,
    currentGuests,
    roomGroups,
    hkPending,
    maintOpen,
    invoicesRecon,
    guestsUnresolved,
  ] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        institutionId: ctx.institutionId,
        status: { in: ["CONFIRMED", "PENDING"] },
        arrivalDate: { gte: day, lt: next },
        ...reservationHotel,
      },
      include: {
        rooms: {
          include: {
            room: {
              include: { category: { select: { id: true, name: true, code: true } } },
            },
          },
        },
        guests: {
          include: {
            guest: { include: { customerMapping: true } },
          },
        },
        stays: { select: { id: true, roomId: true, status: true } },
      },
      orderBy: { arrivalDate: "asc" },
      take: 100,
    }),
    prisma.stay.findMany({
      where: {
        institutionId: ctx.institutionId,
        status: { in: ["ACTIVE", "CHECKOUT_PENDING"] },
        expectedDeparture: { gte: day, lt: next },
        ...stayHotel,
      },
      include: {
        guest: { include: { customerMapping: true } },
        room: { select: { id: true, code: true } },
        reservation: { select: { id: true, code: true } },
        accountLines: { where: { status: { not: "VOIDED" } } },
      },
      orderBy: { expectedDeparture: "asc" },
      take: 100,
    }),
    prisma.stay.findMany({
      where: {
        institutionId: ctx.institutionId,
        status: { in: ["ACTIVE", "CHECKOUT_PENDING"] },
        ...stayHotel,
      },
      include: {
        guest: { select: { id: true, firstName: true, lastName: true } },
        room: { select: { id: true, code: true } },
        reservation: { select: { id: true, code: true, arrivalDate: true } },
      },
      orderBy: { expectedDeparture: "asc" },
      take: 200,
    }),
    prisma.room.groupBy({
      by: ["occupancyStatus", "housekeepingStatus", "maintenanceStatus"],
      where: { active: true, ...hotelScope },
      _count: { _all: true },
    }),
    prisma.housekeepingTask.count({
      where: {
        hotel: { institutionId: ctx.institutionId },
        ...(hotelId ? { hotelId } : {}),
        status: {
          in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "INSPECTION_REQUIRED", "REJECTED"],
        },
      },
    }),
    prisma.maintenanceRequest.count({
      where: {
        hotel: { institutionId: ctx.institutionId },
        ...(hotelId ? { hotelId } : {}),
        status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_PARTS"] },
      },
    }),
    prisma.invoiceIntegration.count({
      where: {
        institutionId: ctx.institutionId,
        status: "RECONCILIATION_REQUIRED",
        ...(hotelId ? { hotelId } : {}),
      },
    }),
    prisma.guestCustomerMapping.count({
      where: {
        institutionId: ctx.institutionId,
        syncStatus: { in: ["NEEDS_RESOLUTION", "UNLINKED"] },
      },
    }),
  ]);

  let readyRooms = 0;
  let occupiedRooms = 0;
  let dirtyRooms = 0;
  let cleaningRooms = 0;
  let inspectingRooms = 0;
  let outOfServiceRooms = 0;
  let underMaintenanceRooms = 0;
  let availableRaw = 0;

  for (const g of roomGroups) {
    const n = g._count._all;
    if (g.occupancyStatus === "OCCUPIED") occupiedRooms += n;
    if (g.occupancyStatus === "AVAILABLE") availableRaw += n;
    if (g.housekeepingStatus === "DIRTY") dirtyRooms += n;
    if (g.housekeepingStatus === "CLEANING") cleaningRooms += n;
    if (g.housekeepingStatus === "INSPECTING") inspectingRooms += n;
    if (g.maintenanceStatus === "OUT_OF_SERVICE") outOfServiceRooms += n;
    if (g.maintenanceStatus === "UNDER_MAINTENANCE") underMaintenanceRooms += n;
    if (
      g.occupancyStatus === "AVAILABLE" &&
      g.housekeepingStatus === "CLEAN" &&
      g.maintenanceStatus === "OK"
    ) {
      readyRooms += n;
    }
  }

  const stayIds = [
    ...new Set([...departures.map((s) => s.id), ...currentGuests.map((s) => s.id)]),
  ];
  const invoices =
    stayIds.length > 0
      ? await prisma.invoiceIntegration.findMany({
          where: {
            institutionId: ctx.institutionId,
            stayId: { in: stayIds },
          },
          select: {
            id: true,
            stayId: true,
            externalId: true,
            saleKey: true,
            status: true,
            centralState: true,
            centralTotal: true,
            currency: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [];
  const invoiceByStay = new Map<string, (typeof invoices)[number]>();
  for (const inv of invoices) {
    if (inv.stayId && !invoiceByStay.has(inv.stayId)) {
      invoiceByStay.set(inv.stayId, inv);
    }
  }

  const arrivalRows = arrivals.map((r) => {
    const primary = r.guests.find((g) => g.isPrimary) ?? r.guests[0];
    const checkedRoomIds = new Set(r.stays.map((s) => s.roomId));
    const pendingRoomAssign =
      r.rooms.find((rr) => !checkedRoomIds.has(rr.roomId))?.room ?? r.rooms[0]?.room ?? null;
    const allCheckedIn =
      r.rooms.length > 0 && r.rooms.every((rr) => checkedRoomIds.has(rr.roomId));
    const linked = isGuestCustomerLinked(primary?.guest.customerMapping);
    return {
      reservationId: r.id,
      code: r.code,
      status: r.status,
      arrivalDate: r.arrivalDate.toISOString(),
      departureDate: r.departureDate.toISOString(),
      guestName: primary
        ? `${primary.guest.firstName} ${primary.guest.lastName}`
        : "—",
      guestId: primary?.guest.id ?? null,
      customerLinked: linked,
      roomCode: pendingRoomAssign?.code ?? null,
      roomId: pendingRoomAssign?.id ?? null,
      categoryName: pendingRoomAssign?.category?.name ?? null,
      housekeepingStatus: pendingRoomAssign?.housekeepingStatus ?? null,
      maintenanceStatus: pendingRoomAssign?.maintenanceStatus ?? null,
      occupancyStatus: pendingRoomAssign?.occupancyStatus ?? null,
      stayId: r.stays[0]?.id ?? null,
      checkInEligible:
        !allCheckedIn &&
        ["CONFIRMED", "PENDING", "CHECKED_IN"].includes(r.status) &&
        Boolean(pendingRoomAssign) &&
        linked &&
        pendingRoomAssign?.housekeepingStatus === "CLEAN" &&
        pendingRoomAssign?.maintenanceStatus === "OK" &&
        pendingRoomAssign?.occupancyStatus !== "OCCUPIED",
    };
  });

  const departureRows = departures.map((s) => {
    const inv = invoiceByStay.get(s.id);
    const chargeTotal = s.accountLines.reduce(
      (sum, l) => sum + Number(l.unitPrice) * Number(l.quantity),
      0,
    );
    return {
      stayId: s.id,
      guestName: `${s.guest.firstName} ${s.guest.lastName}`,
      guestId: s.guest.id,
      roomCode: s.room.code,
      roomId: s.room.id,
      expectedDeparture: s.expectedDeparture.toISOString(),
      status: s.status,
      reservationCode: s.reservation.code,
      operationalChargesTotal: Number(chargeTotal.toFixed(2)),
      invoice: inv
        ? {
            id: inv.id,
            externalId: inv.externalId,
            status: inv.status,
            centralState: inv.centralState,
            centralTotal: inv.centralTotal != null ? Number(inv.centralTotal) : null,
            currency: inv.currency,
          }
        : null,
      checkOutEligible: ["ACTIVE", "CHECKOUT_PENDING"].includes(s.status),
    };
  });

  const currentRows = currentGuests.map((s) => {
    const inv = invoiceByStay.get(s.id);
    return {
      stayId: s.id,
      guestName: `${s.guest.firstName} ${s.guest.lastName}`,
      guestId: s.guest.id,
      roomCode: s.room.code,
      roomId: s.room.id,
      arrival: s.actualArrival.toISOString(),
      expectedDeparture: s.expectedDeparture.toISOString(),
      nights: nightsBetween(s.actualArrival, s.expectedDeparture),
      status: s.status,
      reservationCode: s.reservation.code,
      invoice: inv
        ? {
            id: inv.id,
            externalId: inv.externalId,
            centralState: inv.centralState,
            status: inv.status,
          }
        : null,
    };
  });

  // Alerts — each links to a concrete record
  const alerts: Array<{
    id: string;
    kind: string;
    severity: "info" | "warning" | "critical";
    title: string;
    href: string;
  }> = [];

  for (const a of arrivalRows) {
    if (!a.roomId) {
      alerts.push({
        id: `no-room-${a.reservationId}`,
        kind: "arrival_without_room",
        severity: "critical",
        title: `Chegada ${a.code} sem quarto atribuído`,
        href: `/reservations?focus=${a.reservationId}`,
      });
    } else if (
      a.housekeepingStatus !== "CLEAN" ||
      a.maintenanceStatus !== "OK" ||
      a.occupancyStatus === "OCCUPIED"
    ) {
      alerts.push({
        id: `not-ready-${a.reservationId}`,
        kind: "room_not_ready",
        severity: "warning",
        title: `Quarto ${a.roomCode} não pronto para ${a.code}`,
        href: `/rooms/operations?roomId=${a.roomId}`,
      });
    }
    if (!a.customerLinked) {
      alerts.push({
        id: `unlinked-${a.reservationId}`,
        kind: "guest_unlinked",
        severity: "warning",
        title: `Hóspede sem cliente SIGESC — ${a.code}`,
        href: a.guestId ? `/guests/${a.guestId}` : `/reservations`,
      });
    }
  }

  const overdue = await prisma.stay.findMany({
    where: {
      institutionId: ctx.institutionId,
      status: { in: ["ACTIVE", "CHECKOUT_PENDING"] },
      expectedDeparture: { lt: day },
      ...stayHotel,
    },
    select: {
      id: true,
      expectedDeparture: true,
      room: { select: { code: true } },
      guest: { select: { firstName: true, lastName: true } },
    },
    take: 50,
  });
  for (const s of overdue) {
    alerts.push({
      id: `overdue-${s.id}`,
      kind: "overdue_departure",
      severity: "critical",
      title: `Partida em atraso — ${s.guest.firstName} ${s.guest.lastName} · ${s.room.code}`,
      href: `/stays/${s.id}`,
    });
  }

  const pendingInspections = await prisma.housekeepingTask.findMany({
    where: {
      hotel: { institutionId: ctx.institutionId },
      ...(hotelId ? { hotelId } : {}),
      status: "INSPECTION_REQUIRED",
    },
    include: { room: { select: { code: true } } },
    take: 30,
  });
  for (const t of pendingInspections) {
    alerts.push({
      id: `inspect-${t.id}`,
      kind: "pending_inspection",
      severity: "warning",
      title: `Inspecção pendente — quarto ${t.room.code}`,
      href: `/housekeeping/operations?taskId=${t.id}`,
    });
  }

  const blockingMaint = await prisma.maintenanceRequest.findMany({
    where: {
      hotel: { institutionId: ctx.institutionId },
      ...(hotelId ? { hotelId } : {}),
      blocksRoom: true,
      status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_PARTS"] },
    },
    include: { room: { select: { code: true } } },
    take: 30,
  });
  for (const m of blockingMaint) {
    alerts.push({
      id: `maint-${m.id}`,
      kind: "blocking_maintenance",
      severity: "warning",
      title: `Manutenção bloqueante — ${m.room?.code ?? m.title}`,
      href: `/maintenance/operations?requestId=${m.id}`,
    });
  }

  if (guestsUnresolved > 0) {
    alerts.push({
      id: "guests-unresolved",
      kind: "unresolved_customer_mappings",
      severity: "info",
      title: `${guestsUnresolved} hóspede(s) com mapeamento de cliente por resolver`,
      href: "/guests?linkedOnly=0",
    });
  }
  if (invoicesRecon > 0) {
    alerts.push({
      id: "invoices-recon",
      kind: "invoice_reconciliation",
      severity: "warning",
      title: `${invoicesRecon} documento(s) financeiro(s) em reconciliação`,
      href: "/integrations/invoices?status=RECONCILIATION_REQUIRED",
    });
  }

  const pendingCheckIns = arrivalRows.filter((a) => !a.stayId).length;
  const pendingCheckOuts = departureRows.length;

  return {
    date: day.toISOString(),
    hotelId: hotelId ?? null,
    metrics: {
      arrivalsToday: arrivalRows.length,
      departuresToday: departureRows.length,
      guestsCurrentlyStaying: currentRows.length,
      readyRooms,
      availableRooms: availableRaw,
      occupiedRooms,
      dirtyRooms,
      cleaningRooms,
      inspectingRooms,
      outOfServiceRooms,
      underMaintenanceRooms,
      pendingCheckIns,
      pendingCheckOuts,
      housekeepingAwaitingAction: hkPending,
      activeMaintenanceRequests: maintOpen,
    },
    roomReadiness: {
      ready: readyRooms,
      dirty: dirtyRooms,
      cleaning: cleaningRooms,
      inspecting: inspectingRooms,
      outOfService: outOfServiceRooms,
      underMaintenance: underMaintenanceRooms,
    },
    arrivals: arrivalRows,
    departures: departureRows,
    currentGuests: currentRows,
    alerts,
  };
}

export async function getRoomOperationsBoard(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters: {
    hotelId?: string;
    floor?: string;
    categoryId?: string;
    occupancyStatus?: string;
    housekeepingStatus?: string;
    maintenanceStatus?: string;
    q?: string;
  } = {},
) {
  const rooms = await prisma.room.findMany({
    where: {
      active: true,
      hotel: { institutionId: ctx.institutionId },
      ...(filters.hotelId ? { hotelId: filters.hotelId } : {}),
      ...(filters.floor ? { floor: filters.floor } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.occupancyStatus
        ? { occupancyStatus: filters.occupancyStatus as never }
        : {}),
      ...(filters.housekeepingStatus
        ? { housekeepingStatus: filters.housekeepingStatus as never }
        : {}),
      ...(filters.maintenanceStatus
        ? { maintenanceStatus: filters.maintenanceStatus as never }
        : {}),
      ...(filters.q?.trim()
        ? {
            OR: [
              { code: { contains: filters.q.trim() } },
              { category: { name: { contains: filters.q.trim() } } },
            ],
          }
        : {}),
    },
    include: {
      category: { select: { id: true, name: true, code: true } },
      hotel: { select: { id: true, name: true, code: true } },
      stays: {
        where: { status: { in: ["ACTIVE", "CHECKOUT_PENDING"] } },
        take: 1,
        include: {
          guest: { select: { id: true, firstName: true, lastName: true } },
          reservation: { select: { id: true, code: true } },
        },
      },
      housekeepingTasks: {
        where: {
          status: {
            in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "INSPECTION_REQUIRED", "REJECTED"],
          },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      maintenanceRequests: {
        where: {
          status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_PARTS"] },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ floor: "asc" }, { code: "asc" }],
    take: 300,
  });

  return rooms.map((room) => {
    const stay = room.stays[0] ?? null;
    const ready =
      room.occupancyStatus === "AVAILABLE" &&
      room.housekeepingStatus === "CLEAN" &&
      room.maintenanceStatus === "OK";
    return {
      id: room.id,
      code: room.code,
      floor: room.floor,
      capacity: room.capacity,
      hotelId: room.hotelId,
      hotelName: room.hotel.name,
      categoryId: room.categoryId,
      categoryName: room.category.name,
      occupancyStatus: room.occupancyStatus,
      housekeepingStatus: room.housekeepingStatus,
      maintenanceStatus: room.maintenanceStatus,
      readyForCheckIn: ready,
      guest: stay
        ? {
            id: stay.guest.id,
            name: `${stay.guest.firstName} ${stay.guest.lastName}`,
          }
        : null,
      stayId: stay?.id ?? null,
      reservationId: stay?.reservation.id ?? null,
      reservationCode: stay?.reservation.code ?? null,
      expectedDeparture: stay?.expectedDeparture.toISOString() ?? null,
      openHousekeepingTaskId: room.housekeepingTasks[0]?.id ?? null,
      openMaintenanceRequestId: room.maintenanceRequests[0]?.id ?? null,
      blocksAllocation:
        room.maintenanceStatus !== "OK" || room.housekeepingStatus !== "CLEAN",
    };
  });
}
