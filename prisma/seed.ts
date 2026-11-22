import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { ensureInstitutionRoles } from "../src/modules/iam/ensure-roles";

const prisma = new PrismaClient();

async function main() {
  const institution = await prisma.institution.upsert({
    where: { slug: "demo-baia" },
    create: {
      name: "Hotel Baía Demo",
      slug: "demo-baia",
      timezone: "Africa/Luanda",
      currency: "AOA",
      locale: "pt",
      city: "Luanda",
      country: "Angola",
      active: true,
    },
    update: {},
  });

  const roles = await ensureInstitutionRoles(prisma, institution.id);

  const passwordHash = await hash("HotelariaDemo1!", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@hotelaria.demo" },
    create: {
      email: "admin@hotelaria.demo",
      name: "Admin Demo",
      passwordHash,
      active: true,
    },
    update: { passwordHash },
  });

  await prisma.membership.upsert({
    where: {
      institutionId_userId: { institutionId: institution.id, userId: admin.id },
    },
    create: {
      institutionId: institution.id,
      userId: admin.id,
      roleId: roles.hotel_admin!,
      status: "ACTIVE",
    },
    update: {
      roleId: roles.hotel_admin!,
      status: "ACTIVE",
    },
  });

  const hotel = await prisma.hotel.upsert({
    where: {
      institutionId_code: { institutionId: institution.id, code: "BAIA" },
    },
    create: {
      institutionId: institution.id,
      name: "Hotel Baía Atlântica",
      code: "BAIA",
      city: "Luanda",
      country: "Angola",
      active: true,
    },
    update: {},
  });

  await prisma.hotelSettings.upsert({
    where: { hotelId: hotel.id },
    create: {
      hotelId: hotel.id,
      checkInTime: "14:00",
      checkOutTime: "12:00",
      timezone: "Africa/Luanda",
      currency: "AOA",
      locale: "pt",
    },
    update: {},
  });

  const category = await prisma.roomCategory.upsert({
    where: { hotelId_code: { hotelId: hotel.id, code: "STD" } },
    create: {
      hotelId: hotel.id,
      name: "Standard",
      code: "STD",
      maxOccupancy: 2,
      maxAdults: 2,
      maxChildren: 1,
      defaultTariff: 45000,
      active: true,
    },
    update: {},
  });

  const rooms = [
    { code: "101", floor: "1", occupancyStatus: "AVAILABLE" as const, housekeepingStatus: "CLEAN" as const },
    { code: "102", floor: "1", occupancyStatus: "OCCUPIED" as const, housekeepingStatus: "DIRTY" as const },
    { code: "201", floor: "2", occupancyStatus: "RESERVED" as const, housekeepingStatus: "CLEAN" as const },
    { code: "202", floor: "2", occupancyStatus: "AVAILABLE" as const, housekeepingStatus: "CLEANING" as const },
    {
      code: "301",
      floor: "3",
      occupancyStatus: "AVAILABLE" as const,
      housekeepingStatus: "CLEAN" as const,
      maintenanceStatus: "UNDER_MAINTENANCE" as const,
    },
  ];

  const roomRecords: Record<string, string> = {};
  for (const room of rooms) {
    const row = await prisma.room.upsert({
      where: { hotelId_code: { hotelId: hotel.id, code: room.code } },
      create: {
        hotelId: hotel.id,
        categoryId: category.id,
        code: room.code,
        floor: room.floor,
        capacity: 2,
        occupancyStatus: room.occupancyStatus,
        housekeepingStatus: room.housekeepingStatus,
        maintenanceStatus: room.maintenanceStatus ?? "OK",
        active: true,
      },
      update: {
        occupancyStatus: room.occupancyStatus,
        housekeepingStatus: room.housekeepingStatus,
        maintenanceStatus: room.maintenanceStatus ?? "OK",
      },
    });
    roomRecords[room.code] = row.id;
  }

  // Demo guest — operational profile only; SIGESC financial mapping stays UNLINKED
  const guest = await prisma.guest.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      institutionId: institution.id,
      firstName: "Ana",
      lastName: "Dos Santos",
      email: "ana.santos@example.ao",
      phone: "+244923111222",
      country: "Angola",
    },
    update: {
      firstName: "Ana",
      lastName: "Dos Santos",
      email: "ana.santos@example.ao",
      phone: "+244923111222",
    },
  });

  await prisma.guestCustomerMapping.upsert({
    where: { guestId: guest.id },
    create: {
      guestId: guest.id,
      institutionId: institution.id,
      syncStatus: "UNLINKED",
    },
    update: { syncStatus: "UNLINKED" },
  });

  const arrival = new Date(Date.UTC(2026, 11, 10));
  const departure = new Date(Date.UTC(2026, 11, 14));
  const reservedRoomId = roomRecords["201"]!;

  const reservation = await prisma.reservation.upsert({
    where: { hotelId_code: { hotelId: hotel.id, code: "RSV-DEMO01" } },
    create: {
      hotelId: hotel.id,
      institutionId: institution.id,
      code: "RSV-DEMO01",
      status: "CONFIRMED",
      arrivalDate: arrival,
      departureDate: departure,
      adults: 2,
      children: 0,
      source: "seed",
      rooms: {
        create: [
          {
            roomId: reservedRoomId,
            arrivalDate: arrival,
            departureDate: departure,
          },
        ],
      },
      guests: {
        create: [{ guestId: guest.id, isPrimary: true }],
      },
      events: {
        create: {
          fromStatus: null,
          toStatus: "CONFIRMED",
          note: "Seed demo reservation",
          actorUserId: admin.id,
        },
      },
    },
    update: {
      status: "CONFIRMED",
      arrivalDate: arrival,
      departureDate: departure,
    },
  });

  console.log("Seed complete:", {
    institution: institution.slug,
    hotel: hotel.code,
    admin: admin.email,
    guest: guest.email,
    reservation: reservation.code,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
