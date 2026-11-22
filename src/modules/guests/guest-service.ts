import type { PrismaClient } from "@prisma/client";
import { assertSameInstitution, type TenantContext } from "@/modules/tenancy/tenant";
import { getCentralCustomer } from "@/modules/sigesc-integration/customers/customers-service";
import {
  assertAggregateScope,
  resolveInstitutionAggregateConnection,
} from "@/modules/sigesc-integration/connection-context";

export function isGuestCustomerLinked(mapping: {
  syncStatus: string;
  externalCustomerId: string | null;
} | null | undefined): boolean {
  return Boolean(
    mapping &&
      mapping.syncStatus === "LINKED" &&
      mapping.externalCustomerId &&
      mapping.externalCustomerId.length > 0,
  );
}

export async function listGuests(
  prisma: PrismaClient,
  ctx: TenantContext,
  query?: { q?: string; take?: number; linkedOnly?: boolean },
) {
  const q = query?.q?.trim();
  return prisma.guest.findMany({
    where: {
      institutionId: ctx.institutionId,
      ...(query?.linkedOnly
        ? {
            customerMapping: {
              syncStatus: "LINKED",
              externalCustomerId: { not: null },
            },
          }
        : {}),
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

export async function assertGuestLinkedForOperations(
  prisma: PrismaClient,
  ctx: TenantContext,
  guestId: string,
) {
  const guest = await getGuest(prisma, ctx, guestId);
  if (!isGuestCustomerLinked(guest.customerMapping)) {
    throw new Error(
      "Guest has no valid SIGESC Central customer association. Resolve the mapping before operational use.",
    );
  }
  return guest;
}

/**
 * Phase 5: Guest creation requires a valid central Customer association.
 * Workflow A — existing centralCustomerId
 * Workflow B — createCustomerFirst payload (handled by callers that create customer then call this)
 */
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
    /** Required — central SIGESC customer id for the connected company */
    centralCustomerId: number | string;
  },
) {
  if (input.centralCustomerId === undefined || input.centralCustomerId === null || input.centralCustomerId === "") {
    throw new Error("centralCustomerId is required — every Guest must be linked to a SIGESC Central customer");
  }

  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "customers");
  const customer = await getCentralCustomer(prisma, ctx, input.centralCustomerId);
  const externalId = String(customer.id);

  const existingLink = await prisma.guestCustomerMapping.findFirst({
    where: {
      institutionId: ctx.institutionId,
      externalCustomerId: externalId,
      syncStatus: "LINKED",
    },
  });
  if (existingLink) {
    throw new Error("This central customer is already associated with a Guest in this institution");
  }

  return prisma.$transaction(async (tx) => {
    const guest = await tx.guest.create({
      data: {
        institutionId: ctx.institutionId,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: input.email?.trim().toLowerCase() || customer.email?.toLowerCase() || null,
        phone: input.phone?.trim() || customer.phone || null,
        country: input.country?.trim() || null,
        notes: input.notes?.trim() || null,
      },
    });

    await tx.guestCustomerMapping.create({
      data: {
        guestId: guest.id,
        institutionId: ctx.institutionId,
        connectionId: resolved.connection.id,
        externalCustomerId: externalId,
        companyId: resolved.companyId,
        syncStatus: "LINKED",
        lastSyncedAt: new Date(),
        lastError: null,
      },
    });

    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "CREATE",
        entityType: "Guest",
        entityId: guest.id,
        metadata: { centralCustomerId: externalId, source: "create_with_customer" },
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

export async function listGuestsNeedingCustomerResolution(
  prisma: PrismaClient,
  ctx: TenantContext,
) {
  return prisma.guest.findMany({
    where: {
      institutionId: ctx.institutionId,
      customerMapping: {
        OR: [
          { syncStatus: "NEEDS_RESOLUTION" },
          { syncStatus: "UNLINKED" },
          { syncStatus: "LINKED", externalCustomerId: null },
        ],
      },
    },
    include: { customerMapping: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 200,
  });
}
