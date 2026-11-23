import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";
import {
  listInstitutionRoles,
  listStaffMemberships,
} from "@/modules/staff/staff-service";

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
