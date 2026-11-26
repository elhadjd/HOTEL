import type { PrismaClient } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { assertSameInstitution } from "@/modules/tenancy/tenant";
import { getAggregateClient } from "../client";
import {
  assertAggregateScope,
  assertCompanyMatchesConnection,
  resolveInstitutionAggregateConnection,
} from "../connection-context";
import type { AggregateCustomerWriteInput, AggregateCustomersQuery } from "../types";

export async function searchCentralCustomers(
  prisma: PrismaClient,
  ctx: TenantContext,
  query: Omit<AggregateCustomersQuery, "company_id"> = {},
) {
  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "customers");
  const client = getAggregateClient(resolved.connection.host);
  return client.listCustomers(resolved.apiKey, {
    ...query,
    company_id: resolved.companyNumericId,
  });
}

export async function getCentralCustomer(
  prisma: PrismaClient,
  ctx: TenantContext,
  customerId: number | string,
) {
  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "customers");
  const client = getAggregateClient(resolved.connection.host);
  const customer = await client.getCustomer(resolved.apiKey, customerId, {
    company_id: resolved.companyNumericId,
  });
  assertCompanyMatchesConnection(resolved, customer.company_id);
  return customer;
}

export async function createCentralCustomer(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: Omit<AggregateCustomerWriteInput, "company_id" | "customer">,
) {
  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "customers");
  const client = getAggregateClient(resolved.connection.host);
  const result = await client.createCustomer(resolved.apiKey, {
    ...input,
    company_id: resolved.companyNumericId,
  });
  assertCompanyMatchesConnection(resolved, result.customer.company_id);

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "CREATE",
      entityType: "CentralCustomer",
      entityId: String(result.customer.id),
      metadata: {
        companyId: resolved.companyId,
        name: result.customer.name,
      },
    },
  });

  return result;
}

export async function updateCentralCustomer(
  prisma: PrismaClient,
  ctx: TenantContext,
  customerId: number | string,
  input: Omit<AggregateCustomerWriteInput, "company_id" | "customer">,
) {
  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "customers");
  // Verify ownership first
  await getCentralCustomer(prisma, ctx, customerId);
  const client = getAggregateClient(resolved.connection.host);
  // Never send company_id as ownership transfer — docs say it is ignored, we omit it.
  const result = await client.updateCustomer(resolved.apiKey, customerId, input);

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "UPDATE",
      entityType: "CentralCustomer",
      entityId: String(customerId),
      metadata: { fields: Object.keys(input) },
    },
  });

  return result;
}

export async function linkGuestToCentralCustomer(
  prisma: PrismaClient,
  ctx: TenantContext,
  guestId: string,
  centralCustomerId: number | string,
) {
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    include: { customerMapping: true },
  });
  if (!guest) throw new Error("Guest not found");
  assertSameInstitution(ctx, guest.institutionId);

  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "customers");
  const customer = await getCentralCustomer(prisma, ctx, centralCustomerId);

  const externalId = String(customer.id);

  const existingLink = await prisma.guestCustomerMapping.findFirst({
    where: {
      institutionId: ctx.institutionId,
      externalCustomerId: externalId,
      NOT: { guestId },
    },
  });
  if (existingLink) {
    throw new Error("This central customer is already linked to another guest in this institution");
  }

  const mapping = await prisma.guestCustomerMapping.upsert({
    where: { guestId },
    create: {
      guestId,
      institutionId: ctx.institutionId,
      connectionId: resolved.connection.id,
      externalCustomerId: externalId,
      companyId: resolved.companyId,
      syncStatus: "LINKED",
      lastSyncedAt: new Date(),
      lastError: null,
    },
    update: {
      connectionId: resolved.connection.id,
      externalCustomerId: externalId,
      companyId: resolved.companyId,
      syncStatus: "LINKED",
      lastSyncedAt: new Date(),
      lastError: null,
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "UPDATE",
      entityType: "GuestCustomerMapping",
      entityId: mapping.id,
      metadata: {
        guestId,
        centralCustomerId: externalId,
        action: "link",
      },
    },
  });

  return mapping;
}

export async function createCentralCustomerFromGuest(
  prisma: PrismaClient,
  ctx: TenantContext,
  guestId: string,
  opts?: { forceCreate?: boolean },
) {
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    include: { customerMapping: true, documents: true },
  });
  if (!guest) throw new Error("Guest not found");
  assertSameInstitution(ctx, guest.institutionId);

  if (guest.customerMapping?.syncStatus === "LINKED" && guest.customerMapping.externalCustomerId) {
    throw new Error("Guest is already linked to a central customer");
  }

  const nif =
    guest.nif ??
    guest.documents.find((d) => /nif|tax/i.test(d.type))?.reference ??
    guest.documents[0]?.reference ??
    null;

  // Search for possible matches before create (unless force)
  if (!opts?.forceCreate) {
    const terms = [guest.email, guest.phone, nif].filter(Boolean) as string[];
    for (const term of terms) {
      const found = await searchCentralCustomers(prisma, ctx, { search: term, per_page: 5 });
      if ((found.data?.length ?? 0) > 0) {
        return {
          needsConfirmation: true as const,
          candidates: found.data ?? [],
          guest,
        };
      }
    }
  }

  const result = await createCentralCustomer(prisma, ctx, {
    name: guest.firstName,
    surname: guest.lastName,
    customer_type: guest.customerType || "individual",
    email: guest.email,
    phone: guest.phone,
    nif,
    address: guest.address,
    city: guest.city,
    province: guest.province,
    birth_date: guest.birthDate ? guest.birthDate.toISOString().slice(0, 10) : null,
    sex: guest.gender,
  });

  const mapping = await linkGuestToCentralCustomer(prisma, ctx, guestId, result.customer.id);
  return { needsConfirmation: false as const, customer: result.customer, mapping };
}

/**
 * Phase 5: Guests must not be left unlinked.
 * Re-associate to another valid central customer instead of clearing the mapping.
 */
export async function reassociateGuestToCentralCustomer(
  prisma: PrismaClient,
  ctx: TenantContext,
  guestId: string,
  newCentralCustomerId: number | string,
) {
  return linkGuestToCentralCustomer(prisma, ctx, guestId, newCentralCustomerId);
}

/** @deprecated Phase 5 — unlinking leaves Guests invalid; use reassociateGuestToCentralCustomer */
export async function unlinkGuestFromCentralCustomer(
  ..._args: [PrismaClient, TenantContext, string]
): Promise<never> {
  void _args;
  throw new Error(
    "Unlinking a Guest from its SIGESC Central customer is not allowed. Re-associate to another valid customer instead.",
  );
}
