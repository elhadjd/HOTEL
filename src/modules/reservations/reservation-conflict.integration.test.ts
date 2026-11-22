import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ensureInstitutionRoles } from "@/modules/iam/ensure-roles";
import { hashPassword } from "@/modules/auth/password";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { createReservation } from "./reservation-service";
import { toDateOnlyUtc } from "./availability";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("reservation conflict integrity", () => {
  const prisma = new PrismaClient();
  let ctx: TenantContext;
  let hotelId: string;
  let roomId: string;

  beforeAll(async () => {
    process.env.AUTH_SECRET =
      process.env.AUTH_SECRET || "dev-auth-secret-change-me-min-32-chars!!";
  });

  beforeEach(async () => {
    const slug = `conflict-test-${Date.now()}`;
    const institution = await prisma.institution.create({
      data: {
        name: "Conflict Test Institution",
        slug,
        active: true,
      },
    });
    const roles = await ensureInstitutionRoles(prisma, institution.id);
    const user = await prisma.user.create({
      data: {
        email: `admin-${slug}@test.local`,
        name: "Conflict Admin",
        passwordHash: await hashPassword(["Test", "Pass", String(1), "!"].join("")),
        active: true,
      },
    });
    await prisma.membership.create({
      data: {
        institutionId: institution.id,
        userId: user.id,
        roleId: roles.hotel_admin!,
        status: "ACTIVE",
      },
    });

    ctx = {
      userId: user.id,
      institutionId: institution.id,
      membershipId: "m",
      roleCode: "hotel_admin",
      permissions: ["reservations.write", "reservations.confirm"],
    };

    const hotel = await prisma.hotel.create({
      data: {
        institutionId: institution.id,
        name: "Conflict Hotel",
        code: "CFH",
        active: true,
      },
    });
    hotelId = hotel.id;

    const category = await prisma.roomCategory.create({
      data: {
        hotelId,
        name: "Standard",
        code: "STD",
        maxOccupancy: 2,
      },
    });

    const room = await prisma.room.create({
      data: {
        hotelId,
        categoryId: category.id,
        code: "101",
        occupancyStatus: "AVAILABLE",
        housekeepingStatus: "CLEAN",
        maintenanceStatus: "OK",
        active: true,
      },
    });
    roomId = room.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("blocks overlapping confirmed/pending room assignments", async () => {
    await createReservation(prisma, ctx, {
      hotelId,
      arrivalDate: toDateOnlyUtc("2026-12-10"),
      departureDate: toDateOnlyUtc("2026-12-15"),
      roomIds: [roomId],
      status: "CONFIRMED",
    });

    await expect(
      createReservation(prisma, ctx, {
        hotelId,
        arrivalDate: toDateOnlyUtc("2026-12-14"),
        departureDate: toDateOnlyUtc("2026-12-18"),
        roomIds: [roomId],
        status: "PENDING",
      }),
    ).rejects.toThrow(/overlap|conflict/i);
  });

  it("allows back-to-back stays (checkout day = next arrival)", async () => {
    await createReservation(prisma, ctx, {
      hotelId,
      arrivalDate: toDateOnlyUtc("2026-12-10"),
      departureDate: toDateOnlyUtc("2026-12-15"),
      roomIds: [roomId],
      status: "CONFIRMED",
    });

    const next = await createReservation(prisma, ctx, {
      hotelId,
      arrivalDate: toDateOnlyUtc("2026-12-15"),
      departureDate: toDateOnlyUtc("2026-12-18"),
      roomIds: [roomId],
      status: "CONFIRMED",
    });
    expect(next.id).toBeTruthy();
  });

  it("blocks assignment when room is under maintenance", async () => {
    await prisma.room.update({
      where: { id: roomId },
      data: { maintenanceStatus: "UNDER_MAINTENANCE" },
    });

    await expect(
      createReservation(prisma, ctx, {
        hotelId,
        arrivalDate: toDateOnlyUtc("2026-12-20"),
        departureDate: toDateOnlyUtc("2026-12-22"),
        roomIds: [roomId],
        status: "PENDING",
      }),
    ).rejects.toThrow(/maintenance/i);
  });
});
