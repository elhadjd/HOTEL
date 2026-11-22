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

  for (const room of rooms) {
    await prisma.room.upsert({
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
  }

  console.log("Seed complete:", {
    institution: institution.slug,
    hotel: hotel.code,
    admin: admin.email,
    password: "HotelariaDemo1!",
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
