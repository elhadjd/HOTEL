import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { updateMaintenanceStatus } from "@/modules/maintenance/maintenance-service";

const bodySchema = z.object({
  status: z.enum([
    "OPEN",
    "ASSIGNED",
    "IN_PROGRESS",
    "WAITING_PARTS",
    "RESOLVED",
    "CANCELLED",
  ]),
  assignedTo: z.string().max(128).optional(),
  resolution: z.string().max(5000).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid maintenance update" }, { status: 400 });
  }

  const permission =
    parsed.data.status === "RESOLVED" || parsed.data.status === "CANCELLED"
      ? "maintenance.resolve"
      : "maintenance.manage";
  const authz = await requireTenant(permission);
  if (!authz.ok) return authz.response;

  try {
    const row = await updateMaintenanceStatus(prisma, authz.ctx, requestId, parsed.data);
    return NextResponse.json({ request: row });
  } catch (err) {
    return jsonError(err);
  }
}
