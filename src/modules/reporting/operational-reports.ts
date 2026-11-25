import type { PrismaClient } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { toDateOnlyUtc } from "@/modules/reservations/availability";

export type ReportFilters = {
  hotelId?: string;
  from?: Date;
  to?: Date;
};

const MAX_REPORT_RANGE_DAYS = 366;

function range(filters: ReportFilters) {
  const from = filters.from ? toDateOnlyUtc(filters.from) : toDateOnlyUtc(new Date());
  const toRaw = filters.to ? toDateOnlyUtc(filters.to) : new Date(from);
  if (toRaw < from) {
    throw new Error("Report end date must be on or after start date");
  }
  const spanDays = Math.round((toRaw.getTime() - from.getTime()) / 86_400_000) + 1;
  if (spanDays > MAX_REPORT_RANGE_DAYS) {
    throw new Error(`Report date range cannot exceed ${MAX_REPORT_RANGE_DAYS} days`);
  }
  const toExclusive = new Date(toRaw);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return { from, to: toRaw, toExclusive };
}

/** Escape CSV cell; neutralize formula injection (=, +, -, @, tab). */
export function csvEscape(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
  ];
  return `\uFEFF${lines.join("\n")}\n`;
}

export async function getOccupancyReport(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters: ReportFilters = {},
) {
  const { from, to, toExclusive } = range(filters);
  const hotelScope = filters.hotelId
    ? { hotelId: filters.hotelId, hotel: { institutionId: ctx.institutionId } }
    : { hotel: { institutionId: ctx.institutionId } };

  const [totalRooms, occupiedNow, blockedMaint, dirtyOrInspecting, staysInRange] =
    await Promise.all([
      prisma.room.count({ where: { active: true, ...hotelScope } }),
      prisma.room.count({
        where: { active: true, occupancyStatus: "OCCUPIED", ...hotelScope },
      }),
      prisma.room.count({
        where: {
          active: true,
          maintenanceStatus: { in: ["UNDER_MAINTENANCE", "OUT_OF_SERVICE"] },
          ...hotelScope,
        },
      }),
      prisma.room.count({
        where: {
          active: true,
          housekeepingStatus: { in: ["DIRTY", "CLEANING", "INSPECTING"] },
          ...hotelScope,
        },
      }),
      prisma.stay.findMany({
        where: {
          institutionId: ctx.institutionId,
          ...(filters.hotelId ? { hotelId: filters.hotelId } : {}),
          actualArrival: { lt: toExclusive },
          OR: [
            { actualDeparture: null },
            { actualDeparture: { gt: from } },
            { expectedDeparture: { gt: from } },
          ],
        },
        select: {
          id: true,
          actualArrival: true,
          expectedDeparture: true,
          actualDeparture: true,
          status: true,
        },
        take: 5000,
      }),
    ]);

  // Daily occupied room-nights approximation from stays overlapping each day
  const daily: Array<{ date: string; occupiedStays: number }> = [];
  const cursor = new Date(from);
  while (cursor < toExclusive) {
    const day = new Date(cursor);
    const next = new Date(day);
    next.setUTCDate(next.getUTCDate() + 1);
    const occupiedStays = staysInRange.filter((s) => {
      const end = s.actualDeparture ?? s.expectedDeparture;
      return s.actualArrival < next && end > day;
    }).length;
    daily.push({ date: day.toISOString().slice(0, 10), occupiedStays });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const availableNow = Math.max(
    0,
    totalRooms - occupiedNow - blockedMaint,
  );
  const occupancyPercent =
    totalRooms === 0 ? 0 : Math.round((occupiedNow / totalRooms) * 1000) / 10;

  return {
    formula: {
      occupancyPercent: "occupiedRooms / totalActiveRooms * 100 (point-in-time)",
      availableNow: "total - occupied - maintenance-blocked (not the same as READY)",
      note: "Dirty rooms may still count as available occupancy-wise but are not check-in ready",
    },
    from: from.toISOString(),
    to: to.toISOString(),
    totalRooms,
    occupiedRooms: occupiedNow,
    availableRooms: availableNow,
    blockedMaintenance: blockedMaint,
    dirtyOrInspecting,
    occupancyPercent,
    daily,
  };
}

export async function getReservationsReport(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters: ReportFilters = {},
) {
  const { from, toExclusive } = range(filters);
  const base = {
    institutionId: ctx.institutionId,
    ...(filters.hotelId ? { hotelId: filters.hotelId } : {}),
    createdAt: { gte: from, lt: toExclusive },
  };

  const [confirmed, pending, cancelled, noShow, byStatus] = await Promise.all([
    prisma.reservation.count({ where: { ...base, status: "CONFIRMED" } }),
    prisma.reservation.count({ where: { ...base, status: "PENDING" } }),
    prisma.reservation.count({ where: { ...base, status: "CANCELLED" } }),
    prisma.reservation.count({ where: { ...base, status: "NO_SHOW" } }),
    prisma.reservation.groupBy({
      by: ["status"],
      where: base,
      _count: { _all: true },
    }),
  ]);

  return {
    formula: {
      window: "Reservations created within [from, to] inclusive of from",
      note: "Status counts are creation-window snapshots, not arrival-date cohorts",
    },
    confirmed,
    pending,
    cancelled,
    noShow,
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
  };
}

export async function getStaysReport(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters: ReportFilters = {},
) {
  const { from, toExclusive } = range(filters);
  const hotel = filters.hotelId ? { hotelId: filters.hotelId } : {};

  const [checkIns, checkOuts, active, extensions, earlyDepartures, completed] =
    await Promise.all([
      prisma.checkInRecord.count({
        where: {
          checkedInAt: { gte: from, lt: toExclusive },
          stay: { institutionId: ctx.institutionId, ...hotel },
        },
      }),
      prisma.checkOutRecord.count({
        where: {
          checkedOutAt: { gte: from, lt: toExclusive },
          stay: { institutionId: ctx.institutionId, ...hotel },
        },
      }),
      prisma.stay.count({
        where: {
          institutionId: ctx.institutionId,
          status: { in: ["ACTIVE", "CHECKOUT_PENDING"] },
          ...hotel,
        },
      }),
      prisma.stayDateChange.count({
        where: {
          kind: "EXTENSION",
          createdAt: { gte: from, lt: toExclusive },
          stay: { institutionId: ctx.institutionId, ...hotel },
        },
      }),
      prisma.stayDateChange.count({
        where: {
          kind: "EARLY_DEPARTURE",
          createdAt: { gte: from, lt: toExclusive },
          stay: { institutionId: ctx.institutionId, ...hotel },
        },
      }),
      prisma.stay.findMany({
        where: {
          institutionId: ctx.institutionId,
          status: "COMPLETED",
          actualDeparture: { gte: from, lt: toExclusive },
          ...hotel,
        },
        select: { actualArrival: true, actualDeparture: true },
        take: 5000,
      }),
    ]);

  let avgNights = 0;
  if (completed.length) {
    const total = completed.reduce((sum, s) => {
      if (!s.actualDeparture) return sum;
      const ms = s.actualDeparture.getTime() - s.actualArrival.getTime();
      return sum + Math.max(0, ms / 86_400_000);
    }, 0);
    avgNights = Math.round((total / completed.length) * 10) / 10;
  }

  return {
    formula: {
      averageStayNights: "mean(actualDeparture - actualArrival) for COMPLETED stays departing in window",
    },
    checkIns,
    checkOuts,
    activeStays: active,
    extensions,
    earlyDepartures,
    averageStayNights: avgNights,
    completedInWindow: completed.length,
  };
}

export async function getHousekeepingReport(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters: ReportFilters = {},
) {
  const { from, toExclusive } = range(filters);
  const hotelFilter = {
    hotel: { institutionId: ctx.institutionId },
    ...(filters.hotelId ? { hotelId: filters.hotelId } : {}),
  };

  const tasks = await prisma.housekeepingTask.findMany({
    where: {
      ...hotelFilter,
      createdAt: { gte: from, lt: toExclusive },
    },
    select: {
      status: true,
      startedAt: true,
      completedAt: true,
      inspectedAt: true,
      inspectionResult: true,
      deadlineAt: true,
      createdAt: true,
    },
    take: 5000,
  });

  const completed = tasks.filter((t) => t.status === "COMPLETED");
  const pending = tasks.filter((t) =>
    ["PENDING", "ASSIGNED", "IN_PROGRESS", "INSPECTION_REQUIRED", "REJECTED"].includes(
      t.status,
    ),
  );
  const overdue = pending.filter(
    (t) => t.deadlineAt && t.deadlineAt < new Date(),
  );
  const approved = tasks.filter((t) => t.inspectionResult === "APPROVED").length;
  const rejected = tasks.filter((t) => t.inspectionResult === "REJECTED").length;

  const durations = completed
    .filter((t) => t.startedAt && t.completedAt)
    .map((t) => (t.completedAt!.getTime() - t.startedAt!.getTime()) / 60_000);
  const avgMinutes =
    durations.length === 0
      ? 0
      : Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);

  return {
    formula: {
      averageCleaningMinutes: "mean(completedAt - startedAt) for COMPLETED tasks with both timestamps",
      overdue: "open tasks with deadlineAt < now",
    },
    total: tasks.length,
    completed: completed.length,
    pending: pending.length,
    overdue: overdue.length,
    inspectionsApproved: approved,
    inspectionsRejected: rejected,
    averageCleaningMinutes: avgMinutes,
  };
}

