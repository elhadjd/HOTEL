import type { PrismaClient } from "@prisma/client";
import { assertSameInstitution, type TenantContext } from "@/modules/tenancy/tenant";
import { getCentralCustomer } from "@/modules/sigesc-integration/customers/customers-service";
import {
  assertAggregateScope,
  resolveInstitutionAggregateConnection,
} from "@/modules/sigesc-integration/connection-context";

export type GuestDocumentInput = {
  type: string;
  reference: string;
  issuingCountry?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
};

export type GuestProfileFields = {
  salutation?: string | null;
  firstName: string;
  lastName: string;
  customerType?: string | null;
  companyName?: string | null;
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  secondaryPhone?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  nationality?: string | null;
  preferredLanguage?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
  vipTier?: string | null;
  dietaryRestrictions?: string | null;
  roomPreferences?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  marketingOptIn?: boolean;
  notes?: string | null;
  document?: GuestDocumentInput | null;
};

function parseOptionalDate(value?: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed.length === 10 ? `${trimmed}T00:00:00.000Z` : trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function cleanStr(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isGuestCustomerLinked(
  mapping:
    | {
        syncStatus: string;
        externalCustomerId: string | null;
      }
    | null
    | undefined,
): boolean {
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
              // MySQL: case-insensitive collation (utf8mb4_unicode_ci) — no Prisma `mode: insensitive`
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { email: { contains: q } },
              { phone: { contains: q } },
              { nif: { contains: q } },
              { companyName: { contains: q } },
              { city: { contains: q } },
              { nationality: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      customerMapping: true,
      documents: {
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: Math.min(query?.take ?? 100, 200),
  });
}

export async function getGuest(prisma: PrismaClient, ctx: TenantContext, guestId: string) {
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    include: {
      customerMapping: true,
      documents: { orderBy: { createdAt: "desc" } },
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
      "Guest has no valid central customer association. Resolve the mapping before operational use.",
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
  input: GuestProfileFields & {
    /** Required — central customer id for the connected company */
    centralCustomerId: number | string;
  },
) {
  if (
    input.centralCustomerId === undefined ||
    input.centralCustomerId === null ||
    input.centralCustomerId === ""
  ) {
    throw new Error(
      "centralCustomerId is required — every Guest must be linked to a central customer",
    );
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
        salutation: cleanStr(input.salutation),
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        customerType: cleanStr(input.customerType) ?? customer.customer_type ?? "individual",
        companyName: cleanStr(input.companyName),
        nif: cleanStr(input.nif) ?? cleanStr(customer.nif),
        email: cleanStr(input.email)?.toLowerCase() ?? customer.email?.toLowerCase() ?? null,
        phone: cleanStr(input.phone) ?? cleanStr(customer.phone),
        secondaryPhone: cleanStr(input.secondaryPhone),
        birthDate: parseOptionalDate(input.birthDate ?? customer.birth_date),
        gender: cleanStr(input.gender) ?? cleanStr(customer.sex),
        nationality: cleanStr(input.nationality),
        preferredLanguage: cleanStr(input.preferredLanguage),
        address: cleanStr(input.address) ?? cleanStr(customer.address),
        city: cleanStr(input.city) ?? cleanStr(customer.city),
        province: cleanStr(input.province) ?? cleanStr(customer.province),
        postalCode: cleanStr(input.postalCode),
        country: cleanStr(input.country) ?? cleanStr(customer.country?.name),
        vipTier: cleanStr(input.vipTier) ?? "STANDARD",
        dietaryRestrictions: cleanStr(input.dietaryRestrictions),
        roomPreferences: cleanStr(input.roomPreferences),
        emergencyContactName: cleanStr(input.emergencyContactName),
        emergencyContactPhone: cleanStr(input.emergencyContactPhone),
        marketingOptIn: Boolean(input.marketingOptIn),
        notes: cleanStr(input.notes),
      },
    });

    if (input.document && input.document.reference.trim()) {
      await tx.guestDocument.create({
        data: {
          guestId: guest.id,
          type: input.document.type.trim() || "BI",
          reference: input.document.reference.trim(),
          issuingCountry: cleanStr(input.document.issuingCountry),
          issuedAt: parseOptionalDate(input.document.issuedAt),
          expiresAt: parseOptionalDate(input.document.expiresAt),
        },
      });
    }

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
      include: { customerMapping: true, documents: { orderBy: { createdAt: "desc" } } },
    });
  });
}

