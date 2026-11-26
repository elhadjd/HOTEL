import type { MembershipStatus, PrismaClient } from "@prisma/client";
import type { TenantContext } from "@/modules/tenancy/tenant";
import { ensureInstitutionRoles } from "@/modules/iam/ensure-roles";
import { DEFAULT_AGGREGATE_IMPORT_ROLE } from "@/modules/iam/permissions";
import { generateOpaqueToken, hashPassword } from "@/modules/auth/password";
import { getAggregateClient } from "./client";
import {
  assertAggregateScope,
  resolveInstitutionAggregateConnection,
} from "./connection-context";
import { assertMcaKeyFormat, encryptAggregateKey, keyPrefixFromRaw } from "./crypto";
import { resolveValidatedAggregateHost } from "./host-allowlist";
import { refreshInvoiceFromCentral } from "./invoices/invoice-service";
import { resolveAggregateMode } from "./port";
import { redactSecrets } from "./sanitize";

const REMOTE_SYSTEM = "sigesc_aggregate";

/**
 * Live connectivity test against the institution's configured SIGESC Aggregate host.
 * Never returns raw API keys.
 */
export async function testAggregateConnection(
  prisma: PrismaClient,
  ctx: TenantContext,
) {
  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  const client = getAggregateClient(resolved.connection.host);
  const startedAt = Date.now();
  const mode = resolveAggregateMode();

  try {
    let endpoint = "GET /onboarding";
    let keyName = resolved.connection.keyName;
    let scopes = resolved.scopes;
    let companyId = resolved.companyId;

    if (client.fetchMe) {
      try {
        const me = await client.fetchMe(resolved.apiKey);
        endpoint = "GET /me";
        if (me?.key?.name) keyName = me.key.name;
        if (Array.isArray(me?.key?.scopes) && me.key.scopes.length > 0) {
          scopes = me.key.scopes;
        }
        if (me?.owner_company_id != null) {
          companyId = String(me.owner_company_id);
        } else if (me?.key?.owner_company_id != null) {
          companyId = String(me.key.owner_company_id);
        }
      } catch {
        const onboarding = await client.fetchOnboarding(resolved.apiKey);
        endpoint = "GET /onboarding";
        keyName = onboarding.key.name;
        scopes = onboarding.key.scopes;
        companyId = String(onboarding.key.owner_company_id);
      }
    } else {
      const onboarding = await client.fetchOnboarding(resolved.apiKey);
      keyName = onboarding.key.name;
      scopes = onboarding.key.scopes;
      companyId = String(onboarding.key.owner_company_id);
    }

    const latencyMs = Date.now() - startedAt;

    await prisma.aggregateConnection.update({
      where: { id: resolved.connection.id },
      data: {
        lastError: null,
        scopesJson: scopes,
        keyName,
      },
    });

    await prisma.auditLog.create({
      data: {
        institutionId: ctx.institutionId,
        actorUserId: ctx.userId,
        action: "UPDATE",
        entityType: "AggregateConnectionTest",
        entityId: resolved.connection.id,
        metadata: { ok: true, mode, endpoint, latencyMs },
      },
    });

    return {
      ok: true,
      mode,
      host: resolved.connection.host,
      endpoint,
      latencyMs,
      companyId,
      keyPrefix: resolved.connection.keyPrefix,
      keyName,
      scopes,
    };
  } catch (err) {
    const message = redactSecrets(
      err instanceof Error ? err.message : "Connectivity test failed",
    );
    await prisma.aggregateConnection.update({
      where: { id: resolved.connection.id },
      data: { lastError: message.slice(0, 500) },
    });
    throw new Error(message);
  }
}

/**
 * Rotate the institution's `mca_` API key after verifying live against SIGESC
 * that the new key belongs to the exact same linked company.
 */
