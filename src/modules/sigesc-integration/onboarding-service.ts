import { createHash } from "node:crypto";
import type {
  MembershipStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { ensureInstitutionRoles } from "@/modules/iam/ensure-roles";
import { DEFAULT_AGGREGATE_IMPORT_ROLE } from "@/modules/iam/permissions";
import {
  generateOpaqueToken,
  generateTemporaryPassword,
  hashPassword,
  hashToken,
  onboardingChallengeTtlMs,
  temporaryPasswordTtlMs,
} from "@/modules/auth/password";
import { enqueueEmail, flushEmailOutboxInRequest } from "@/modules/email/outbox";
import { slugify } from "@/shared/utils";
import {
  identifyAuthorizedAdministrator,
  toPublicAdminPreview,
  toPublicCompanyPreview,
} from "./admin-identification";
import { getAggregateClient } from "./client";
import {
  assertMcaKeyFormat,
  decryptAggregateKey,
  encryptAggregateKey,
  keyPrefixFromRaw,
} from "./crypto";
import { resolveValidatedAggregateHost } from "./host-allowlist";
import { redactSecrets, safeErrorMessage } from "./sanitize";
import type { AggregateCompany, AggregateOnboardingData, AggregateUser } from "./types";
import { AggregateApiError } from "./types";

const REMOTE_SYSTEM = "sigesc_aggregate";

type Db = PrismaClient | Prisma.TransactionClient;

function toPublicError(err: unknown): AggregateApiError {
  if (err instanceof AggregateApiError) {
    return new AggregateApiError(redactSecrets(err.message), err.status, err.code);
  }
  return new AggregateApiError(safeErrorMessage(err, "Onboarding failed"), 502, 502);
}

async function uniqueSlug(prisma: Db, desired: string): Promise<string> {
  let slug = desired;
  let n = 0;
  for (;;) {
    const existing = await prisma.institution.findUnique({ where: { slug } });
    if (!existing) return slug;
    n += 1;
    slug = `${desired}-${n}`;
  }
}

export type OnboardingPreview = {
  challengeToken: string;
  expiresAt: string;
  keyPrefix: string;
  keyName: string | null;
  scopes: string[];
  company: ReturnType<typeof toPublicCompanyPreview>;
  administrator: ReturnType<typeof toPublicAdminPreview>;
  usersToImport: number;
  alreadyLinked: boolean;
  existingInstitutionId: string | null;
};

/**
 * Step 1: validate Aggregate key server-side, identify admin, create challenge.
 * Raw key is encrypted and never returned.
 */
export async function validateOnboardingKey(
  prisma: PrismaClient,
  rawApiKey: string,
): Promise<OnboardingPreview> {
  assertMcaKeyFormat(rawApiKey);
  const rawKey = rawApiKey.trim();
  const client = getAggregateClient();

  let onboarding: AggregateOnboardingData;
  try {
    onboarding = await client.fetchOnboarding(rawKey);
  } catch (err) {
    throw toPublicError(err);
  }

  const identified = identifyAuthorizedAdministrator(onboarding);
  const company = identified.company;
  const externalId = company.external_id || String(company.id);

  const existing = await prisma.institution.findFirst({
    where: { sigescCompanyRef: externalId },
    select: { id: true },
  });

  const challengeToken = generateOpaqueToken(32);
  const expiresAt = new Date(Date.now() + onboardingChallengeTtlMs());

  await prisma.onboardingChallenge.create({
    data: {
      tokenHash: hashToken(challengeToken),
      encryptedApiKey: encryptAggregateKey(rawKey),
      keyPrefix: keyPrefixFromRaw(rawKey),
      ownerCompanyExternalId: String(onboarding.key.owner_company_id),
      companySnapshot: toPublicCompanyPreview(company),
      adminSnapshot: toPublicAdminPreview(identified.user),
      usersSnapshot: (company.users ?? []).map((u) => ({
        externalId: u.external_id || String(u.id),
        email: u.email.trim().toLowerCase(),
        fullName:
          u.full_name?.trim() ||
          [u.name, u.surname].filter(Boolean).join(" ").trim() ||
          u.email,
        accessLevel: u.access_level,
        state: u.state ?? "active",
      })),
      expiresAt,
    },
  });

  return {
    challengeToken,
    expiresAt: expiresAt.toISOString(),
    keyPrefix: keyPrefixFromRaw(rawKey),
    keyName: onboarding.key.name,
    scopes: onboarding.key.scopes,
    company: toPublicCompanyPreview(company),
    administrator: toPublicAdminPreview(identified.user),
    usersToImport: company.users?.length ?? 0,
    alreadyLinked: Boolean(existing),
    existingInstitutionId: existing?.id ?? null,
  };
}

export type ConfirmOnboardingResult = {
  institutionId: string;
  connectionId: string;
  administratorEmail: string;
  administratorName: string;
  usersUpserted: number;
  keyPrefix: string;
  emailQueued: boolean;
  alreadyExisted: boolean;
};

/**
 * Step 2: confirm challenge, persist institution transactionally, enqueue admin email post-data.
 * Idempotent if institution already linked to the same SIGESC company.
 */
export async function confirmOnboardingChallenge(
  prisma: PrismaClient,
  challengeToken: string,
): Promise<ConfirmOnboardingResult> {
  const tokenHash = hashToken(challengeToken);
  const challenge = await prisma.onboardingChallenge.findUnique({ where: { tokenHash } });
  if (!challenge || challenge.consumedAt) {
    throw new AggregateApiError("Invalid or already used onboarding challenge", 400, 400);
  }
  if (challenge.expiresAt.getTime() < Date.now()) {
    throw new AggregateApiError("Onboarding challenge expired — validate the API key again", 400, 400);
  }

  const rawKey = decryptAggregateKey(challenge.encryptedApiKey);
  const host = resolveValidatedAggregateHost();
  const client = getAggregateClient();

  // Re-validate against Aggregate before write (never trust challenge snapshot alone)
  let onboarding: AggregateOnboardingData;
  try {
    onboarding = await client.fetchOnboarding(rawKey);
  } catch (err) {
    throw toPublicError(err);
  }

  const identified = identifyAuthorizedAdministrator(onboarding);
  const company = identified.company;
  const admin = identified.user;
  const externalId = company.external_id || String(company.id);

  // Ensure challenge company still matches live Aggregate response
  const liveExternal = company.external_id || String(company.id);
  const snap = challenge.companySnapshot as { externalId?: string };
  if (snap.externalId && snap.externalId !== liveExternal) {
    throw new AggregateApiError("Company mismatch between challenge and Aggregate response", 409, 409);
  }

  const adminEmail = admin.email.trim().toLowerCase();
  const temporaryPassword = generateTemporaryPassword(16);
  const temporaryHash = await hashPassword(temporaryPassword);
  const tempExpires = new Date(Date.now() + temporaryPasswordTtlMs());
  const encryptedApiKey = encryptAggregateKey(rawKey);
  const keyPrefix = keyPrefixFromRaw(rawKey);

  // Flatten all users ONCE (outside transaction) to avoid nested loops inside it.
  const allRemoteUsers = onboarding.companies.flatMap((c) => c.users ?? []);
  const allEmails = Array.from(
    new Set(allRemoteUsers.map((u) => u.email.trim().toLowerCase())),
  );

  const result = await prisma.$transaction(
    async (tx) => {
      const existingInstitution = await tx.institution.findFirst({
        where: { sigescCompanyRef: externalId },
      });

      if (existingInstitution) {
        // Idempotent reconnect: refresh connection, do not re-email temp password automatically
        const connection = await tx.aggregateConnection.upsert({
          where: { institutionId: existingInstitution.id },
          create: {
            institutionId: existingInstitution.id,
            host,
            encryptedApiKey,
            keyPrefix,
            keyName: onboarding.key.name,
            scopesJson: onboarding.key.scopes,
            status: "ACTIVE",
            ownerCompanyExternalId: String(onboarding.key.owner_company_id),
            lastOnboardingAt: new Date(),
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

        await tx.onboardingChallenge.update({
          where: { id: challenge.id },
          data: { consumedAt: new Date(), institutionId: existingInstitution.id },
        });

        await tx.auditLog.create({
          data: {
            institutionId: existingInstitution.id,
            action: "UPDATE",
            entityType: "AggregateConnection",
            entityId: connection.id,
            metadata: { event: "aggregate.reconnected", keyPrefix, idempotent: true },
          },
        });

        return {
          institutionId: existingInstitution.id,
          connectionId: connection.id,
          administratorEmail: adminEmail,
          administratorName:
            admin.full_name?.trim() ||
            [admin.name, admin.surname].filter(Boolean).join(" ").trim() ||
            adminEmail,
          usersUpserted: 0,
          keyPrefix,
          emailQueued: false,
          alreadyExisted: true,
        } satisfies ConfirmOnboardingResult;
      }

      const institution = await createInstitution(tx, company);
      const roles = await ensureInstitutionRoles(tx as unknown as PrismaClient, institution.id);

      // ---- BATCH PRELOAD: elimina findUnique por usuário dentro do loop ----
      const existingUsers = allEmails.length
        ? await tx.user.findMany({
            where: { email: { in: allEmails } },
            select: { id: true, email: true },
          })
        : [];
      const userByEmail = new Map<string, { id: string; email: string }>(
        existingUsers.map((u) => [u.email, u]),
      );

      const existingMemberships = await tx.membership.findMany({
        where: { institutionId: institution.id },
        select: { userId: true, roleId: true, status: true },
      });
      const membershipByUserId = new Map<
        string,
        { userId: string; roleId: string; status: MembershipStatus }
      >(existingMemberships.map((m) => [m.userId, m]));

      let usersUpserted = 0;
      let adminUserId: string | null = null;

      for (const user of allRemoteUsers) {
        const isAdmin =
          (user.external_id || String(user.id)) === (admin.external_id || String(admin.id)) ||
          user.email.trim().toLowerCase() === adminEmail;

        const created = await upsertImportedUserBatched(tx, institution.id, roles, user, {
          isOfficialAdmin: isAdmin,
          temporaryPasswordHash: isAdmin ? temporaryHash : undefined,
          temporaryPasswordExpiresAt: isAdmin ? tempExpires : undefined,
          userByEmail,
          membershipByUserId,
        });

        usersUpserted += 1;
        if (isAdmin) adminUserId = created.userId;
      }

      if (!adminUserId) {
        throw new AggregateApiError("Failed to persist authorized administrator", 500, 500);
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
          remoteId: externalId,
        },
        update: { remoteId: externalId },
      });

      const connection = await tx.aggregateConnection.create({
        data: {
          institutionId: institution.id,
          host,
          encryptedApiKey,
          keyPrefix,
          keyName: onboarding.key.name,
          scopesJson: onboarding.key.scopes,
          status: "ACTIVE",
          ownerCompanyExternalId: String(onboarding.key.owner_company_id),
          lastOnboardingAt: new Date(),
        },
      });

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

      await enqueueEmail(tx, {
        institutionId: institution.id,
        userId: adminUserId,
        template: "ONBOARDING_TEMP_PASSWORD",
        toEmail: adminEmail,
        subject: "SIGESC Hotelaria — Conta institucional criada",
        payloadJson: {
          toName:
            admin.full_name?.trim() ||
            [admin.name, admin.surname].filter(Boolean).join(" ").trim() ||
            adminEmail,
          institutionName: company.name,
          locale: company.language || "pt",
        },
        plaintextSecret: temporaryPassword,
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
          detailsJson: {
            keyPrefix,
            adminExternalId: admin.external_id || String(admin.id),
            adminEmail,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          institutionId: institution.id,
          action: "CREATE",
          entityType: "Institution",
          entityId: institution.id,
          metadata: {
            event: "aggregate.onboarded",
            keyPrefix,
            adminEmail,
            usersUpserted,
          },
        },
      });

      await tx.onboardingChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date(), institutionId: institution.id },
      });

      return {
        institutionId: institution.id,
        connectionId: connection.id,
        administratorEmail: adminEmail,
        administratorName:
          admin.full_name?.trim() ||
          [admin.name, admin.surname].filter(Boolean).join(" ").trim() ||
          adminEmail,
        usersUpserted,
        keyPrefix,
        emailQueued: true,
        alreadyExisted: false,
      } satisfies ConfirmOnboardingResult;
    },
    // Margem de segurança: onboarding pode ter muitos usuários.
    // A correção estrutural (batch) reduz o tempo real; o timeout evita falhas residuais.
    { timeout: 30_000, maxWait: 10_000 },
  );

  // Send email in this request after successful commit (not a background job)
  if (result.emailQueued) {
    await flushEmailOutboxInRequest(prisma);
  }

  return result;
}

