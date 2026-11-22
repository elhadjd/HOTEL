import { prisma } from "@/server/db";

export class RateLimitError extends Error {
  constructor(message = "Too many requests. Please try again later.") {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Simple DB-backed sliding window rate limiter for auth endpoints.
 */
export async function enforceRateLimit(params: {
  bucketKey: string;
  limit: number;
  windowMs: number;
}): Promise<void> {
  const now = new Date();
  const existing = await prisma.authRateLimit.findUnique({
    where: { bucketKey: params.bucketKey },
  });

  if (!existing || now.getTime() - existing.windowStart.getTime() >= params.windowMs) {
    await prisma.authRateLimit.upsert({
      where: { bucketKey: params.bucketKey },
      create: {
        bucketKey: params.bucketKey,
        hitCount: 1,
        windowStart: now,
      },
      update: {
        hitCount: 1,
        windowStart: now,
      },
    });
    return;
  }

  if (existing.hitCount >= params.limit) {
    throw new RateLimitError();
  }

  await prisma.authRateLimit.update({
    where: { bucketKey: params.bucketKey },
    data: { hitCount: { increment: 1 } },
  });
}