export async function rotateAggregateApiKey(
  prisma: PrismaClient,
  ctx: TenantContext,
  rawApiKey: string,
  customHost?: string,
) {
  assertMcaKeyFormat(rawApiKey);
  const rawKey = rawApiKey.trim();

  const existing = await prisma.aggregateConnection.findUnique({
    where: { institutionId: ctx.institutionId },
    include: { institution: { select: { id: true, sigescCompanyRef: true } } },
  });
  if (!existing) {
    throw new Error("No Aggregate connection configured for this institution");
  }

  const host = resolveValidatedAggregateHost(customHost?.trim() || existing.host);
  const client = getAggregateClient(host);
  const onboarding = await client.fetchOnboarding(rawKey);

  const newOwnerCompanyId = String(onboarding.key.owner_company_id);
  const newCompanyRefs = new Set(
    onboarding.companies.flatMap((c) => [String(c.id), c.external_id].filter(Boolean)),
  );
  const expectedCompanyId = existing.ownerCompanyExternalId;
  const expectedRef = existing.institution.sigescCompanyRef;

  const companyMatches =
    (expectedCompanyId &&
      (newOwnerCompanyId === expectedCompanyId || newCompanyRefs.has(expectedCompanyId))) ||
    (expectedRef && newCompanyRefs.has(expectedRef));

  if (!companyMatches) {
    throw new Error(
      "The provided API key belongs to a different SIGESC company and cannot replace this institution's connection",
    );
  }

  const encryptedApiKey = encryptAggregateKey(rawKey);
  const keyPrefix = keyPrefixFromRaw(rawKey);

  const updated = await prisma.aggregateConnection.update({
    where: { id: existing.id },
    data: {
      host,
      encryptedApiKey,
      keyPrefix,
      keyName: onboarding.key.name,
      scopesJson: onboarding.key.scopes,
      status: "ACTIVE",
      ownerCompanyExternalId: newOwnerCompanyId,
      lastOnboardingAt: new Date(),
      lastError: null,
    },
  });

  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      actorUserId: ctx.userId,
      action: "UPDATE",
      entityType: "AggregateConnection",
      entityId: updated.id,
      metadata: {
        event: "aggregate.key_rotated",
        previousPrefix: existing.keyPrefix,
        keyPrefix,
        host,
      },
    },
  });

  return {
    connectionId: updated.id,
    host: updated.host,
    keyPrefix: updated.keyPrefix,
    keyName: updated.keyName,
    scopes: onboarding.key.scopes,
    status: updated.status,
  };
}

/**
 * Sync staff users from SIGESC (`GET /users`) into this institution's memberships.
 * Preserves credentials and sessions of already-established users (S2-safe).
 */
