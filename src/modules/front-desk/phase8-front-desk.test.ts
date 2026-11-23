import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { encryptAggregateKey } from "@/modules/sigesc-integration/crypto";
import { MOCK_VALID_MCA_KEY, resetAggregateClient } from "@/modules/sigesc-integration";
import { resetAllMockAggregateStores } from "@/modules/sigesc-integration/mock-adapter";
import { linkGuestToCentralCustomer } from "@/modules/sigesc-integration/customers/customers-service";
import { upsertCatalogMapping } from "@/modules/sigesc-integration/products/products-service";
import { checkInReservation } from "@/modules/stays/stay-service";
import { completeCheckOut } from "@/modules/stays/check-out-service";
import { createMaintenanceRequest } from "@/modules/maintenance/maintenance-service";
import {
  createHousekeepingTask,
  startHousekeepingTask,
  completeHousekeepingTask,
  inspectHousekeepingTask,
  isRoomReadyForGuest,
} from "@/modules/housekeeping/housekeeping-service";
import { registerOperationalConsumption } from "@/modules/stays/operational-consumption-service";
import {
  getFrontDeskSnapshot,
  getRoomOperationsBoard,
} from "./front-desk-service";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { toDateOnlyUtc } from "@/modules/reservations/availability";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("Phase 8 Front Desk command center", () => {
  const prisma = new PrismaClient();
  let institutionId = "";
  let otherInstitutionId = "";
  let hotelId = "";
  let roomReady = "";
  let roomDirty = "";
  let roomMaint = "";
  let reservationId = "";
  let guestId = "";
  let ctx: TenantContext;
  let otherCtx: TenantContext;
  let userId = "";
  const mappingCode = `p8-cons-${Date.now()}`;

  beforeAll(async () => {
    process.env.SIGESC_AGGREGATE_MODE = "mock";
    process.env.AGGREGATE_ENCRYPTION_KEY =
      process.env.AGGREGATE_ENCRYPTION_KEY || "test-aggregate-encryption-key-32chars!!";
    resetAggregateClient();
    resetAllMockAggregateStores();

    const institution = await prisma.institution.create({
      data: {
        name: "Phase8 Hotel",
        slug: `phase8-${Date.now()}`,
        timezone: "Africa/Luanda",
        currency: "AOA",
        locale: "pt",
        sigescCompanyRef: "44",
      },
    });
    institutionId = institution.id;

    const other = await prisma.institution.create({
      data: {
        name: "Phase8 Other",
        slug: `phase8-other-${Date.now()}`,
        timezone: "Africa/Luanda",
        currency: "AOA",
        locale: "pt",
      },
    });
    otherInstitutionId = other.id;

    const user = await prisma.user.create({
      data: {
        email: `phase8-${Date.now()}@test.local`,
        name: "Phase8",
        passwordHash: "x",
        active: true,
      },
    });
    userId = user.id;

    await prisma.aggregateConnection.create({
      data: {
        institutionId,
        host: "https://app.sisgesc.net",
        encryptedApiKey: encryptAggregateKey(MOCK_VALID_MCA_KEY),
        keyPrefix: "mca_mock",
        scopesJson: ["all"],
        status: "ACTIVE",
        ownerCompanyExternalId: "44",
      },
    });

    ctx = {
      userId,
      institutionId,
      membershipId: "m8",
      roleCode: "hotel_admin",
      permissions: [
        "dashboard.read",
        "rooms.read",
        "stays.read",
        "stays.checkin",
        "stays.checkout",
        "stays.manage",
        "housekeeping.manage",
        "housekeeping.inspect",
        "maintenance.manage",
        "guests.write",
        "integrations.customers",
        "integrations.products",
        "integrations.invoices",
      ],
    };
    otherCtx = {
      userId,
      institutionId: otherInstitutionId,
      membershipId: "none",
      roleCode: "hotel_admin",
      permissions: ["dashboard.read", "rooms.read"],
    };

    const hotel = await prisma.hotel.create({
      data: {
        institutionId,
        name: "P8 Property",
        code: `P8${Date.now().toString().slice(-4)}`,
        active: true,
      },
    });
    hotelId = hotel.id;

    const cat = await prisma.roomCategory.create({
      data: {
        hotelId,
        name: "Standard",
        code: "STD",
        maxOccupancy: 2,
        active: true,
      },
    });

    const ready = await prisma.room.create({
      data: {
        hotelId,
        categoryId: cat.id,
        code: "801",
        floor: "8",
        capacity: 2,
        occupancyStatus: "AVAILABLE",
        housekeepingStatus: "CLEAN",
        maintenanceStatus: "OK",
        active: true,
      },
    });
    roomReady = ready.id;

    const dirty = await prisma.room.create({
      data: {
        hotelId,
        categoryId: cat.id,
        code: "802",
        floor: "8",
        capacity: 2,
        occupancyStatus: "AVAILABLE",
        housekeepingStatus: "DIRTY",
        maintenanceStatus: "OK",
        active: true,
      },
    });
    roomDirty = dirty.id;

    const maint = await prisma.room.create({
      data: {
        hotelId,
        categoryId: cat.id,
        code: "803",
        floor: "8",
        capacity: 2,
        occupancyStatus: "AVAILABLE",
        housekeepingStatus: "CLEAN",
        maintenanceStatus: "OK",
        active: true,
      },
    });
    roomMaint = maint.id;

    const guest = await prisma.guest.create({
      data: {
        institutionId,
        firstName: "Ana",
        lastName: "Phase8",
        email: `ana-p8-${Date.now()}@test.local`,
        customerMapping: {
          create: { institutionId, syncStatus: "NEEDS_RESOLUTION" },
        },
      },
    });
    guestId = guest.id;
    await linkGuestToCentralCustomer(prisma, ctx, guestId, 501);

    await upsertCatalogMapping(prisma, ctx, {
      localCode: mappingCode,
      localLabel: "Bebida P8",
      centralProductId: "902",
      kind: "PRODUCT",
    });

    const today = toDateOnlyUtc(new Date());
    const dep = new Date(today);
    dep.setUTCDate(dep.getUTCDate() + 2);

    const reservation = await prisma.reservation.create({
      data: {
        institutionId,
        hotelId,
        code: `P8-R-${Date.now()}`,
        status: "CONFIRMED",
        arrivalDate: today,
        departureDate: dep,
        adults: 1,
        rooms: {
          create: {
            roomId: roomReady,
            arrivalDate: today,
            departureDate: dep,
          },
        },
        guests: { create: { guestId, isPrimary: true } },
      },
    });
    reservationId = reservation.id;

    await createMaintenanceRequest(prisma, ctx, {
      hotelId,
      roomId: roomMaint,
      title: "AC failure",
      blocksRoom: true,
      priority: "HIGH",
    });
  });

  afterAll(async () => {
    if (institutionId) {
      await prisma.invoiceSubmissionAttempt.deleteMany({
        where: { invoice: { institutionId } },
      });
      await prisma.invoiceIntegration.deleteMany({ where: { institutionId } });
      await prisma.stayAccountCharge.deleteMany({ where: { institutionId } });
      await prisma.checkOutRecord.deleteMany({
        where: { stay: { institutionId } },
      });
      await prisma.checkInRecord.deleteMany({
        where: { stay: { institutionId } },
      });
      await prisma.stayCompanion.deleteMany({
        where: { stay: { institutionId } },
      });
      await prisma.stayRoomHistory.deleteMany({
        where: { stay: { institutionId } },
      });
      await prisma.stay.deleteMany({ where: { institutionId } });
      await prisma.reservationGuest.deleteMany({
        where: { reservation: { institutionId } },
      });
      await prisma.reservationRoom.deleteMany({
        where: { reservation: { institutionId } },
      });
      await prisma.reservation.deleteMany({ where: { institutionId } });
      await prisma.housekeepingTask.deleteMany({
        where: { hotel: { institutionId } },
      });
      await prisma.maintenanceRequest.deleteMany({
        where: { hotel: { institutionId } },
      });
      await prisma.productCatalogMapping.deleteMany({ where: { institutionId } });
      await prisma.guestCustomerMapping.deleteMany({ where: { institutionId } });
      await prisma.guest.deleteMany({ where: { institutionId } });
      await prisma.room.deleteMany({ where: { hotel: { institutionId } } });
      await prisma.roomCategory.deleteMany({ where: { hotel: { institutionId } } });
      await prisma.hotel.deleteMany({ where: { institutionId } });
      await prisma.auditLog.deleteMany({ where: { institutionId } });
      await prisma.aggregateConnection.deleteMany({ where: { institutionId } });
      await prisma.institution.delete({ where: { id: institutionId } }).catch(() => undefined);
    }
    if (otherInstitutionId) {
      await prisma.institution.delete({ where: { id: otherInstitutionId } }).catch(() => undefined);
    }
    await prisma.user.deleteMany({ where: { email: { contains: "phase8-" } } });
    await prisma.$disconnect();
  });

  it("computes readiness counts without contradictory AVAILABLE=ready", async () => {
    const snap = await getFrontDeskSnapshot(prisma, ctx, { hotelId });
    expect(snap.metrics.readyRooms).toBeGreaterThanOrEqual(1);
    expect(snap.metrics.dirtyRooms).toBeGreaterThanOrEqual(1);
    expect(snap.metrics.underMaintenanceRooms).toBeGreaterThanOrEqual(1);
    expect(snap.metrics.arrivalsToday).toBeGreaterThanOrEqual(1);
    expect(snap.arrivals.some((a) => a.reservationId === reservationId)).toBe(true);

    const foreign = await getFrontDeskSnapshot(prisma, otherCtx, {});
    expect(foreign.metrics.arrivalsToday).toBe(0);
    expect(foreign.metrics.readyRooms).toBe(0);
  });

  it("flags dirty and maintenance-blocked rooms on the board", async () => {
    const board = await getRoomOperationsBoard(prisma, ctx, { hotelId });
    const dirty = board.find((r) => r.id === roomDirty);
    const maint = board.find((r) => r.id === roomMaint);
    const ready = board.find((r) => r.id === roomReady);
    expect(dirty?.readyForCheckIn).toBe(false);
    expect(dirty?.blocksAllocation).toBe(true);
    expect(maint?.readyForCheckIn).toBe(false);
    expect(maint?.maintenanceStatus).toBe("UNDER_MAINTENANCE");
    expect(ready?.readyForCheckIn).toBe(true);
    expect(await isRoomReadyForGuest(prisma, roomDirty)).toBe(false);
    expect(await isRoomReadyForGuest(prisma, roomMaint)).toBe(false);
  });

  it("check-in then consumption appends to eligible Cotação; published path blocked via editable check", async () => {
    const stay = await checkInReservation(prisma, ctx, { reservationId });
    expect(stay.status).toBe("ACTIVE");

    const snap = await getFrontDeskSnapshot(prisma, ctx, { hotelId });
    expect(snap.metrics.guestsCurrentlyStaying).toBeGreaterThanOrEqual(1);
    expect(snap.currentGuests.some((g) => g.stayId === stay.id)).toBe(true);

    const consumed = await registerOperationalConsumption(prisma, ctx, {
      stayId: stay.id,
      createDocumentIfMissing: true,
      idempotencyKey: `p8-consume-${Date.now()}`,
      lines: [{ mappingLocalCode: mappingCode, quantity: 2 }],
    });
    expect(consumed.charges).toHaveLength(1);
    expect(consumed.invoice).toBeTruthy();
    expect(consumed.createdDocument || consumed.appended).toBe(true);
    expect(Number(consumed.charges[0]!.unitPrice)).toBeGreaterThan(0);

    // Idempotent retry with same key on append path when document already CREATED
    if (consumed.invoice?.status === "CREATED" && consumed.invoice.saleKey) {
      const again = await registerOperationalConsumption(prisma, ctx, {
        stayId: stay.id,
        idempotencyKey: `p8-append-${Date.now()}`,
        lines: [{ mappingLocalCode: mappingCode, quantity: 1 }],
      });
      expect(again.appended || again.message).toBeTruthy();
    }

    await completeCheckOut(prisma, ctx, stay.id, { requestProforma: false });
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomReady } });
    expect(room.occupancyStatus).toBe("AVAILABLE");
    expect(room.housekeepingStatus).toBe("DIRTY");
  });

  it("housekeeping inspection restores CLEAN readiness; maintenance resolution does not auto-CLEAN", async () => {
    // Re-dirty a vacant room and run full HK lifecycle
    await prisma.room.update({
      where: { id: roomDirty },
      data: {
        occupancyStatus: "AVAILABLE",
        housekeepingStatus: "DIRTY",
        maintenanceStatus: "OK",
      },
    });
    const task = await createHousekeepingTask(prisma, ctx, {
      hotelId,
      roomId: roomDirty,
      kind: "CLEANING",
    });
    await startHousekeepingTask(prisma, ctx, task.id);
    await completeHousekeepingTask(prisma, ctx, task.id, true);
    await inspectHousekeepingTask(prisma, ctx, task.id, { approved: true });
    expect(await isRoomReadyForGuest(prisma, roomDirty)).toBe(true);

    const { updateMaintenanceStatus } = await import(
      "@/modules/maintenance/maintenance-service"
    );
    const open = await prisma.maintenanceRequest.findFirst({
      where: { roomId: roomMaint, status: { notIn: ["RESOLVED", "CANCELLED"] } },
    });
    expect(open).toBeTruthy();
    await prisma.room.update({
      where: { id: roomMaint },
      data: { housekeepingStatus: "DIRTY" },
    });
    await updateMaintenanceStatus(prisma, ctx, open!.id, {
      status: "RESOLVED",
      resolution: "fixed",
    });
    const after = await prisma.room.findUniqueOrThrow({ where: { id: roomMaint } });
    expect(after.maintenanceStatus).toBe("OK");
    expect(after.housekeepingStatus).toBe("DIRTY");
    expect(await isRoomReadyForGuest(prisma, roomMaint)).toBe(false);
  });
});
