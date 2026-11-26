import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import {
  resetMembershipPermissions,
  updateMembershipPermissions,
} from "@/modules/staff/staff-service";

const permissionsSchema = z.object({
  permissions: z.array(z.string().min(1).max(120)),
});

export async function PUT(
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
  const parsed = permissionsSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Lista de permissões inválida" }, { status: 400 });
  }
  try {
    const result = await updateMembershipPermissions(
      prisma,
      authz.ctx,
      membershipId,
      parsed.data.permissions,
    );
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ membershipId: string }> },
) {
  const authz = await requireTenant("staff.write");
  if (!authz.ok) return authz.response;
  const { membershipId } = await context.params;
  try {
    const result = await resetMembershipPermissions(prisma, authz.ctx, membershipId);
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err);
  }
}
