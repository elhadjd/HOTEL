import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import { getStay } from "@/modules/stays/stay-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ stayId: string }> },
) {
  const authz = await requireTenant("stays.read");
  if (!authz.ok) return authz.response;
  const { stayId } = await context.params;
  try {
    const stay = await getStay(prisma, authz.ctx, stayId);
    return NextResponse.json({ stay });
  } catch (err) {
    return jsonError(err);
  }
}
