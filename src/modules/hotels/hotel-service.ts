import type { PrismaClient } from "@prisma/client";
import { assertSameInstitution, type TenantContext } from "@/modules/tenancy/tenant";
import { slugify } from "@/shared/utils";

export async function listHotels(prisma: PrismaClient, ctx: TenantContext) {
  return prisma.hotel.findMany({
    where: { institutionId: ctx.institutionId },
    include: { settings: true, _count: { select: { rooms: true, roomCategories: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getHotel(prisma: PrismaClient, ctx: TenantContext, hotelId: string) {
  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    include: { settings: true },
  });
  if (!hotel) throw new Error("Hotel not found");
  assertSameInstitution(ctx, hotel.institutionId);
  return hotel;
}

export async function createHotel(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: {
    name: string;
    code?: string;
    description?: string;
    email?: string;
    phone?: string;
    street?: string;
    city?: string;
    country?: string;
    zipCode?: string;
    checkInTime?: string;
    checkOutTime?: string;
    timezone?: string;
    currency?: string;
    locale?: string;
  },
) {
  const code = (input.code?.trim() || slugify(input.name).slice(0, 12).toUpperCase() || "HTL").slice(
    0,
    64,
  );

  return prisma.$transaction(async (tx) => {
    const hotel = await tx.hotel.create({
      data: {
        institutionId: ctx.institutionId,
        name: input.name.trim(),
        code,
        description: input.description ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        street: input.street ?? null,
        city: input.city ?? null,
        country: input.country ?? null,
        zipCode: input.zipCode ?? null,
        active: true,
      },
    });

    await tx.hotelSettings.create({
      data: {
        hotelId: hotel.id,
        checkInTime: input.checkInTime ?? "14:00",
        checkOutTime: input.checkOutTime ?? "12:00",
        timezone: input.timezone ?? "Africa/Luanda",
        currency: (input.currency ?? "AOA").slice(0, 3),
        locale: input.locale ?? "pt",
      },
    });

    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "CREATE",
        entityType: "Hotel",
        entityId: hotel.id,
        metadata: { code: hotel.code },
      },
    });

    return tx.hotel.findUniqueOrThrow({
      where: { id: hotel.id },
      include: { settings: true },
    });
  });
}

export async function updateHotel(
  prisma: PrismaClient,
  ctx: TenantContext,
  hotelId: string,
  input: Partial<{
    name: string;
    description: string | null;
    email: string | null;
    phone: string | null;
    street: string | null;
    city: string | null;
    country: string | null;
    zipCode: string | null;
    active: boolean;
    checkInTime: string;
    checkOutTime: string;
    timezone: string;
    currency: string;
    locale: string;
  }>,
) {
  await getHotel(prisma, ctx, hotelId);

  return prisma.$transaction(async (tx) => {
    const hotel = await tx.hotel.update({
      where: { id: hotelId },
      data: {
        name: input.name?.trim(),
        description: input.description,
        email: input.email,
        phone: input.phone,
        street: input.street,
        city: input.city,
        country: input.country,
        zipCode: input.zipCode,
        active: input.active,
      },
    });

    if (
      input.checkInTime ||
      input.checkOutTime ||
      input.timezone ||
      input.currency ||
      input.locale
    ) {
      await tx.hotelSettings.update({
        where: { hotelId },
        data: {
          checkInTime: input.checkInTime,
          checkOutTime: input.checkOutTime,
          timezone: input.timezone,
          currency: input.currency?.slice(0, 3),
          locale: input.locale,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "Hotel",
        entityId: hotel.id,
      },
    });

    return tx.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      include: { settings: true },
    });
  });
}
