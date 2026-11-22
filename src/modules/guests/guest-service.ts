import type { PrismaClient } from "@prisma/client";
import { assertSameInstitution, type TenantContext } from "@/modules/tenancy/tenant";

export async function listGuests(
  prisma: PrismaClient,
  ctx: TenantContext,
  query?: { q?: string; take?: number },
) {
  const q = query?.q?.trim();
  return prisma.guest.findMany({
    where: {
      institutionId: ctx.institutionId,
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    include: { customerMapping: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: Math.min(query?.take ?? 100, 200),
  });
}

export async function getGuest(prisma: PrismaClient, ctx: TenantContext, guestId: string) {
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    include: {
      customerMapping: true,
      documents: true,
      reservationGuests: {
        include: {
          reservation: {
            select: {
              id: true,
              code: true,
              status: true,
              arrivalDate: true,
              departureDate: true,
            },
          },
        },
        take: 20,
      },
    },
  });
  if (!guest) throw new Error("Guest not found");
  assertSameInstitution(ctx, guest.institutionId);
  return guest;
}

export async function createGuest(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    country?: string;
    notes?: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const guest = await tx.guest.create({
      data: {
        institutionId: ctx.institutionId,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: input.email?.trim().toLowerCase() || null,
        phone: input.phone?.trim() || null,
        country: input.country?.trim() || null,
        notes: input.notes?.trim() || null,
      },
    });

    // Local guest remains usable offline — mapping starts UNLINKED
    await tx.guestCustomerMapping.create({
      data: {
        guestId: guest.id,
        institutionId: ctx.institutionId,
        syncStatus: "UNLINKED",
      },
    });

    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "CREATE",
        entityType: "Guest",
        entityId: guest.id,
      },
    });

    return tx.guest.findUniqueOrThrow({
      where: { id: guest.id },
      include: { customerMapping: true },
    });
  });
}

export async function updateGuest(
  prisma: PrismaClient,
  ctx: TenantContext,
  guestId: string,
  input: Partial<{
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    country: string | null;
    notes: string | null;
  }>,
) {
  await getGuest(prisma, ctx, guestId);
  return prisma.guest.update({
    where: { id: guestId },
    data: {
      firstName: input.firstName?.trim(),
      lastName: input.lastName?.trim(),
      email: input.email === undefined ? undefined : input.email?.trim().toLowerCase() || null,
      phone: input.phone === undefined ? undefined : input.phone?.trim() || null,
      country: input.country === undefined ? undefined : input.country?.trim() || null,
      notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
    },
    include: { customerMapping: true },
  });
}