export async function getMaintenanceReport(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters: ReportFilters = {},
) {
  const { from, toExclusive } = range(filters);
  const hotelFilter = {
    hotel: { institutionId: ctx.institutionId },
    ...(filters.hotelId ? { hotelId: filters.hotelId } : {}),
  };

  const requests = await prisma.maintenanceRequest.findMany({
    where: {
      ...hotelFilter,
      createdAt: { gte: from, lt: toExclusive },
    },
    select: {
      status: true,
      blocksRoom: true,
      createdAt: true,
      resolvedAt: true,
      startedAt: true,
    },
    take: 5000,
  });

  const open = requests.filter((r) =>
    ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_PARTS"].includes(r.status),
  );
  const inProgress = requests.filter((r) => r.status === "IN_PROGRESS").length;
  const resolved = requests.filter((r) => r.status === "RESOLVED");
  const blockingOpen = open.filter((r) => r.blocksRoom).length;

  const resolveMs = resolved
    .filter((r) => r.resolvedAt)
    .map((r) => r.resolvedAt!.getTime() - r.createdAt.getTime());
  const avgHours =
    resolveMs.length === 0
      ? 0
      : Math.round((resolveMs.reduce((a, b) => a + b, 0) / resolveMs.length / 3_600_000) * 10) /
        10;

  return {
    formula: {
      averageResolutionHours: "mean(resolvedAt - createdAt) for RESOLVED in window",
    },
    total: requests.length,
    open: open.length,
    inProgress,
    resolved: resolved.length,
    blockingOpen,
    averageResolutionHours: avgHours,
  };
}

