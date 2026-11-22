import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import {
  assignHousekeepingTask,
  completeHousekeepingTask,
  inspectHousekeepingTask,
  startHousekeepingTask,
} from "@/modules/housekeeping/housekeeping-service";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), assignedTo: z.string().min(1).max(128) }),
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("complete"), requireInspection: z.boolean().optional() }),
  z.object({
    action: z.literal("inspect"),
    approved: z.boolean(),
    notes: z.string().max(2000).optional(),
  }),
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid housekeeping action" }, { status: 400 });
  }

  const permission =
    parsed.data.action === "inspect" ? "housekeeping.inspect" : "housekeeping.manage";
  const authz = await requireTenant(permission);
  if (!authz.ok) return authz.response;

  try {
    if (parsed.data.action === "assign") {
      const task = await assignHousekeepingTask(
        prisma,
        authz.ctx,
        taskId,
        parsed.data.assignedTo,
      );
      return NextResponse.json({ task });
    }
    if (parsed.data.action === "start") {
      const task = await startHousekeepingTask(prisma, authz.ctx, taskId);
      return NextResponse.json({ task });
    }
    if (parsed.data.action === "complete") {
      const task = await completeHousekeepingTask(
        prisma,
        authz.ctx,
        taskId,
        parsed.data.requireInspection ?? true,
      );
      return NextResponse.json({ task });
    }
    const task = await inspectHousekeepingTask(prisma, authz.ctx, taskId, parsed.data);
    return NextResponse.json({ task });
  } catch (err) {
    return jsonError(err);
  }
}
