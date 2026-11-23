import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import {
  createMaintenanceRequest,
  listMaintenanceRequests,
} from "@/modules/maintenance/maintenance-service";

export async function GET(request: Request) {
  const authz = await requireTenant("maintenance.read");
  if (!authz.ok) return authz.response;
  const url = new URL(request.url);
  try {
    const result = await listMaintenanceRequests(prisma, authz.ctx, {
      hotelId: url.searchParams.get("hotelId") ?? undefined,
      roomId: url.searchParams.get("roomId") ?? undefined,
      status: (url.searchParams.get("status") as never) ?? undefined,
      assignedTo: url.searchParams.get("assignedTo") ?? undefined,
      blocksRoom:
        url.searchParams.get("blocksRoom") === "1"
          ? true
          : url.searchParams.get("blocksRoom") === "0"
            ? false
            : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err);
  }
}

const createSchema = z.object({
  hotelId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  category: z.string().max(64).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).optional(),
  blocksRoom: z.boolean().optional(),
  assignedTo: z.string().max(128).optional(),
  materialsNotes: z.string().max(5000).optional(),
  materialsCost: z.number().nonnegative().optional(),
  scheduledAt: z.string().optional(),
});

export async function POST(request: Request) {
  const authz = await requireTenant("maintenance.manage");
  if (!authz.ok) return authz.response;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid maintenance payload" }, { status: 400 });
  }
  try {
    const requestRow = await createMaintenanceRequest(prisma, authz.ctx, parsed.data);
    return NextResponse.json({ request: requestRow }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
