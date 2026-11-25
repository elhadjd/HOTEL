import { prisma } from "@/server/db";

export class RateLimitError extends Error {
  constructor(message = "Too many requests. Please try again later.") {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Extract client IP preferring reverse-proxy set `x-real-ip`.
 * When falling back to `x-forwarded-for`, use the rightmost non-empty hop
 * appended by the trusted proxy rather than the client-spoofable leftmost entry.
 */
export function extractClientIp(request: Request): string | null {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = request.headers.get("x-forwarded-for");
  if (!xff) return null;
  const parts = xff
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : null;
}

/**
 * Atomic DB-backed sliding window rate limiter for auth endpoints.
 */
export async function enforceRateLimit(params: {
  bucketKey: string;
  limit: number;
  windowMs: number;
}): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - params.windowMs);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.authRateLimit.findUnique({
      where: { bucketKey: params.bucketKey },
    });

    if (!existing || existing.windowStart.getTime() <= cutoff.getTime()) {
      await tx.authRateLimit.upsert({
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

    const updated = await tx.authRateLimit.updateMany({
      where: {
        bucketKey: params.bucketKey,
        hitCount: { lt: params.limit },
      },
      data: { hitCount: { increment: 1 } },
    });

    if (updated.count === 0) {
      throw new RateLimitError();
    }
  });
}
