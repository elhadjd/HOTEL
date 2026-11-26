import { prisma } from "@/server/db";
import { ensureInstitutionRoles } from "@/modules/iam/ensure-roles";
import { SYSTEM_ROLES } from "@/modules/iam/permissions";

const roleSyncInFlight = new Map<string, Promise<void>>();

function expectedSystemRolePermissions(roleCode: string): readonly string[] | null {
  const def = SYSTEM_ROLES.find((r) => r.code === roleCode);
  return def ? def.permissions : null;
}

async function syncInstitutionSystemRolesOnce(institutionId: string): Promise<void> {
  const existing = roleSyncInFlight.get(institutionId);
  if (existing) {
    await existing;
    return;
  }
  const job = ensureInstitutionRoles(prisma, institutionId)
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      roleSyncInFlight.delete(institutionId);
    });
  roleSyncInFlight.set(institutionId, job);
  await job;
}

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

  let permissions = membership.role.permissions.map((rp) => rp.permission.code);
  if (membership.role.system) {
    const expected = expectedSystemRolePermissions(membership.role.code);
    if (expected) {
      const currentSet = new Set(permissions);
      const missing = expected.filter((code) => !currentSet.has(code));
      if (missing.length > 0) {
        await syncInstitutionSystemRolesOnce(membership.institutionId);
        permissions = [...new Set([...permissions, ...missing])];
      }
    }
  }

  return {
    userId,
    institutionId: membership.institutionId,
    membershipId: membership.id,
    roleCode: membership.role.code,
    permissions,
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
