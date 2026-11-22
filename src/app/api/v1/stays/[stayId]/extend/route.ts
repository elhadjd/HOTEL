import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { extendStay, markEarlyDepartureDate } from "@/modules/stays/stay-service";

const bodySchema = z.object({
  kind: z.enum(["EXTENSION", "EARLY_DEPARTURE"]),
  newDeparture: z.string().min(8),
  reason: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ stayId: string }> },
) {
  const authz = await requireTenant("stays.extend");
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
    return NextResponse.json({ error: "Invalid date-change payload" }, { status: 400 });
  }
  try {
    const stay =
      parsed.data.kind === "EXTENSION"
        ? await extendStay(prisma, authz.ctx, stayId, parsed.data)
        : await markEarlyDepartureDate(prisma, authz.ctx, stayId, parsed.data);
    return NextResponse.json({ stay });
  } catch (err) {
    return jsonError(err);
  }
}
