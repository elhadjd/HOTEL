import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { assertPermission } from "@/modules/tenancy/tenant";
import { listNightAuditRuns, runNightAudit } from "@/modules/night-audit/night-audit-service";

export async function GET(request: Request) {
  const authz = await requireTenant("reports.read");
  if (!authz.ok) return authz.response;

  const url = new URL(request.url);
  const hotelId = url.searchParams.get("hotelId") ?? undefined;
  const limitRaw = Number(url.searchParams.get("limit") ?? "30");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 30;

  try {
    const runs = await listNightAuditRuns(prisma, authz.ctx, { hotelId, limit });
    return NextResponse.json({ runs });
  } catch (err) {
    return jsonError(err);
  }
}

const runSchema = z.object({
  hotelId: z.string().uuid(),
  businessDate: z.string().min(8).optional(),
  markNoShows: z.boolean().optional(),
  forceRecalculate: z.boolean().optional(),
});

export async function POST(request: Request) {
  const authz = await requireTenant("reports.read");
  if (!authz.ok) return authz.response;

  try {
    assertPermission(authz.ctx, "stays.manage");
  } catch (err) {
    return jsonError(err);
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = runSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid night audit payload" }, { status: 400 });
  }

  try {
    const result = await runNightAudit(prisma, authz.ctx, parsed.data);
    return NextResponse.json(result, { status: result.alreadyExisted ? 200 : 201 });
  } catch (err) {
    return jsonError(err);
  }
}
