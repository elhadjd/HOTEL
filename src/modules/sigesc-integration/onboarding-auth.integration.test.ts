import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { verifyPassword } from "@/modules/auth/password";
import {
  EMAIL_NOT_FOUND_MESSAGE,
  EMAIL_SENT_MESSAGE,
  changePasswordMandatory,
  requestPasswordReset,
  resetPasswordWithToken,
} from "@/modules/auth/password-recovery";
import { resetMailer, getMockMailer } from "@/modules/email";
import {
  confirmOnboardingChallenge,
  validateOnboardingKey,
} from "./onboarding-service";
import { MOCK_VALID_MCA_KEY, MOCK_REVOKED_MCA_KEY, resetAggregateClient } from "./index";

const hasDb = Boolean(process.env.DATABASE_URL);

function sampleStrongPassword(tag: string): string {
  return ["New", tag, "Pass", String(1), "!"].join("");
}

/** Extract opaque reset token from mock mailer body (secret wiped from outbox after send). */
function extractResetTokenFromMailer(): string {
  const texts = getMockMailer()?.sentTexts ?? [];
  for (const text of texts) {
    const match = text.match(/reset-password\?token=([^\s&]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  throw new Error("Reset token not found in mock mailer texts");
}

describe.runIf(hasDb)("Phase 2 onboarding + auth integration", () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    process.env.SIGESC_AGGREGATE_MODE = "mock";
    process.env.EMAIL_MODE = "mock";
    process.env.AGGREGATE_ENCRYPTION_KEY =
      process.env.AGGREGATE_ENCRYPTION_KEY || "test-aggregate-encryption-key-32chars!!";
    process.env.AUTH_SECRET =
      process.env.AUTH_SECRET || "dev-auth-secret-change-me-min-32-chars!!";
    resetAggregateClient();
    resetMailer();
  });

  beforeEach(async () => {
    resetAggregateClient();
    resetMailer();
    // Clean phase-2 artifacts for mock company
    await prisma.emailOutbox.deleteMany({});
    await prisma.passwordResetToken.deleteMany({});
    await prisma.onboardingChallenge.deleteMany({});
    await prisma.authRateLimit.deleteMany({});
    const inst = await prisma.institution.findFirst({
      where: { sigescCompanyRef: "44" },
    });
    if (inst) {
      await prisma.auditLog.deleteMany({ where: { institutionId: inst.id } });
      await prisma.syncMapping.deleteMany({ where: { institutionId: inst.id } });
      await prisma.aggregateSyncRun.deleteMany({ where: { institutionId: inst.id } });
      await prisma.aggregateConnection.deleteMany({ where: { institutionId: inst.id } });
      await prisma.membership.deleteMany({ where: { institutionId: inst.id } });
      await prisma.rolePermission.deleteMany({
        where: { role: { institutionId: inst.id } },
      });
      await prisma.role.deleteMany({ where: { institutionId: inst.id } });
      await prisma.institution.delete({ where: { id: inst.id } });
    }
    await prisma.user.deleteMany({
      where: { email: { in: ["sofia@baia.ao", "paulo@baia.ao", "ines@baia.ao"] } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects invalid Aggregate keys", async () => {
    await expect(validateOnboardingKey(prisma, MOCK_REVOKED_MCA_KEY)).rejects.toThrow();
  });

  it("validates key, confirms onboarding, emails admin only, forces password change", async () => {
    const preview = await validateOnboardingKey(prisma, MOCK_VALID_MCA_KEY);
    expect(preview.administrator.email).toBe("sofia@baia.ao");
    expect(preview.company.name).toContain("Baía");
    expect(JSON.stringify(preview)).not.toMatch(/mca_mockvalid/);

    const result = await confirmOnboardingChallenge(prisma, preview.challengeToken);
    expect(result.emailQueued).toBe(true);
    expect(result.administratorEmail).toBe("sofia@baia.ao");
    expect(result.usersUpserted).toBe(3);

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "sofia@baia.ao" } });
    expect(admin.mustChangePassword).toBe(true);
    expect(admin.isInstitutionAdmin).toBe(true);

    const manager = await prisma.user.findUniqueOrThrow({ where: { email: "paulo@baia.ao" } });
    expect(manager.mustChangePassword).toBe(false);
    expect(manager.isInstitutionAdmin).toBe(false);
    expect(manager.invitePending).toBe(true);

    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId: admin.id },
      include: { role: true },
    });
    expect(membership.role.code).toBe("hotel_admin");

    const mgrMembership = await prisma.membership.findFirstOrThrow({
      where: { userId: manager.id },
      include: { role: true },
    });
    expect(mgrMembership.role.code).not.toBe("hotel_admin");
    expect(mgrMembership.status).toBe("INVITED");

    // Email was sent synchronously in the confirm request (not a background job)
    const outbox = await prisma.emailOutbox.findMany({
      where: { template: "ONBOARDING_TEMP_PASSWORD" },
    });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.toEmail).toBe("sofia@baia.ao");
    expect(outbox[0]!.status).toBe("SENT");
    expect(outbox[0]!.encryptedSecret).toBeNull();
    expect(JSON.stringify(outbox[0]!.payloadJson)).not.toMatch(/mca_/i);

    const sent = getMockMailer()?.sent ?? [];
    expect(sent.some((m) => m.to === "sofia@baia.ao")).toBe(true);

    const previousHash = admin.passwordHash;

    // Idempotent reconnect does not re-email
    const preview2 = await validateOnboardingKey(prisma, MOCK_VALID_MCA_KEY);
    const again = await confirmOnboardingChallenge(prisma, preview2.challengeToken);
    expect(again.alreadyExisted).toBe(true);
    expect(again.emailQueued).toBe(false);

    // First-login password change invalidates temporary hash
    const firstPassword = sampleStrongPassword("Secure");
    await changePasswordMandatory(prisma, admin.id, firstPassword);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(updated.mustChangePassword).toBe(false);
    expect(await verifyPassword(firstPassword, updated.passwordHash)).toBe(true);
    expect(updated.passwordHash).not.toBe(previousHash);
  });

  it("password recovery reports missing email, sends when found, single-use", async () => {
    const preview = await validateOnboardingKey(prisma, MOCK_VALID_MCA_KEY);
    await confirmOnboardingChallenge(prisma, preview.challengeToken);
    await changePasswordMandatory(
      prisma,
      (await prisma.user.findUniqueOrThrow({ where: { email: "sofia@baia.ao" } })).id,
      sampleStrongPassword("Secure"),
    );

    const unknown = await requestPasswordReset(prisma, "nobody@example.com");
    expect(unknown.found).toBe(false);
    expect(unknown.message).toBe(EMAIL_NOT_FOUND_MESSAGE);

    const known = await requestPasswordReset(prisma, "sofia@baia.ao");
    expect(known.found).toBe(true);
    expect(known.message).toBe(EMAIL_SENT_MESSAGE);
    expect(unknown.message).not.toBe(known.message);

    const tokenRow = await prisma.passwordResetToken.findFirstOrThrow({
      where: { usedAt: null },
      orderBy: { createdAt: "desc" },
    });

    const mail = await prisma.emailOutbox.findFirstOrThrow({
      where: { template: "PASSWORD_RECOVERY" },
      orderBy: { createdAt: "desc" },
    });
    expect(mail.status).toBe("SENT");
    expect(mail.encryptedSecret).toBeNull();

    const token = extractResetTokenFromMailer();

    const recovered = sampleStrongPassword("Recovered");
    await resetPasswordWithToken(prisma, token, recovered);
    await expect(
      resetPasswordWithToken(prisma, token, sampleStrongPassword("Reuse")),
    ).rejects.toThrow(/invalid or expired/i);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "sofia@baia.ao" } });
    expect(await verifyPassword(recovered, user.passwordHash)).toBe(true);
    expect(user.sessionVersion).toBeGreaterThan(0);

    const used = await prisma.passwordResetToken.findUniqueOrThrow({
      where: { id: tokenRow.id },
    });
    expect(used.usedAt).not.toBeNull();
  });

  it("rolls back when challenge is reused", async () => {
    const preview = await validateOnboardingKey(prisma, MOCK_VALID_MCA_KEY);
    await confirmOnboardingChallenge(prisma, preview.challengeToken);
    await expect(confirmOnboardingChallenge(prisma, preview.challengeToken)).rejects.toThrow(
      /already used|invalid/i,
    );
  });
});
