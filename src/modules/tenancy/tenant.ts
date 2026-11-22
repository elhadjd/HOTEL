import { prisma } from "@/server/db";

export class TenantAccessError extends Error {
  constructor(message = "Cross-tenant access denied") {
    super(message);
    this.name = "TenantAccessError";
  }
}

/**
 * Authoritative tenant context — never trust client-supplied institutionId alone.
 */
export type TenantContext = {
  userId: string;
  institutionId: string;
  membershipId: string;
  roleCode: string;
  permissions: string[];
};

export async function resolveTenantContext(userId: string, institutionId?: string): Promise<TenantContext> {
  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      status: "ACTIVE",
      ...(institutionId ? { institutionId } : {}),
    },
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const membership = memberships[0];
  if (!membership) {
    throw new TenantAccessError("No active membership for this user");
  }

  return {
    userId,
    institutionId: membership.institutionId,
    membershipId: membership.id,
    roleCode: membership.role.code,
    permissions: membership.role.permissions.map((rp) => rp.permission.code),
  };
}

export function assertPermission(ctx: TenantContext, permission: string): void {
  if (ctx.permissions.includes(permission)) return;
  throw new TenantAccessError(`Missing permission: ${permission}`);
}

export function assertSameInstitution(ctx: TenantContext, resourceInstitutionId: string): void {
  if (ctx.institutionId !== resourceInstitutionId) {
    throw new TenantAccessError();
  }
}
