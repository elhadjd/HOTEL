import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { logger } from "@/server/logger";
import {
  enforceRateLimit,
  extractClientIp,
  RateLimitError,
} from "@/modules/auth/rate-limit";
import {
  AggregateApiError,
  assertNoSecretLeak,
  confirmOnboardingChallenge,
} from "@/modules/sigesc-integration/onboarding-exports";

const bodySchema = z.object({
  challengeToken: z.string().min(20),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid challenge payload" }, { status: 400 });
  }

  const ip = extractClientIp(request);
  try {
    await enforceRateLimit({
      bucketKey: `onboard-confirm:${ip ?? "unknown"}`,
      limit: 20,
      windowMs: 15 * 60_000,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
  }

  logger.info("aggregate.onboarding.confirm");

  try {
    const result = await confirmOnboardingChallenge(prisma, parsed.data.challengeToken);
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
    logger.error("aggregate.onboarding.confirm_failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "Onboarding confirmation failed" }, { status: 502 });
  }
}