export async function syncUsersFromAggregate(
  prisma: PrismaClient,
  ctx: TenantContext,
) {
  const resolved = await resolveInstitutionAggregateConnection(prisma, ctx.institutionId);
  assertAggregateScope(resolved, "users");
  const client = getAggregateClient(resolved.connection.host);

  let page = 1;
  let pagesProcessed = 0;
  let usersUpserted = 0;
  const maxPages = 20;

  const roles = await ensureInstitutionRoles(prisma, ctx.institutionId);
  const defaultRoleId = roles[DEFAULT_AGGREGATE_IMPORT_ROLE] ?? roles.user!;

  while (page <= maxPages) {
    const res = await client.fetchUsers(resolved.apiKey, {
      company_id: resolved.companyNumericId,
      page,
      per_page: 50,
    });
    const batch = res.data ?? [];
    pagesProcessed += 1;

    if (batch.length === 0) break;

    for (const remote of batch) {
      const email = remote.email?.trim().toLowerCase();
      if (!email) continue;
      const externalId = remote.external_id || String(remote.id);
      const displayName =
        remote.full_name?.trim() ||
        [remote.name, remote.surname].filter(Boolean).join(" ").trim() ||
        email;
      const suggested = (remote.access_level || remote.role?.level || "user").toLowerCase();
      const remoteActive = (remote.state ?? "active").toLowerCase() === "active";

      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          externalId: true,
          invitePending: true,
          passwordChangedAt: true,
        },
      });

      let userId: string;
      if (existingUser) {
        userId = existingUser.id;
        // S2-safe: never overwrite credentials of established users
        if (!existingUser.externalId) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: { externalId },
          });
        }
      } else {
        const created = await prisma.user.create({
          data: {
            email,
            name: displayName,
            externalId,
            passwordHash: await hashPassword(generateOpaqueToken(24)),
            invitePending: true,
            isInstitutionAdmin: false,
            mustChangePassword: false,
            active: true,
          },
          select: { id: true },
        });
        userId = created.id;
      }

      const existingMembership = await prisma.membership.findUnique({
        where: {
          institutionId_userId: { institutionId: ctx.institutionId, userId },
        },
        select: { id: true, status: true },
      });

      const nextStatus: MembershipStatus = remoteActive
        ? existingMembership?.status === "SUSPENDED"
          ? "ACTIVE"
          : existingMembership?.status ?? "INVITED"
        : "SUSPENDED";

      await prisma.membership.upsert({
        where: {
          institutionId_userId: { institutionId: ctx.institutionId, userId },
        },
        create: {
          institutionId: ctx.institutionId,
          userId,
          roleId: defaultRoleId,
          status: remoteActive ? "INVITED" : "SUSPENDED",
          aggregateSuggestedLevel: suggested,
        },
        update: {
          aggregateSuggestedLevel: suggested,
          status: nextStatus,
        },
      });

      await prisma.syncMapping.upsert({
        where: {
          institutionId_localType_localId_remoteSystem: {
            institutionId: ctx.institutionId,
            localType: "User",
            localId: userId,
            remoteSystem: REMOTE_SYSTEM,
          },
        },
        create: {
          institutionId: ctx.institutionId,
          localType: "User",
          localId: userId,
          remoteSystem: REMOTE_SYSTEM,
          remoteId: externalId,
        },
        update: { remoteId: externalId },
      });

      usersUpserted += 1;
    }

    const lastPage = res.meta?.pagination?.last_page ?? page;
    if (page >= lastPage) break;
    page += 1;
  }

  const now = new Date();
  await prisma.aggregateConnection.update({
    where: { id: resolved.connection.id },
    data: { lastUsersSyncAt: now, lastError: null },
  });

  await prisma.aggregateSyncRun.create({
    data: {
      institutionId: ctx.institutionId,
      connectionId: resolved.connection.id,
      kind: "USERS",
      success: true,
      usersUpserted,
      pagesProcessed,
      detailsJson: { actorUserId: ctx.userId },
    },
  });

  return { usersUpserted, pagesProcessed, syncedAt: now.toISOString() };
}

/**
 * Refreshes open/recent SIGESC financial documents (`GET /sales/{sale_key}`) so
 * the PMS reflects when a Cotação/Proforma was Published or Paid in SIGESC.
 */
export async function syncOpenInvoicesFromCentral(
  prisma: PrismaClient,
  ctx: TenantContext,
  limit = 30,
) {
  const candidates = await prisma.invoiceIntegration.findMany({
    where: {
      institutionId: ctx.institutionId,
      saleKey: { not: null },
      status: { in: ["CREATED", "RECONCILIATION_REQUIRED"] },
      OR: [
        { centralState: null },
        {
          centralState: {
            notIn: [
              "Pago",
              "Paga",
              "Paid",
              "Anulado",
              "Anulada",
              "Cancelado",
              "Cancelada",
              "Cancelled",
            ],
          },
        },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
    select: { id: true, externalId: true, centralState: true },
  });

  let updated = 0;
  let failed = 0;
  const changes: Array<{
    id: string;
    externalId: string;
    previousState: string | null;
    centralState: string | null;
  }> = [];

  for (const inv of candidates) {
    try {
      const fresh = await refreshInvoiceFromCentral(prisma, ctx, inv.id);
      if (fresh.centralState !== inv.centralState) {
        updated += 1;
        changes.push({
          id: inv.id,
          externalId: inv.externalId,
          previousState: inv.centralState,
          centralState: fresh.centralState,
        });
      }
    } catch {
      failed += 1;
    }
  }

  return {
    checked: candidates.length,
    updated,
    failed,
    changes,
  };
}
