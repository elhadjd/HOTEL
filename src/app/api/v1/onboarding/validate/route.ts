import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { logger } from "@/server/logger";
import { enforceRateLimit, RateLimitError } from "@/modules/auth/rate-limit";
import {
  AggregateApiError,
  assertNoSecretLeak,
  fingerprintKeyForLog,
  validateOnboardingKey,
} from "@/modules/sigesc-integration/onboarding-exports";

const bodySchema = z.object({
  apiKey: z.string().min(20),
});

function clientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Aggregate key payload" }, { status: 400 });
  }

  const ip = clientIp(request);
  try {
    await enforceRateLimit({
      bucketKey: `onboard-validate:${ip ?? "unknown"}`,
      limit: 20,
      windowMs: 15 * 60_000,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
  }

  const fingerprint = fingerprintKeyForLog(parsed.data.apiKey);
  logger.info("aggregate.onboarding.validate", { fingerprint });

  try {
    const preview = await validateOnboardingKey(prisma, parsed.data.apiKey);
    assertNoSecretLeak(preview);
    return NextResponse.json(preview);
  } catch (err) {
    if (err instanceof AggregateApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error("aggregate.onboarding.validate_failed", {
      fingerprint,
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "Onboarding validation failed" }, { status: 502 });
  }
}
