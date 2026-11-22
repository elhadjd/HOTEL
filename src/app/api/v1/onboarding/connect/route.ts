import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { logger } from "@/server/logger";
import {
  AggregateApiError,
  assertNoSecretLeak,
  connectAggregateAccount,
  fingerprintKeyForLog,
} from "@/modules/sigesc-integration/onboarding-exports";

const bodySchema = z.object({
  apiKey: z.string().min(20),
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
    return NextResponse.json({ error: "Invalid Aggregate key payload" }, { status: 400 });
  }

  const fingerprint = fingerprintKeyForLog(parsed.data.apiKey);
  logger.info("aggregate.onboarding.attempt", { fingerprint });

  try {
    const result = await connectAggregateAccount(prisma, parsed.data.apiKey);
    const response = {
      institutionId: result.institutionId,
      connectionId: result.connectionId,
      companiesUpserted: result.companiesUpserted,
      usersUpserted: result.usersUpserted,
      keyPrefix: result.keyPrefix,
      keyName: result.keyName,
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
