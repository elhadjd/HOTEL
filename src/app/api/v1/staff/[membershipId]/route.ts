import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import {
  setMembershipStatus,
  updateMembershipRole,
} from "@/modules/staff/staff-service";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setRole"), roleCode: z.string().min(1).max(64) }),
  z.object({
    action: z.literal("setStatus"),
    status: z.enum(["ACTIVE", "SUSPENDED"]),
  }),
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ membershipId: string }> },
) {
  const authz = await requireTenant("staff.write");
  if (!authz.ok) return authz.response;
  const { membershipId } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid staff action" }, { status: 400 });
  }
  try {
    if (parsed.data.action === "setRole") {
      const membership = await updateMembershipRole(
        prisma,
        authz.ctx,
        membershipId,
        parsed.data.roleCode,
      );
      return NextResponse.json({ membership });
    }
    const membership = await setMembershipStatus(
      prisma,
      authz.ctx,
      membershipId,
      parsed.data.status,
    );
    return NextResponse.json({ membership });
  } catch (err) {
    return jsonError(err);
  }
}
