import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import {
  createHousekeepingTask,
  listHousekeepingTasks,
} from "@/modules/housekeeping/housekeeping-service";

export async function GET(request: Request) {
  const authz = await requireTenant("housekeeping.read");
  if (!authz.ok) return authz.response;
  const url = new URL(request.url);
  try {
    const result = await listHousekeepingTasks(prisma, authz.ctx, {
      hotelId: url.searchParams.get("hotelId") ?? undefined,
      roomId: url.searchParams.get("roomId") ?? undefined,
      status: (url.searchParams.get("status") as never) ?? undefined,
      assignedTo: url.searchParams.get("assignedTo") ?? undefined,
      floor: url.searchParams.get("floor") ?? undefined,
      overdueOnly: url.searchParams.get("overdueOnly") === "1",
    });
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err);
  }
}

const createSchema = z.object({
  hotelId: z.string().uuid(),
  roomId: z.string().uuid(),
  kind: z
    .enum(["CLEANING", "INSPECTION", "PREPARATION", "LINEN_CHANGE", "MAINTENANCE_CLEAN", "TURNOVER"])
    .optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  notes: z.string().max(2000).optional(),
  assignedTo: z.string().max(128).optional(),
  deadlineAt: z.string().optional(),
});

export async function POST(request: Request) {
  const authz = await requireTenant("housekeeping.manage");
  if (!authz.ok) return authz.response;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid housekeeping payload" }, { status: 400 });
  }
  try {
    const task = await createHousekeepingTask(prisma, authz.ctx, parsed.data);
    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
