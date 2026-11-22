import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { transferStayRoom } from "@/modules/stays/stay-service";

const bodySchema = z.object({
  toRoomId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ stayId: string }> },
) {
  const authz = await requireTenant("stays.transfer_room");
  if (!authz.ok) return authz.response;
  const { stayId } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid transfer payload" }, { status: 400 });
  }
  try {
    const stay = await transferStayRoom(prisma, authz.ctx, stayId, parsed.data);
    return NextResponse.json({ stay });
  } catch (err) {
    return jsonError(err);
  }
}
