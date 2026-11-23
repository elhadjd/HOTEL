import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import {
  addSeasonalRate,
  createRatePlan,
  quoteAccommodation,
  updateRatePlan,
} from "./rates-service";
import {
  completeHousekeepingTask,
  createHousekeepingTask,
  inspectHousekeepingTask,
  reopenHousekeepingTask,
  startHousekeepingTask,
} from "@/modules/housekeeping/housekeeping-service";
import {
  createMaintenanceRequest,
  reopenMaintenanceRequest,
  updateMaintenanceStatus,
} from "@/modules/maintenance/maintenance-service";
import { getOperationalReportsBundle, toCsv } from "@/modules/reporting/operational-reports";
import { createReservation } from "@/modules/reservations/reservation-service";
import { toDateOnlyUtc } from "@/modules/reservations/availability";

const hasDb = Boolean(process.env.DATABASE_URL?.startsWith("mysql"));

describe.runIf(hasDb)("Phase 8.1 rates / HK / maintenance / reports (MySQL)", () => {
  const prisma = new PrismaClient();
  let institutionId = "";
  let hotelId = "";
  let categoryId = "";
  let roomId = "";
  let userId = "";
  let ctx: TenantContext;
  let otherCtx: TenantContext;
  let otherInstitutionId = "";

  beforeAll(async () => {
    const stamp = Date.now();
    const institution = await prisma.institution.create({
      data: {
        name: "P81 Hotel",
        slug: `p81-${stamp}`,
        timezone: "Africa/Luanda",
        currency: "AOA",
        locale: "pt",
      },
    });
    institutionId = institution.id;

    const other = await prisma.institution.create({
      data: {
        name: "P81 Other",
        slug: `p81-o-${stamp}`,
        timezone: "Africa/Luanda",
        currency: "AOA",
        locale: "pt",
      },
    });
    otherInstitutionId = other.id;

    const user = await prisma.user.create({
      data: {
        email: `p81-${stamp}@test.local`,
        name: "P81",
        passwordHash: "x",
        active: true,
      },
    });
    userId = user.id;

    ctx = {
      userId,
      institutionId,
      membershipId: "m",
      roleCode: "hotel_admin",
      permissions: [
        "rates.read",
        "rates.write",
        "reports.read",
        "housekeeping.manage",
        "housekeeping.inspect",
        "maintenance.manage",
        "maintenance.resolve",
        "reservations.write",
        "reservations.read",
      ],
    };
    otherCtx = { ...ctx, institutionId: otherInstitutionId };

    const hotel = await prisma.hotel.create({
      data: {
        institutionId,
        name: "P81 Property",
        code: `P81-${stamp}`,
      },
    });
    hotelId = hotel.id;

    const category = await prisma.roomCategory.create({
      data: {
        hotelId,
        name: "Standard",
        code: "STD",
        maxOccupancy: 3,
      },
    });
    categoryId = category.id;

    const room = await prisma.room.create({
      data: {
        hotelId,
        categoryId,
        code: "101",
        floor: "1",
        housekeepingStatus: "CLEAN",
        occupancyStatus: "AVAILABLE",
        maintenanceStatus: "OK",
        active: true,
      },
    });
    roomId = room.id;
  });

  afterAll(async () => {
    if (institutionId) {
      await prisma.ratePlanAudit.deleteMany({
        where: { ratePlan: { hotel: { institutionId } } },
      });
      await prisma.seasonalRate.deleteMany({
        where: { ratePlan: { hotel: { institutionId } } },
      });
      await prisma.ratePlan.deleteMany({ where: { hotel: { institutionId } } });
      await prisma.housekeepingTask.deleteMany({ where: { hotel: { institutionId } } });
      await prisma.maintenanceRequest.deleteMany({ where: { hotel: { institutionId } } });
      await prisma.reservationRoom.deleteMany({
        where: { reservation: { institutionId } },
      });
      await prisma.reservationEvent.deleteMany({
        where: { reservation: { institutionId } },
      });
      await prisma.reservation.deleteMany({ where: { institutionId } });
      await prisma.room.deleteMany({ where: { hotel: { institutionId } } });
      await prisma.roomCategory.deleteMany({ where: { hotel: { institutionId } } });
      await prisma.hotel.deleteMany({ where: { institutionId } });
      await prisma.auditLog.deleteMany({ where: { institutionId } });
      await prisma.institution.delete({ where: { id: institutionId } }).catch(() => undefined);
    }
    if (otherInstitutionId) {
      await prisma.institution.delete({ where: { id: otherInstitutionId } }).catch(() => undefined);
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("creates, deactivates rate plans and rejects negative amounts", async () => {
    await expect(
      createRatePlan(prisma, ctx, {
        hotelId,
        categoryId,
        name: "Bad",
        code: "BAD",
        baseAmount: -10,
      }),
    ).rejects.toThrow(/non-negative/i);

    const plan = await createRatePlan(prisma, ctx, {
      hotelId,
      categoryId,
      name: "Rack",
      code: "RACK",
      baseAmount: 100,
      priority: 1,
      includedOccupancy: 2,
      extraGuestAmount: 25,
    });
    expect(Number(plan.baseAmount)).toBe(100);

    const off = await updateRatePlan(prisma, ctx, plan.id, { active: false });
    expect(off.active).toBe(false);
    await updateRatePlan(prisma, ctx, plan.id, { active: true });
  });

  it("rejects overlapping seasonal windows and applies seasonal quote", async () => {
    const plan = await createRatePlan(prisma, ctx, {
      hotelId,
      categoryId,
      name: "Seasonal Base",
      code: `SEA-${Date.now()}`,
      baseAmount: 80,
      priority: 5,
    });

    await addSeasonalRate(prisma, ctx, plan.id, {
      name: "Natal",
      startDate: "2026-12-20",
      endDate: "2026-12-27",
      amount: 150,
    });

    await expect(
      addSeasonalRate(prisma, ctx, plan.id, {
        name: "Overlap",
        startDate: "2026-12-24",
        endDate: "2026-12-30",
        amount: 200,
      }),
    ).rejects.toThrow(/overlap/i);

    const quote = await quoteAccommodation(prisma, ctx, {
      hotelId,
      categoryId,
      arrivalDate: "2026-12-24",
      departureDate: "2026-12-26",
      occupants: 2,
    });
    expect(quote.nights[0]?.source).toBe("seasonal");
    expect(quote.nights[0]?.amount).toBe(150);
    expect(quote.subtotal).toBe(300);
  });

  it("isolates rate plans across tenants", async () => {
    await expect(
      createRatePlan(prisma, otherCtx, {
        hotelId,
        categoryId,
        name: "Hack",
        code: "HACK",
        baseAmount: 1,
      }),
    ).rejects.toThrow();
  });

  it("applies server-side rates on reservation create", async () => {
    await createRatePlan(prisma, ctx, {
      hotelId,
      categoryId,
      name: "Res Rate",
      code: `RR-${Date.now()}`,
      baseAmount: 120,
      priority: 10,
    });
    const arrival = toDateOnlyUtc("2027-01-10");
    const departure = toDateOnlyUtc("2027-01-12");
    const reservation = await createReservation(prisma, ctx, {
      hotelId,
      arrivalDate: arrival,
      departureDate: departure,
      roomIds: [roomId],
      status: "PENDING",
    });
    expect(reservation.operationalTotal != null).toBe(true);
    expect(Number(reservation.operationalTotal)).toBe(240);
    expect(Number(reservation.rooms[0]?.nightlyRate)).toBe(120);
  });

  it("housekeeping inspect reject requires reason; complete without inspection sets CLEAN", async () => {
    await prisma.room.update({
      where: { id: roomId },
      data: { housekeepingStatus: "DIRTY", occupancyStatus: "AVAILABLE" },
    });

    const task = await createHousekeepingTask(prisma, ctx, {
      hotelId,
      roomId,
      kind: "CLEANING",
    });
    await startHousekeepingTask(prisma, ctx, task.id);
    await completeHousekeepingTask(prisma, ctx, task.id, true);

    await expect(
      inspectHousekeepingTask(prisma, ctx, task.id, { approved: false }),
    ).rejects.toThrow(/reason/i);

    await inspectHousekeepingTask(prisma, ctx, task.id, {
      approved: false,
      notes: "Bath not cleaned",
    });
    let room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    expect(room.housekeepingStatus).toBe("DIRTY");

    await reopenHousekeepingTask(prisma, ctx, task.id);
    await startHousekeepingTask(prisma, ctx, task.id);
    await completeHousekeepingTask(prisma, ctx, task.id, false);
    room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    expect(room.housekeepingStatus).toBe("CLEAN");
  });

  it("maintenance resolve requires resolution and does not set CLEAN; reopen re-blocks", async () => {
    await prisma.room.update({
      where: { id: roomId },
      data: { housekeepingStatus: "CLEAN", maintenanceStatus: "OK" },
    });

    const req = await createMaintenanceRequest(prisma, ctx, {
      hotelId,
      roomId,
      title: "Leak",
      blocksRoom: true,
      priority: "HIGH",
    });
    let room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    expect(room.maintenanceStatus).toBe("UNDER_MAINTENANCE");
    expect(room.housekeepingStatus).toBe("CLEAN");

    await expect(
      updateMaintenanceStatus(prisma, ctx, req.id, { status: "RESOLVED" }),
    ).rejects.toThrow(/resolution/i);

    await updateMaintenanceStatus(prisma, ctx, req.id, {
      status: "RESOLVED",
      resolution: "Pipe replaced",
    });
    room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    expect(room.maintenanceStatus).toBe("OK");
    expect(room.housekeepingStatus).toBe("CLEAN");

    await reopenMaintenanceRequest(prisma, ctx, req.id, "Leak returned");
    room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    expect(room.maintenanceStatus).toBe("UNDER_MAINTENANCE");
  });

  it("reports return real aggregates and CSV is formula-safe", async () => {
    const bundle = await getOperationalReportsBundle(prisma, ctx, {
      hotelId,
      from: toDateOnlyUtc("2026-01-01"),
      to: toDateOnlyUtc("2027-12-31"),
    });
    expect(bundle.occupancy.totalRooms).toBeGreaterThanOrEqual(1);
    expect(bundle.maintenance.open + bundle.maintenance.resolved).toBeGreaterThanOrEqual(1);
    const csv = toCsv(["m", "v"], [["=1+1", bundle.occupancy.occupancyPercent]]);
    expect(csv).toContain("'=1+1");
  });
});
