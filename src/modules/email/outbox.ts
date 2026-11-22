import type { EmailTemplateKind, Prisma, PrismaClient } from "@prisma/client";
import { encryptAggregateKey, decryptAggregateKey } from "@/modules/sigesc-integration/crypto";
import { logger } from "@/server/logger";
import { getAppUrl, getMailer } from "./mailer";
import { renderEmailTemplate } from "./templates";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Enqueue email inside the same DB transaction as the business write.
 * Secrets are encrypted separately; payloadJson must never contain plaintext secrets.
 */
export async function enqueueEmail(
  db: Db,
  input: {
    institutionId?: string | null;
    userId?: string | null;
    template: EmailTemplateKind;
    toEmail: string;
    subject: string;
    payloadJson: Record<string, unknown>;
    plaintextSecret?: string;
  },
) {
  return db.emailOutbox.create({
    data: {
      institutionId: input.institutionId ?? null,
      userId: input.userId ?? null,
      template: input.template,
      toEmail: input.toEmail.trim().toLowerCase(),
      subject: input.subject,
      payloadJson: input.payloadJson as Prisma.InputJsonValue,
      encryptedSecret: input.plaintextSecret
        ? encryptAggregateKey(input.plaintextSecret)
        : null,
      status: "PENDING",
      availableAt: new Date(),
    },
  });
}

export async function dispatchEmailOutbox(
  prisma: PrismaClient,
  limit = 20,
): Promise<{ sent: number; failed: number }> {
  const due = await prisma.emailOutbox.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      availableAt: { lte: new Date() },
      attempts: { lt: 5 },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;
  const mailer = getMailer();
  const appUrl = getAppUrl();

  for (const row of due) {
    try {
      const claimed = await prisma.emailOutbox.updateMany({
        where: {
          id: row.id,
          status: { in: ["PENDING", "FAILED"] },
        },
        data: { status: "SENDING", attempts: { increment: 1 } },
      });
      if (claimed.count === 0) continue;

      const secret = row.encryptedSecret ? decryptAggregateKey(row.encryptedSecret) : undefined;
      const payload = (row.payloadJson ?? {}) as Record<string, unknown>;
      const rendered = renderEmailTemplate(row.template, {
        appUrl,
        toName: typeof payload.toName === "string" ? payload.toName : undefined,
        institutionName:
          typeof payload.institutionName === "string" ? payload.institutionName : undefined,
        secret,
        resetPath: typeof payload.resetPath === "string" ? payload.resetPath : undefined,
        locale: typeof payload.locale === "string" ? payload.locale : "pt",
      });

      await mailer.send({
        to: row.toEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      await prisma.emailOutbox.updateMany({
        where: { id: row.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          lastError: null,
          // Wipe encrypted secret after successful send
          encryptedSecret: null,
        },
      });
      sent += 1;
      logger.info("email.outbox.sent", { id: row.id, template: row.template, to: row.toEmail });
    } catch (err) {
      const message = err instanceof Error ? err.message : "send failed";
      const attempts = row.attempts + 1;
      await prisma.emailOutbox.updateMany({
        where: { id: row.id },
        data: {
          status: attempts >= 5 ? "DEAD" : "FAILED",
          lastError: message.slice(0, 500),
          availableAt: new Date(Date.now() + Math.min(30, 2 ** attempts) * 60_000),
        },
      });
      failed += 1;
      logger.error("email.outbox.failed", { id: row.id, template: row.template });
    }
  }

  return { sent, failed };
}

/**
 * Send pending outbox emails synchronously in the current request.
 * Prefer this over background jobs so the API response reflects send success/failure.
 */
export async function flushEmailOutboxInRequest(
  prisma: PrismaClient,
  limit = 20,
): Promise<{ sent: number; failed: number }> {
  return dispatchEmailOutbox(prisma, limit);
}

/**
 * @deprecated Use flushEmailOutboxInRequest — email must be sent in-request, not as a job.
 * Kept as a thin alias that awaits dispatch for any accidental callers.
 */
export async function scheduleEmailDispatch(prisma: PrismaClient): Promise<void> {
  await flushEmailOutboxInRequest(prisma);
}

/** Enqueue then immediately send; throws if the send fails. */
export async function enqueueAndSendEmail(
  prisma: PrismaClient,
  input: {
    institutionId?: string | null;
    userId?: string | null;
    template: EmailTemplateKind;
    toEmail: string;
    subject: string;
    payloadJson: Record<string, unknown>;
    plaintextSecret?: string;
  },
): Promise<{ outboxId: string }> {
  const row = await enqueueEmail(prisma, input);
  const result = await dispatchEmailOutbox(prisma, 5);
  const fresh = await prisma.emailOutbox.findUnique({ where: { id: row.id } });
  if (!fresh || fresh.status !== "SENT") {
    throw new Error(
      fresh?.lastError?.trim() ||
        `Failed to send email (${input.template})${result.failed ? ` — ${result.failed} failed` : ""}`,
    );
  }
  return { outboxId: row.id };
}
