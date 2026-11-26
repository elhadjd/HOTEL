import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import {
  createStaffUser,
  listInstitutionRoles,
  listStaffMemberships,
} from "@/modules/staff/staff-service";

const createUserSchema = z.object({
  name: z.string().min(2).max(160),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  roleCode: z.string().min(1).max(64),
  mustChangePassword: z.boolean().optional(),
  grantedPermissions: z.array(z.string()).optional(),
  deniedPermissions: z.array(z.string()).optional(),
});

export async function GET(request: Request) {
  const authz = await requireTenant("staff.read");
  if (!authz.ok) return authz.response;
  const url = new URL(request.url);
  try {
    const [memberships, roles] = await Promise.all([
      listStaffMemberships(prisma, authz.ctx, {
        q: url.searchParams.get("q") ?? undefined,
        status: (url.searchParams.get("status") as never) ?? undefined,
      }),
      listInstitutionRoles(prisma, authz.ctx),
    ]);
    return NextResponse.json({ memberships, roles });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  const authz = await requireTenant("staff.write");
  if (!authz.ok) return authz.response;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createUserSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados do utilizador inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  try {
    const membership = await createStaffUser(prisma, authz.ctx, parsed.data);
    return NextResponse.json({ membership }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
