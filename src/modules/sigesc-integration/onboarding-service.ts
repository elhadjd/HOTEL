import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { ensureInstitutionRoles } from "@/modules/iam/ensure-roles";
import { DEFAULT_AGGREGATE_IMPORT_ROLE } from "@/modules/iam/permissions";
import { slugify } from "@/shared/utils";
import { getAggregateClient } from "./client";
import {
  assertMcaKeyFormat,
  encryptAggregateKey,
  keyPrefixFromRaw,
} from "./crypto";
import { resolveValidatedAggregateHost } from "./host-allowlist";
import { redactSecrets, safeErrorMessage } from "./sanitize";
import type { AggregateCompany, AggregateUser } from "./types";
import { AggregateApiError } from "./types";

const REMOTE_SYSTEM = "sigesc_aggregate";

async function uniqueSlug(prisma: PrismaClient, desired: string): Promise<string> {
  let slug = desired;
  let n = 0;
  for (;;) {
    const existing = await prisma.institution.findUnique({ where: { slug } });
    if (!existing) return slug;
    n += 1;
    slug = `${desired}-${n}`;
  }
}

async function invitePasswordHash(): Promise<string> {
  return hash(randomBytes(32).toString("hex"), 10);
}

function toPublicError(err: unknown): AggregateApiError {
  if (err instanceof AggregateApiError) {
    return new AggregateApiError(redactSecrets(err.message), err.status, err.code);
  }
  return new AggregateApiError(safeErrorMessage(err, "Onboarding failed"), 502, 502);
}

export type ConnectAggregateResult = {
  institutionId: string;
  connectionId: string;
  companiesUpserted: number;
  usersUpserted: number;
  keyPrefix: string;
  keyName: string | null;
};

/**
 * Validate Aggregate key BEFORE any persistence, then bootstrap institution.
 * Imported users receive the safe default role (never auto-admin).
 */
export async function connectAggregateAccount(
  prisma: PrismaClient,
  rawApiKey: string,
): Promise<ConnectAggregateResult> {
  assertMcaKeyFormat(rawApiKey);
  const host = resolveValidatedAggregateHost();
  const client = getAggregateClient();
  const rawKey = rawApiKey.trim();

  let onboarding;
  try {
    onboarding = await client.fetchOnboarding(rawKey);
  } catch (err) {
    throw toPublicError(err);
  }

  const company = onboarding.companies[0];
  if (!company) {
    throw new AggregateApiError("No companies linked to this Aggregate key", 422, 422);
  }

  const encryptedApiKey = encryptAggregateKey(rawKey);
  const keyPrefix = keyPrefixFromRaw(rawKey);

  return prisma.$transaction(async (tx) => {
    const institution = await resolveOrCreateInstitution(tx as unknown as PrismaClient, company);
    const roles = await ensureInstitutionRoles(tx as unknown as PrismaClient, institution.id);

    let usersUpserted = 0;
    for (const companyRow of onboarding.companies) {
      for (const user of companyRow.users ?? []) {
        await upsertImportedUser(tx as unknown as PrismaClient, institution.id, roles, user);
        usersUpserted += 1;
      }
    }

    await tx.syncMapping.upsert({
      where: {
        institutionId_localType_localId_remoteSystem: {
          institutionId: institution.id,
          localType: "Institution",
          localId: institution.id,
          remoteSystem: REMOTE_SYSTEM,
        },
      },
      create: {
        institutionId: institution.id,
        localType: "Institution",
        localId: institution.id,
        remoteSystem: REMOTE_SYSTEM,
        remoteId: company.external_id || String(company.id),
      },
      update: { remoteId: company.external_id || String(company.id) },
    });

    const connection = await tx.aggregateConnection.upsert({
      where: { institutionId: institution.id },
      create: {
        institutionId: institution.id,
        host,
        encryptedApiKey,
        keyPrefix,
        keyName: onboarding.key.name,
        scopesJson: onboarding.key.scopes,
        status: "ACTIVE",
        ownerCompanyExternalId: String(onboarding.key.owner_company_id),
        lastOnboardingAt: new Date(),
        lastError: null,
      },
      update: {
        host,
        encryptedApiKey,
        keyPrefix,
        keyName: onboarding.key.name,
        scopesJson: onboarding.key.scopes,
        status: "ACTIVE",
        ownerCompanyExternalId: String(onboarding.key.owner_company_id),
        lastOnboardingAt: new Date(),
        lastError: null,
      },
    });

    await tx.aggregateSyncRun.create({
      data: {
        institutionId: institution.id,
        connectionId: connection.id,
        kind: "ONBOARDING",
        success: true,
        companiesUpserted: onboarding.companies.length,
        usersUpserted,
        pagesProcessed: 1,
        detailsJson: { company_ids: onboarding.company_ids, keyPrefix },
      },
    });

    await tx.auditLog.create({
      data: {
        institutionId: institution.id,
        action: "UPDATE",
        entityType: "AggregateConnection",
        entityId: connection.id,
        metadata: {
          event: "aggregate.connected",
          keyPrefix,
          companies: onboarding.companies.length,
          users: usersUpserted,
        },
      },
    });

    // Create a default hotel workspace for the institution
    const existingHotel = await tx.hotel.findFirst({
      where: { institutionId: institution.id },
    });
    if (!existingHotel) {
      const hotel = await tx.hotel.create({
        data: {
          institutionId: institution.id,
          name: company.name,
          code: "MAIN",
          email: company.email ?? null,
          phone: company.phone ?? null,
          city: company.city ?? null,
          country: company.country ?? null,
          street: company.address?.street ?? null,
          active: true,
        },
      });
      await tx.hotelSettings.create({
        data: {
          hotelId: hotel.id,
          timezone: company.timezone || "Africa/Luanda",
          currency: (company.currency || "AOA").slice(0, 3),
          locale: company.language || "pt",
        },
      });
    }

    return {
      institutionId: institution.id,
      connectionId: connection.id,
      companiesUpserted: onboarding.companies.length,
      usersUpserted,
      keyPrefix,
      keyName: onboarding.key.name,
    };
  });
}

