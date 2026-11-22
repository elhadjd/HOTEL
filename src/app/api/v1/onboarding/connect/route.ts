import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { logger } from "@/server/logger";
import { enforceRateLimit, RateLimitError } from "@/modules/auth/rate-limit";
import {
  AggregateApiError,
  assertNoSecretLeak,
  connectAggregateAccount,
  fingerprintKeyForLog,
} from "@/modules/sigesc-integration/onboarding-exports";

/**
 * Legacy one-shot connect (validate + confirm). Prefer /validate then /confirm for UX.
 * Still server-side only; never returns the Aggregate key or temporary password.
 */
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
      bucketKey: `onboard-connect:${ip ?? "unknown"}`,
      limit: 10,
      windowMs: 15 * 60_000,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
  }

  const fingerprint = fingerprintKeyForLog(parsed.data.apiKey);
  logger.info("aggregate.onboarding.attempt", { fingerprint });

  try {
    const result = await connectAggregateAccount(prisma, parsed.data.apiKey);
    const response = {
      institutionId: result.institutionId,
      connectionId: result.connectionId,
      administratorEmail: result.administratorEmail,
      administratorName: result.administratorName,
      usersUpserted: result.usersUpserted,
      keyPrefix: result.keyPrefix,
      emailQueued: result.emailQueued,
      alreadyExisted: result.alreadyExisted,
    };
    assertNoSecretLeak(response);
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof AggregateApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error("aggregate.onboarding.failed", {
      fingerprint,
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "Onboarding failed" }, { status: 502 });
  }
}
