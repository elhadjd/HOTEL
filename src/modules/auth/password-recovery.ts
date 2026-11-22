import type { PrismaClient } from "@prisma/client";
import {
  generateOpaqueToken,
  hashPassword,
  hashToken,
  passwordResetTtlMs,
  validatePasswordStrength,
} from "@/modules/auth/password";
import { enforceRateLimit, RateLimitError } from "@/modules/auth/rate-limit";
import { enqueueAndSendEmail } from "@/modules/email/outbox";
import { logger } from "@/server/logger";

const EMAIL_NOT_FOUND_MESSAGE =
  "Não existe conta activa com este email. Verifique o endereço e tente novamente.";
const EMAIL_SENT_MESSAGE =
  "Enviámos as instruções de recuperação para o seu email. Verifique a caixa de entrada.";

export { EMAIL_NOT_FOUND_MESSAGE, EMAIL_SENT_MESSAGE, RateLimitError };

/** @deprecated Prefer EMAIL_SENT_MESSAGE / EMAIL_NOT_FOUND_MESSAGE */
export const GENERIC_MESSAGE = EMAIL_SENT_MESSAGE;

export async function requestPasswordReset(
  prisma: PrismaClient,
  emailRaw: string,
  requestIp?: string | null,
): Promise<{ message: string; found: boolean }> {
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
    return { message: EMAIL_NOT_FOUND_MESSAGE, found: false };
  }

  const token = generateOpaqueToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + passwordResetTtlMs());

  await prisma.$transaction(async (tx) => {
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

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, status: { in: ["ACTIVE", "INVITED"] } },
    select: { institutionId: true },
  });

  // Send in this request — do not defer to a background job
  await enqueueAndSendEmail(prisma, {
    institutionId: membership?.institutionId,
    userId: user.id,
    template: "PASSWORD_RECOVERY",
    toEmail: user.email,
    subject: "SIGESC Hotelaria — Recuperação de palavra-passe",
    payloadJson: {
      toName: user.name,
      resetPath: "/reset-password",
    },
    plaintextSecret: token,
  });

  logger.info("auth.password_reset.requested", { userId: user.id });
  return { message: EMAIL_SENT_MESSAGE, found: true };
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

  let userEmail = "";
  let userName = "";
  let institutionId: string | null = null;

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
    userEmail = user.email;
    userName = user.name;

    await tx.session.deleteMany({ where: { userId: user.id } });

    const membership = await tx.membership.findFirst({
      where: { userId: user.id },
      select: { institutionId: true },
    });
    institutionId = membership?.institutionId ?? null;

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

  await enqueueAndSendEmail(prisma, {
    institutionId,
    userId: row.userId,
    template: "PASSWORD_CHANGED",
    toEmail: userEmail,
    subject: "SIGESC Hotelaria — Palavra-passe actualizada",
    payloadJson: { toName: userName },
  });

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

  let userEmail = "";
  let userName = "";
  let institutionId: string | null = null;

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
    userEmail = user.email;
    userName = user.name;

    await tx.session.deleteMany({ where: { userId } });

    const membership = await tx.membership.findFirst({
      where: { userId },
      select: { institutionId: true },
    });
    institutionId = membership?.institutionId ?? null;

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

  await enqueueAndSendEmail(prisma, {
    institutionId,
    userId,
    template: "PASSWORD_CHANGED",
    toEmail: userEmail,
    subject: "SIGESC Hotelaria — Palavra-passe actualizada",
    payloadJson: { toName: userName },
  });

  return { ok: true };
}
