import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { addCompanion, removeCompanion } from "@/modules/stays/stay-service";

const bodySchema = z.object({
  action: z.enum(["add", "remove"]),
  guestId: z.string().uuid(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ stayId: string }> },
) {
  const authz = await requireTenant("stays.manage");
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
    return NextResponse.json({ error: "Invalid companion payload" }, { status: 400 });
  }
  try {
    if (parsed.data.action === "add") {
      const companion = await addCompanion(prisma, authz.ctx, stayId, parsed.data.guestId);
      return NextResponse.json({ companion }, { status: 201 });
    }
    const companion = await removeCompanion(prisma, authz.ctx, stayId, parsed.data.guestId);
    return NextResponse.json({ companion });
  } catch (err) {
    return jsonError(err);
  }
}