export async function getCommerceOpsReport(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters: ReportFilters = {},
) {
  const { from, toExclusive } = range(filters);

  const [charges, invoices, recon] = await Promise.all([
    prisma.stayAccountCharge.findMany({
      where: {
        institutionId: ctx.institutionId,
        createdAt: { gte: from, lt: toExclusive },
        status: { not: "VOIDED" },
        ...(filters.hotelId ? { stay: { hotelId: filters.hotelId } } : {}),
      },
      select: {
        status: true,
        quantity: true,
        unitPrice: true,
        invoiceIntegrationId: true,
      },
      take: 5000,
    }),
    prisma.invoiceIntegration.findMany({
      where: {
        institutionId: ctx.institutionId,
        createdAt: { gte: from, lt: toExclusive },
        ...(filters.hotelId ? { hotelId: filters.hotelId } : {}),
      },
      select: {
        status: true,
        centralState: true,
        centralTotal: true,
        requestedState: true,
      },
      take: 2000,
    }),
    prisma.invoiceIntegration.count({
      where: {
        institutionId: ctx.institutionId,
        status: "RECONCILIATION_REQUIRED",
        ...(filters.hotelId ? { hotelId: filters.hotelId } : {}),
      },
    }),
  ]);

  const operationalTotal = charges.reduce(
    (s, c) => s + Number(c.quantity) * Number(c.unitPrice),
    0,
  );
  const handedOff = charges.filter((c) => c.status === "HANDED_OFF").length;
  const cotacao = invoices.filter(
    (i) => i.requestedState === "Cotação" || i.centralState === "Cotação",
  ).length;
  const proforma = invoices.filter(
    (i) => i.requestedState === "Proforma" || i.centralState === "Proforma",
  ).length;
  const createdCentral = invoices.filter((i) => i.status === "CREATED").length;
  const centralSum = invoices
    .filter((i) => i.centralTotal != null)
    .reduce((s, i) => s + Number(i.centralTotal), 0);

  return {
    formula: {
      operationalTotal: "sum(qty * verified unitPrice) for non-VOIDED stay charges — NOT fiscal revenue",
      centralTotals: "sum of Aggregate centralTotal when present — Cotação/Proforma is not payment received",
    },
    consumptionLines: charges.length,
    operationalTotal: Number(operationalTotal.toFixed(2)),
    handedOffLines: handedOff,
    documentsCreated: invoices.length,
    cotacaoOrQuote: cotacao,
    proforma,
    createdInSigesc: createdCentral,
    reconciliationRequired: recon,
    centralTotalsSum: Number(centralSum.toFixed(2)),
    disclaimer:
      "Operational and Cotação/Proforma figures are not confirmed payments. Publication and settlement occur only in SIGESC central.",
  };
}

export async function getOperationalReportsBundle(
  prisma: PrismaClient,
  ctx: TenantContext,
  filters: ReportFilters = {},
) {
  if (filters.hotelId) {
    const hotel = await prisma.hotel.findFirst({
      where: { id: filters.hotelId, institutionId: ctx.institutionId },
    });
    if (!hotel) throw new Error("Hotel not found");
  }

  const [occupancy, reservations, stays, housekeeping, maintenance, commerce] =
    await Promise.all([
      getOccupancyReport(prisma, ctx, filters),
      getReservationsReport(prisma, ctx, filters),
      getStaysReport(prisma, ctx, filters),
      getHousekeepingReport(prisma, ctx, filters),
      getMaintenanceReport(prisma, ctx, filters),
      getCommerceOpsReport(prisma, ctx, filters),
    ]);

  return { occupancy, reservations, stays, housekeeping, maintenance, commerce };
}
