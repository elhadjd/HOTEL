import type { PrismaClient } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { createGuest, isGuestCustomerLinked } from "@/modules/guests/guest-service";
import { getCentralCustomer } from "../customers/customers-service";
import {
  assertAggregateScope,
  resolveInstitutionAggregateConnection,
} from "../connection-context";
import { AggregateApiError } from "../types";

/** Maximum customers per bulk convert request */
export const MAX_CUSTOMER_TO_GUEST_BATCH = 50;

export type ConversionOutcome =
  | "converted"
  | "already_associated"
  | "invalid_customer"
  | "foreign_company"
  | "insufficient_data"
  | "aggregate_unavailable"
  | "duplicate_in_batch"
  | "failed";

export type ConversionResult = {
  centralCustomerId: string;
  outcome: ConversionOutcome;
  guestId?: string;
  message?: string;
};

function splitCustomerName(customer: {
  name: string;
  surname?: string | null;
  full_name?: string | null;
}): { firstName: string; lastName: string } {
  if (customer.surname && customer.surname.trim()) {
    return { firstName: customer.name.trim(), lastName: customer.surname.trim() };
  }
  const full = (customer.full_name || customer.name || "").trim();
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "—" };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

/**
 * Convert one central customer into an operational Hotelaria Guest.
 * Idempotent: if already associated, returns existing guest.
 */
export async function convertCustomerToGuest(
  prisma: PrismaClient,
  ctx: TenantContext,
  centralCustomerId: number | string,
): Promise<ConversionResult> {
  const idStr = String(centralCustomerId);

  try {
    const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
    assertAggregateScope(resolved, "customers");

    const existing = await prisma.guestCustomerMapping.findFirst({
      where: {
        institutionId: ctx.institutionId,
        externalCustomerId: idStr,
        syncStatus: "LINKED",
      },
    });
    if (existing) {
      return {
        centralCustomerId: idStr,
        outcome: "already_associated",
        guestId: existing.guestId,
        message: "Customer already associated with a Guest",
      };
    }

    let customer;
    try {
      customer = await getCentralCustomer(prisma, ctx, centralCustomerId);
    } catch (err) {
      if (err instanceof AggregateApiError && err.status === 404) {
        return {
          centralCustomerId: idStr,
          outcome: "invalid_customer",
          message: "Customer not found for this company",
        };
      }
      if (err instanceof AggregateApiError && (err.status === 503 || err.status === 504)) {
        return {
          centralCustomerId: idStr,
          outcome: "aggregate_unavailable",
          message: err.message,
        };
      }
      throw err;
    }

    if (String(customer.company_id) !== String(resolved.companyId)) {
      return {
        centralCustomerId: idStr,
        outcome: "foreign_company",
        message: "Customer does not belong to the connected SIGESC company",
      };
    }

    const { firstName, lastName } = splitCustomerName(customer);
    if (!firstName.trim()) {
      return {
        centralCustomerId: idStr,
        outcome: "insufficient_data",
        message: "Customer name is insufficient to create a Guest profile",
      };
    }

    // Re-check uniqueness under race (transaction inside createGuest also helps)
    const race = await prisma.guestCustomerMapping.findFirst({
      where: {
        institutionId: ctx.institutionId,
        externalCustomerId: idStr,
        syncStatus: "LINKED",
      },
    });
    if (race) {
      return {
        centralCustomerId: idStr,
        outcome: "already_associated",
        guestId: race.guestId,
      };
    }

    const guest = await createGuest(prisma, ctx, {
      firstName,
      lastName,
      email: customer.email ?? undefined,
      phone: customer.phone ?? undefined,
      centralCustomerId: customer.id,
    });

    await prisma.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "CREATE",
        entityType: "GuestFromCustomer",
        entityId: guest.id,
        metadata: { centralCustomerId: idStr },
      },
    });

    return {
      centralCustomerId: idStr,
      outcome: "converted",
      guestId: guest.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Conversion failed";
    if (/already associated/i.test(message)) {
      const mapping = await prisma.guestCustomerMapping.findFirst({
        where: {
          institutionId: ctx.institutionId,
          externalCustomerId: idStr,
          syncStatus: "LINKED",
        },
      });
      return {
        centralCustomerId: idStr,
        outcome: "already_associated",
        guestId: mapping?.guestId,
        message,
      };
    }
    return {
      centralCustomerId: idStr,
      outcome: "failed",
      message,
    };
  }
}

/**
 * Bulk convert — independent per-customer transactions.
 * Failures do not roll back successful siblings.
 */
export async function bulkConvertCustomersToGuests(
  prisma: PrismaClient,
  ctx: TenantContext,
  centralCustomerIds: Array<number | string>,
): Promise<{
  results: ConversionResult[];
  summary: Record<ConversionOutcome, number>;
}> {
  if (!centralCustomerIds.length) {
    throw new Error("At least one customer must be selected");
  }
  if (centralCustomerIds.length > MAX_CUSTOMER_TO_GUEST_BATCH) {
    throw new Error(
      `Batch size exceeds maximum of ${MAX_CUSTOMER_TO_GUEST_BATCH} customers`,
    );
  }

  const seen = new Set<string>();
  const results: ConversionResult[] = [];

  for (const rawId of centralCustomerIds) {
    const idStr = String(rawId);
    if (seen.has(idStr)) {
      results.push({
        centralCustomerId: idStr,
        outcome: "duplicate_in_batch",
        message: "Duplicate id in request",
      });
      continue;
    }
    seen.add(idStr);
    results.push(await convertCustomerToGuest(prisma, ctx, rawId));
  }

  const summary: Record<ConversionOutcome, number> = {
    converted: 0,
    already_associated: 0,
    invalid_customer: 0,
    foreign_company: 0,
    insufficient_data: 0,
    aggregate_unavailable: 0,
    duplicate_in_batch: 0,
    failed: 0,
  };
  for (const r of results) summary[r.outcome] += 1;

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "CREATE",
      entityType: "BulkCustomerToGuest",
      entityId: ctx.institutionId,
      metadata: { count: results.length, summary },
    },
  });

  return { results, summary };
}

export async function findGuestForCentralCustomer(
  prisma: PrismaClient,
  ctx: TenantContext,
  centralCustomerId: string,
) {
  const mapping = await prisma.guestCustomerMapping.findFirst({
    where: {
      institutionId: ctx.institutionId,
      externalCustomerId: centralCustomerId,
      syncStatus: "LINKED",
    },
    include: { guest: true },
  });
  if (!mapping || !isGuestCustomerLinked(mapping)) return null;
  return mapping.guest;
}
