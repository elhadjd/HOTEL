import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { encryptAggregateKey } from "@/modules/sigesc-integration/crypto";
import { MOCK_VALID_MCA_KEY, resetAggregateClient } from "@/modules/sigesc-integration";
import { resetAllMockAggregateStores } from "@/modules/sigesc-integration/mock-adapter";
import { createGuest } from "@/modules/guests/guest-service";
import { checkInReservation, transferStayRoom, extendStay } from "./stay-service";
import { completeCheckOut } from "./check-out-service";
import {
  createHousekeepingTask,
  startHousekeepingTask,
  completeHousekeepingTask,
  inspectHousekeepingTask,
} from "@/modules/housekeeping/housekeeping-service";
import { createMaintenanceRequest } from "@/modules/maintenance/maintenance-service";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { toDateOnlyUtc } from "@/modules/reservations/availability";

const hasDb = Boolean(process.env.DATABASE_URL?.startsWith("mysql"));

describe.runIf(hasDb)("Phase 6 stay lifecycle (MySQL)", () => {
  const prisma = new PrismaClient();
  let institutionId = "";
  let hotelId = "";
  let roomA = "";
  let roomB = "";
  let reservationId = "";
  let guestId = "";
  let companionId = "";
  let ctx: TenantContext;
  let userId = "";

  beforeAll(async () => {
    process.env.SIGESC_AGGREGATE_MODE = "mock";
    process.env.AGGREGATE_ENCRYPTION_KEY =
      process.env.AGGREGATE_ENCRYPTION_KEY || "test-aggregate-encryption-key-32chars!!";
    resetAggregateClient();
    resetAllMockAggregateStores();

    const institution = await prisma.institution.create({
      data: {
        name: "Phase6 Hotel",
        slug: `phase6-${Date.now()}`,
        timezone: "Africa/Luanda",
        currency: "AOA",
        locale: "pt",
        sigescCompanyRef: "44",
      },
    });
    institutionId = institution.id;

    const user = await prisma.user.create({
      data: {
        email: `phase6-${Date.now()}@test.local`,
        name: "Phase6",
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
      membershipId: "m",
      roleCode: "hotel_admin",
      permissions: [
        "stays.read",
        "stays.checkin",
        "stays.checkout",
        "stays.manage",
        "stays.transfer_room",
        "stays.extend",
        "housekeeping.manage",
        "housekeeping.inspect",
        "maintenance.manage",
        "guests.write",
        "integrations.customers",
        "integrations.products",
        "integrations.invoices",
      ],
    };

    const hotel = await prisma.hotel.create({
      data: {
        institutionId,
        name: "P6 Property",
        code: `P6${Date.now().toString().slice(-4)}`,
        active: true,
      },
    });
    hotelId = hotel.id;

    const cat = await prisma.roomCategory.create({
      data: {
        hotelId,
        name: "Standard",
        code: "STD",
        maxOccupancy: 3,
        active: true,
      },
    });

    const a = await prisma.room.create({
      data: {
        hotelId,
        categoryId: cat.id,
        code: "101",
        capacity: 3,
        occupancyStatus: "AVAILABLE",
        housekeepingStatus: "CLEAN",
        maintenanceStatus: "OK",
        active: true,
      },
    });
    const b = await prisma.room.create({
      data: {
        hotelId,
        categoryId: cat.id,
        code: "102",
        capacity: 3,
        occupancyStatus: "AVAILABLE",
        housekeepingStatus: "CLEAN",
        maintenanceStatus: "OK",
        active: true,
      },
    });
    roomA = a.id;
    roomB = b.id;

    const guest = await createGuest(prisma, ctx, {
      firstName: "Ana",
      lastName: "Primary",
      centralCustomerId: 501,
    });
    guestId = guest.id;

    const companion = await createGuest(prisma, ctx, {
      firstName: "Bruno",
      lastName: "Companion",
      centralCustomerId: 502,
    });
    companionId = companion.id;

    const arrival = toDateOnlyUtc(new Date());
    const departure = new Date(arrival);
    departure.setUTCDate(departure.getUTCDate() + 3);

    const reservation = await prisma.reservation.create({
      data: {
        hotelId,
        institutionId,
        code: `RSV-P6-${Date.now().toString().slice(-6)}`,
        status: "CONFIRMED",
        arrivalDate: arrival,
        departureDate: departure,
        adults: 2,
        rooms: {
          create: {
            roomId: roomA,
            arrivalDate: arrival,
            departureDate: departure,
          },
        },
        guests: {
          create: { guestId, isPrimary: true },
        },
      },
    });
    reservationId = reservation.id;
  });

  afterAll(async () => {
    if (institutionId) {
      await prisma.checkOutRecord.deleteMany({ where: { stay: { institutionId } } });
      await prisma.checkInRecord.deleteMany({ where: { stay: { institutionId } } });
      await prisma.stayCompanion.deleteMany({ where: { stay: { institutionId } } });
      await prisma.stayRoomHistory.deleteMany({ where: { stay: { institutionId } } });
      await prisma.stayDateChange.deleteMany({ where: { stay: { institutionId } } });
      await prisma.stayAccountCharge.deleteMany({ where: { institutionId } });
      await prisma.stay.deleteMany({ where: { institutionId } });
      await prisma.housekeepingTask.deleteMany({ where: { hotel: { institutionId } } });
      await prisma.maintenanceRequest.deleteMany({ where: { hotel: { institutionId } } });
      await prisma.reservationEvent.deleteMany({ where: { reservation: { institutionId } } });
      await prisma.reservationGuest.deleteMany({ where: { reservation: { institutionId } } });
      await prisma.reservationRoom.deleteMany({ where: { reservation: { institutionId } } });
      await prisma.reservation.deleteMany({ where: { institutionId } });
      await prisma.guestCustomerMapping.deleteMany({ where: { institutionId } });
      await prisma.guest.deleteMany({ where: { institutionId } });
      await prisma.room.deleteMany({ where: { hotel: { institutionId } } });
      await prisma.roomCategory.deleteMany({ where: { hotel: { institutionId } } });
      await prisma.hotel.deleteMany({ where: { institutionId } });
      await prisma.auditLog.deleteMany({ where: { institutionId } });
      await prisma.aggregateConnection.deleteMany({ where: { institutionId } });
      await prisma.institution.delete({ where: { id: institutionId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it("rejects check-in when room is under maintenance block", async () => {
    await prisma.room.update({
      where: { id: roomA },
      data: { maintenanceStatus: "UNDER_MAINTENANCE" },
    });
    await expect(
      checkInReservation(prisma, ctx, { reservationId }),
    ).rejects.toThrow(/maintenance/i);
    await prisma.room.update({
      where: { id: roomA },
      data: { maintenanceStatus: "OK", housekeepingStatus: "CLEAN" },
    });
  });

  it("checks in with companion, transfers, extends, and checks out", async () => {
    const stay = await checkInReservation(prisma, ctx, {
      reservationId,
      companionGuestIds: [companionId],
    });
    expect(stay.status).toBe("ACTIVE");
    expect(stay.companions.length).toBe(1);

    await expect(
      checkInReservation(prisma, ctx, { reservationId }),
    ).rejects.toThrow(/already|duplicate|eligible/i);

    const transferred = await transferStayRoom(prisma, ctx, stay.id, {
      toRoomId: roomB,
      reason: "Preferência do hóspede",
    });
    expect(transferred.roomId).toBe(roomB);

    const fromRoom = await prisma.room.findUniqueOrThrow({ where: { id: roomA } });
    expect(fromRoom.housekeepingStatus).toBe("DIRTY");
    expect(fromRoom.occupancyStatus).toBe("AVAILABLE");

    const hk = await prisma.housekeepingTask.findFirst({
      where: { roomId: roomA, kind: "TURNOVER" },
    });
    expect(hk).toBeTruthy();

    const newDep = toDateOnlyUtc(stay.expectedDeparture);
    newDep.setUTCDate(newDep.getUTCDate() + 2);
    const extended = await extendStay(prisma, ctx, stay.id, {
      newDeparture: newDep,
      reason: "Ficar mais noites",
    });
    expect(toDateOnlyUtc(extended.expectedDeparture).getTime()).toBe(newDep.getTime());

    const out = await completeCheckOut(prisma, ctx, stay.id, {
      requestProforma: false,
      notes: "Saída operacional",
    });
    expect(out.stay.status).toBe("COMPLETED");
    expect(out.stay.checkOut).toBeTruthy();

    const roomAfter = await prisma.room.findUniqueOrThrow({ where: { id: roomB } });
    expect(roomAfter.occupancyStatus).toBe("AVAILABLE");
    expect(roomAfter.housekeepingStatus).toBe("DIRTY");

    await expect(
      completeCheckOut(prisma, ctx, stay.id, { requestProforma: false }),
    ).rejects.toThrow(/already|duplicate|cannot/i);
  });

  it("housekeeping inspection makes room CLEAN; maintenance blocks assignment", async () => {
    const task = await createHousekeepingTask(prisma, ctx, {
      hotelId,
      roomId: roomB,
      kind: "CLEANING",
      priority: "HIGH",
    });
    await startHousekeepingTask(prisma, ctx, task.id);
    await completeHousekeepingTask(prisma, ctx, task.id, true);
    await inspectHousekeepingTask(prisma, ctx, task.id, { approved: true });
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomB } });
    expect(room.housekeepingStatus).toBe("CLEAN");

    await createMaintenanceRequest(prisma, ctx, {
      hotelId,
      roomId: roomB,
      title: "AC failure",
      blocksRoom: true,
      priority: "HIGH",
    });
    const blocked = await prisma.room.findUniqueOrThrow({ where: { id: roomB } });
    expect(blocked.maintenanceStatus).toBe("UNDER_MAINTENANCE");
  });
});