export async function updateGuest(
  prisma: PrismaClient,
  ctx: TenantContext,
  guestId: string,
  input: Partial<GuestProfileFields>,
) {
  const existing = await getGuest(prisma, ctx, guestId);

  return prisma.$transaction(async (tx) => {
    await tx.guest.update({
      where: { id: guestId },
      data: {
        ...(input.salutation !== undefined ? { salutation: cleanStr(input.salutation) } : {}),
        ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
        ...(input.customerType !== undefined
          ? { customerType: cleanStr(input.customerType) ?? "individual" }
          : {}),
        ...(input.companyName !== undefined ? { companyName: cleanStr(input.companyName) } : {}),
        ...(input.nif !== undefined ? { nif: cleanStr(input.nif) } : {}),
        ...(input.email !== undefined
          ? { email: cleanStr(input.email)?.toLowerCase() ?? null }
          : {}),
        ...(input.phone !== undefined ? { phone: cleanStr(input.phone) } : {}),
        ...(input.secondaryPhone !== undefined
          ? { secondaryPhone: cleanStr(input.secondaryPhone) }
          : {}),
        ...(input.birthDate !== undefined ? { birthDate: parseOptionalDate(input.birthDate) } : {}),
        ...(input.gender !== undefined ? { gender: cleanStr(input.gender) } : {}),
        ...(input.nationality !== undefined ? { nationality: cleanStr(input.nationality) } : {}),
        ...(input.preferredLanguage !== undefined
          ? { preferredLanguage: cleanStr(input.preferredLanguage) }
          : {}),
        ...(input.address !== undefined ? { address: cleanStr(input.address) } : {}),
        ...(input.city !== undefined ? { city: cleanStr(input.city) } : {}),
        ...(input.province !== undefined ? { province: cleanStr(input.province) } : {}),
        ...(input.postalCode !== undefined ? { postalCode: cleanStr(input.postalCode) } : {}),
        ...(input.country !== undefined ? { country: cleanStr(input.country) } : {}),
        ...(input.vipTier !== undefined ? { vipTier: cleanStr(input.vipTier) ?? "STANDARD" } : {}),
        ...(input.dietaryRestrictions !== undefined
          ? { dietaryRestrictions: cleanStr(input.dietaryRestrictions) }
          : {}),
        ...(input.roomPreferences !== undefined
          ? { roomPreferences: cleanStr(input.roomPreferences) }
          : {}),
        ...(input.emergencyContactName !== undefined
          ? { emergencyContactName: cleanStr(input.emergencyContactName) }
          : {}),
        ...(input.emergencyContactPhone !== undefined
          ? { emergencyContactPhone: cleanStr(input.emergencyContactPhone) }
          : {}),
        ...(input.marketingOptIn !== undefined ? { marketingOptIn: input.marketingOptIn } : {}),
        ...(input.notes !== undefined ? { notes: cleanStr(input.notes) } : {}),
      },
    });

    if (input.document !== undefined) {
      const latestDoc = existing.documents[0];
      if (input.document && input.document.reference.trim()) {
        if (latestDoc) {
          await tx.guestDocument.update({
            where: { id: latestDoc.id },
            data: {
              type: input.document.type.trim() || "BI",
              reference: input.document.reference.trim(),
              issuingCountry: cleanStr(input.document.issuingCountry),
              issuedAt: parseOptionalDate(input.document.issuedAt),
              expiresAt: parseOptionalDate(input.document.expiresAt),
            },
          });
        } else {
          await tx.guestDocument.create({
            data: {
              guestId,
              type: input.document.type.trim() || "BI",
              reference: input.document.reference.trim(),
              issuingCountry: cleanStr(input.document.issuingCountry),
              issuedAt: parseOptionalDate(input.document.issuedAt),
              expiresAt: parseOptionalDate(input.document.expiresAt),
            },
          });
        }
      }
    }

    await tx.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "Guest",
        entityId: guestId,
        metadata: { fields: Object.keys(input) },
      },
    });

    return tx.guest.findUniqueOrThrow({
      where: { id: guestId },
      include: { customerMapping: true, documents: { orderBy: { createdAt: "desc" } } },
    });
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
    include: { customerMapping: true, documents: { orderBy: { createdAt: "desc" }, take: 2 } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 200,
  });
}