async function resolveOrCreateInstitution(prisma: PrismaClient, company: AggregateCompany) {
  const externalId = company.external_id || String(company.id);
  const byRef = await prisma.institution.findFirst({ where: { sigescCompanyRef: externalId } });
  if (byRef) {
    return prisma.institution.update({
      where: { id: byRef.id },
      data: {
        name: company.name,
        nif: company.nif ?? undefined,
        email: company.email ?? undefined,
        phone: company.phone ?? undefined,
        city: company.city ?? undefined,
        country: company.country ?? undefined,
        timezone: company.timezone || undefined,
        currency: company.currency ? company.currency.slice(0, 3) : undefined,
        locale: company.language || undefined,
      },
    });
  }

  const slug = await uniqueSlug(prisma, slugify(company.name));
  return prisma.institution.create({
    data: {
      name: company.name,
      slug,
      nif: company.nif ?? null,
      email: company.email ?? null,
      phone: company.phone ?? null,
      city: company.city ?? null,
      country: company.country ?? null,
      street: company.address?.street ?? null,
      addressNumber: company.address?.number ?? null,
      zipCode: company.address?.zip_code ?? null,
      timezone: company.timezone || "Africa/Luanda",
      currency: (company.currency || "AOA").slice(0, 3),
      locale: company.language || "pt",
      sigescCompanyRef: externalId,
      active: true,
    },
  });
}

async function upsertImportedUser(
  prisma: PrismaClient,
  institutionId: string,
  roles: Record<string, string>,
  remote: AggregateUser,
) {
  const email = remote.email.trim().toLowerCase();
  const externalId = remote.external_id || String(remote.id);
  const displayName =
    remote.full_name?.trim() ||
    [remote.name, remote.surname].filter(Boolean).join(" ").trim() ||
    email;
  const suggested = (remote.access_level || remote.role?.level || "user").toLowerCase();
  const importRoleId = roles[DEFAULT_AGGREGATE_IMPORT_ROLE] ?? roles.user!;
  const remoteActive = (remote.state ?? "active").toLowerCase() === "active";

  let user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { name: displayName, externalId },
    });
  } else {
    user = await prisma.user.create({
      data: {
        email,
        name: displayName,
        externalId,
        passwordHash: await invitePasswordHash(),
        invitePending: true,
        active: true,
      },
    });
  }

  const existingMembership = await prisma.membership.findUnique({
    where: { institutionId_userId: { institutionId, userId: user.id } },
  });

  await prisma.membership.upsert({
    where: { institutionId_userId: { institutionId, userId: user.id } },
    create: {
      institutionId,
      userId: user.id,
      roleId: importRoleId,
      status: remoteActive ? "INVITED" : "SUSPENDED",
      aggregateSuggestedLevel: suggested,
    },
    update: {
      status: remoteActive
        ? existingMembership?.status === "SUSPENDED"
          ? "ACTIVE"
          : existingMembership?.status ?? "INVITED"
        : "SUSPENDED",
      aggregateSuggestedLevel: suggested,
    },
  });

  await prisma.syncMapping.upsert({
    where: {
      institutionId_localType_localId_remoteSystem: {
        institutionId,
        localType: "User",
        localId: user.id,
        remoteSystem: REMOTE_SYSTEM,
      },
    },
    create: {
      institutionId,
      localType: "User",
      localId: user.id,
      remoteSystem: REMOTE_SYSTEM,
      remoteId: externalId,
    },
    update: { remoteId: externalId },
  });
}

export function fingerprintKeyForLog(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex").slice(0, 12);
}
