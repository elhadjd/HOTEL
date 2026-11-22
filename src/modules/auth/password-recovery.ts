import type { PrismaClient } from "@prisma/client";
import {
  generateOpaqueToken,
  hashPassword,
  hashToken,
  passwordResetTtlMs,
  validatePasswordStrength,
} from "@/modules/auth/password";
import { enforceRateLimit, RateLimitError } from "@/modules/auth/rate-limit";
import { enqueueEmail, scheduleEmailDispatch } from "@/modules/email/outbox";
import { logger } from "@/server/logger";

const GENERIC_MESSAGE =
  "Se existir uma conta elegível para este email, enviámos instruções de recuperação.";

export { GENERIC_MESSAGE, RateLimitError };

export async function requestPasswordReset(
  prisma: PrismaClient,
  emailRaw: string,
  requestIp?: string | null,
): Promise<{ message: string }> {
  const email = emailRaw.trim().toLowerCase();

  try {
    await enforceRateLimit({
      bucketKey: `forgot:${email}`,
      limit: 5,
      windowMs: 15 * 60_000,
    });
    if (requestIp) {
      await enforceRateLimit({
        bucketKey: `forgot-ip:${requestIp}`,
        limit: 20,
        windowMs: 15 * 60_000,
      });
    }
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    return { message: GENERIC_MESSAGE };
  }

  const token = generateOpaqueToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + passwordResetTtlMs());

  await prisma.$transaction(async (tx) => {
    // Invalidate previous unused tokens
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        requestIp: requestIp ?? null,
      },
    });

    const membership = await tx.membership.findFirst({
      where: { userId: user.id, status: { in: ["ACTIVE", "INVITED"] } },
      select: { institutionId: true },
    });

    await enqueueEmail(tx, {
      institutionId: membership?.institutionId,
      userId: user.id,
      template: "PASSWORD_RECOVERY",
      toEmail: user.email,
      subject: "SIGESC Hotelaria — Recuperação de palavra-passe",
      // Never store the opaque token in payloadJson — only encryptedSecret
      payloadJson: {
        toName: user.name,
        resetPath: "/reset-password",
      },
      plaintextSecret: token,
    });

    await tx.auditLog.create({
      data: {
        institutionId: membership?.institutionId,
        actorUserId: user.id,
        action: "UPDATE",
        entityType: "PasswordResetToken",
        entityId: user.id,
        metadata: { event: "password.reset_requested" },
        ipAddress: requestIp ?? null,
      },
    });
  });

  scheduleEmailDispatch(prisma);
  logger.info("auth.password_reset.requested", { userId: user.id });
  return { message: GENERIC_MESSAGE };
}

export async function resetPasswordWithToken(
  prisma: PrismaClient,
  token: string,
  newPassword: string,
): Promise<{ ok: true }> {
  const strength = validatePasswordStrength(newPassword);
  if (!strength.ok) {
    throw new Error(strength.message);
  }

  const tokenHash = hashToken(token);
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    throw new Error("Invalid or expired recovery token");
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.passwordResetToken.findUnique({ where: { id: row.id } });
    if (!fresh || fresh.usedAt || fresh.expiresAt.getTime() < Date.now()) {
      throw new Error("Invalid or expired recovery token");
    }

    await tx.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });

    const user = await tx.user.update({
      where: { id: row.userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        temporaryPasswordExpiresAt: null,
        passwordChangedAt: new Date(),
        invitePending: false,
        sessionVersion: { increment: 1 },
      },
    });

    await tx.session.deleteMany({ where: { userId: user.id } });

    const membership = await tx.membership.findFirst({
      where: { userId: user.id },
      select: { institutionId: true },
    });

    await enqueueEmail(tx, {
      institutionId: membership?.institutionId,
      userId: user.id,
      template: "PASSWORD_CHANGED",
      toEmail: user.email,
      subject: "SIGESC Hotelaria — Palavra-passe actualizada",
      payloadJson: { toName: user.name },
    });

    await tx.auditLog.create({
      data: {
        institutionId: membership?.institutionId,
        actorUserId: user.id,
        action: "UPDATE",
        entityType: "User",
        entityId: user.id,
        metadata: { event: "password.reset_completed" },
      },
    });
  });

  scheduleEmailDispatch(prisma);
  return { ok: true };
}

export async function changePasswordMandatory(
  prisma: PrismaClient,
  userId: string,
  newPassword: string,
): Promise<{ ok: true }> {
  const strength = validatePasswordStrength(newPassword);
  if (!strength.ok) {
    throw new Error(strength.message);
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new Error("User not found");
    if (!user.mustChangePassword) throw new Error("Password change is not required");

    if (
      user.temporaryPasswordExpiresAt &&
      user.temporaryPasswordExpiresAt.getTime() < Date.now()
    ) {
      throw new Error("Temporary password expired — use password recovery");
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        temporaryPasswordExpiresAt: null,
        passwordChangedAt: new Date(),
        invitePending: false,
        sessionVersion: { increment: 1 },
      },
    });

    await tx.session.deleteMany({ where: { userId } });

    const membership = await tx.membership.findFirst({
      where: { userId },
      select: { institutionId: true },
    });

    await enqueueEmail(tx, {
      institutionId: membership?.institutionId,
      userId,
      template: "PASSWORD_CHANGED",
      toEmail: user.email,
      subject: "SIGESC Hotelaria — Palavra-passe actualizada",
      payloadJson: { toName: user.name },
    });

    await tx.auditLog.create({
      data: {
        institutionId: membership?.institutionId,
        actorUserId: userId,
        action: "UPDATE",
        entityType: "User",
        entityId: userId,
        metadata: { event: "password.first_change_completed" },
      },
    });
  });

  scheduleEmailDispatch(prisma);
  return { ok: true };
}
