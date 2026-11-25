import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";
import {
  rotateAggregateApiKey,
  testAggregateConnection,
  syncUsersFromAggregate,
} from "@/modules/sigesc-integration/connection-service";
import { assertNoSecretLeak } from "@/modules/sigesc-integration/sanitize";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("test") }),
  z.object({ action: z.literal("sync_users") }),
  z.object({
    action: z.literal("rotate_key"),
    apiKey: z.string().min(20),
    host: z.string().url().optional(),
  }),
]);

export async function POST(request: Request) {
  const authz = await requireTenant("integrations.sigesc");
  if (!authz.ok) return authz.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid connection action payload" }, { status: 400 });
  }

  try {
    if (parsed.data.action === "test") {
      const result = await testAggregateConnection(prisma, authz.ctx);
      assertNoSecretLeak(result);
      return NextResponse.json(result);
    }
    if (parsed.data.action === "sync_users") {
      const result = await syncUsersFromAggregate(prisma, authz.ctx);
      assertNoSecretLeak(result);
      return NextResponse.json(result);
    }
    const result = await rotateAggregateApiKey(
      prisma,
      authz.ctx,
      parsed.data.apiKey,
      parsed.data.host,
    );
    assertNoSecretLeak(result);
    return NextResponse.json(result);
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