async function createInstitution(prisma: Db, company: AggregateCompany) {
  const externalId = company.external_id || String(company.id);
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

async function upsertImportedUserBatched(
  prisma: Db,
  institutionId: string,
  roles: Record<string, string>,
  remote: AggregateUser,
  options: {
    isOfficialAdmin: boolean;
    temporaryPasswordHash?: string;
    temporaryPasswordExpiresAt?: Date;
    userByEmail: Map<string, { id: string; email: string }>;
    membershipByUserId: Map<
      string,
      { userId: string; roleId: string; status: MembershipStatus }
    >;
  },
) {
  const email = remote.email.trim().toLowerCase();
  const externalId = remote.external_id || String(remote.id);
  const displayName =
    remote.full_name?.trim() ||
    [remote.name, remote.surname].filter(Boolean).join(" ").trim() ||
    email;
  const suggested = (remote.access_level || remote.role?.level || "user").toLowerCase();
  const remoteActive = (remote.state ?? "active").toLowerCase() === "active";

  const importRoleId: string = options.isOfficialAdmin
    ? roles.hotel_admin ?? roles.user!
    : roles[DEFAULT_AGGREGATE_IMPORT_ROLE] ?? roles.user!;

  const existing = options.userByEmail.get(email);

  let user: { id: string };
  if (existing) {
    user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: displayName,
        externalId,
        ...(options.isOfficialAdmin && options.temporaryPasswordHash
          ? {
              passwordHash: options.temporaryPasswordHash,
              mustChangePassword: true,
              temporaryPasswordExpiresAt: options.temporaryPasswordExpiresAt,
              isInstitutionAdmin: true,
              invitePending: false,
              sessionVersion: { increment: 1 },
            }
          : {
              invitePending: true,
            }),
      },
      select: { id: true },
    });
  } else {
    const passwordHash =
      options.temporaryPasswordHash ?? (await hashPassword(generateOpaqueToken(24)));
    user = await prisma.user.create({
      data: {
        email,
        name: displayName,
        externalId,
        passwordHash,
        invitePending: !options.isOfficialAdmin,
        isInstitutionAdmin: options.isOfficialAdmin,
        mustChangePassword: Boolean(options.isOfficialAdmin),
        temporaryPasswordExpiresAt: options.temporaryPasswordExpiresAt ?? null,
        active: true,
      },
      select: { id: true },
    });
    // Registra no Map para evitar duplicidade caso o mesmo email apareça em outra company
    options.userByEmail.set(email, { id: user.id, email });
  }

  const existingMembership = options.membershipByUserId.get(user.id);

  const roleId: string = options.isOfficialAdmin
    ? importRoleId
    : existingMembership?.roleId ?? importRoleId;

  // Tipagem explícita do enum evita alargamento de literal para string
  const createStatus: MembershipStatus = options.isOfficialAdmin
    ? "ACTIVE"
    : remoteActive
      ? "INVITED"
      : "SUSPENDED";

  const updateStatus: MembershipStatus = options.isOfficialAdmin
    ? "ACTIVE"
    : remoteActive
      ? existingMembership?.status === "SUSPENDED"
        ? "ACTIVE"
        : existingMembership?.status ?? "INVITED"
      : "SUSPENDED";

  const membership = await prisma.membership.upsert({
    where: { institutionId_userId: { institutionId, userId: user.id } },
    create: {
      institutionId,
      userId: user.id,
      roleId,
      status: createStatus,
      aggregateSuggestedLevel: suggested,
    },
    update: {
      ...(options.isOfficialAdmin ? { roleId: importRoleId } : {}),
      aggregateSuggestedLevel: suggested,
      status: updateStatus,
    },
    select: { userId: true, roleId: true, status: true },
  });
  options.membershipByUserId.set(user.id, membership);

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

  return { userId: user.id };
}

/** @deprecated Prefer validate + confirm two-step flow */
export async function connectAggregateAccount(prisma: PrismaClient, rawApiKey: string) {
  const preview = await validateOnboardingKey(prisma, rawApiKey);
  return confirmOnboardingChallenge(prisma, preview.challengeToken);
}

export function fingerprintKeyForLog(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex").slice(0, 12);
}